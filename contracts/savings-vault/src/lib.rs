#![no_std]
//! RemitStream SavingsVault
//!
//! A share-based savings vault that holds the portion of an incoming remittance the
//! recipient chose not to cash out. Yield is distributed by increasing the vault's
//! accounted assets without minting new shares, which raises the value of every
//! existing share proportionally.
//!
//! Accounting model:
//!   share_price = total_assets / total_shares
//!   A deposit of `amount` mints `amount * total_shares / total_assets` shares.
//!   Yield accrual raises `total_assets` only, so all holders gain pro rata.

use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, panic_with_error,
    token, vec, Address, Env, IntoVal, Map, Symbol, Vec,
};

const DAY_IN_LEDGERS: u32 = 17_280;
const INSTANCE_BUMP: u32 = 30 * DAY_IN_LEDGERS;
const INSTANCE_THRESHOLD: u32 = INSTANCE_BUMP - DAY_IN_LEDGERS;
const PERSISTENT_BUMP: u32 = 90 * DAY_IN_LEDGERS;
const PERSISTENT_THRESHOLD: u32 = PERSISTENT_BUMP - DAY_IN_LEDGERS;

/// Blend `Request.request_type` for a plain (non-collateralized) deposit —
/// the vault only ever lends, never borrows against what it parks.
const BLEND_REQUEST_SUPPLY: u32 = 0;
/// Blend `Request.request_type` for withdrawing a plain deposit.
const BLEND_REQUEST_WITHDRAW: u32 = 1;
/// Blend's b_rate (b-token -> underlying exchange rate) is a 12-decimal
/// fixed-point number. Verified against blend-contracts-v2's `Reserve`
/// conversion math (`to_asset_from_b_token`), not guessed.
const BLEND_RATE_SCALAR: i128 = 1_000_000_000_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    InsufficientBalance = 4,
    /// `credit` was called but the tokens never actually landed in the vault.
    FundsNotReceived = 5,
    /// Yield cannot be distributed when there are no shares to distribute it to.
    NoDepositors = 6,
    RouterNotSet = 7,
    /// `invest` / `sync_yield` called before an admin configured a Blend pool.
    YieldPoolNotSet = 8,
    /// Refusing to point the vault at a different pool while it still has a
    /// deployed position in the current one — swapping would strand funds.
    YieldPoolFunded = 9,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub token: Address,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Config,
    Router,
    TotalShares,
    TotalAssets,
    Shares(Address),
    /// The Blend pool the vault parks idle savings in. Unset means the vault
    /// behaves exactly as it always has — local balance only, admin-pushed
    /// `accrue_yield`.
    YieldPool,
    /// Underlying-equivalent value the vault expects to hold in the yield
    /// pool from principal flows (`invest` / withdraw top-ups) alone. The gap
    /// between this and the pool's real current value is interest — that gap
    /// is what `sync_yield` turns into accounted assets.
    BlendBaseline,
}

// ---- Blend pool interface -------------------------------------------------
//
// Mirrors blend-contracts-v2's public `Pool` trait exactly (field names,
// order, and the request-type/b_rate constants above), verified against
// blend-capital/blend-contracts-v2 on GitHub. Declared locally rather than
// pulled in via the `blend-contract-sdk` crate because that crate currently
// pins soroban-sdk 25.x while this workspace is on 27.x — cross-contract
// calls only need ABI-compatible types, not a shared Rust dependency, so a
// local mirror avoids a real version conflict instead of papering over it.

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BlendRequest {
    pub request_type: u32,
    pub address: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BlendPositions {
    pub liabilities: Map<u32, i128>,
    pub collateral: Map<u32, i128>,
    pub supply: Map<u32, i128>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BlendReserveConfig {
    pub index: u32,
    pub decimals: u32,
    pub c_factor: u32,
    pub l_factor: u32,
    pub util: u32,
    pub max_util: u32,
    pub r_base: u32,
    pub r_one: u32,
    pub r_two: u32,
    pub r_three: u32,
    pub reactivity: u32,
    pub supply_cap: i128,
    pub enabled: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BlendReserveData {
    pub d_rate: i128,
    pub b_rate: i128,
    pub ir_mod: i128,
    pub b_supply: i128,
    pub d_supply: i128,
    pub backstop_credit: i128,
    pub last_time: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BlendReserve {
    pub asset: Address,
    pub config: BlendReserveConfig,
    pub data: BlendReserveData,
    pub scalar: i128,
}

/// The handful of Blend pool entry points the vault needs: deposit/withdraw
/// via `submit`, plus the two read-only views used to price the position.
#[contractclient(name = "BlendPoolClient")]
pub trait BlendPoolInterface {
    fn submit(
        env: Env,
        from: Address,
        spender: Address,
        to: Address,
        requests: Vec<BlendRequest>,
    ) -> BlendPositions;
    fn get_reserve(env: Env, asset: Address) -> BlendReserve;
    fn get_positions(env: Env, address: Address) -> BlendPositions;
}

/// Emitted when a user deposits directly into the vault.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Deposit {
    #[topic]
    pub beneficiary: Address,
    pub amount: i128,
    pub shares: i128,
}

/// Emitted when the router credits savings split off a remittance.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Credit {
    #[topic]
    pub beneficiary: Address,
    pub amount: i128,
    pub shares: i128,
}

/// Emitted when a user withdraws underlying assets.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Withdraw {
    #[topic]
    pub user: Address,
    pub amount: i128,
    pub shares: i128,
}

/// Emitted when yield is distributed across all shareholders.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct YieldAccrued {
    pub amount: i128,
    pub total_assets: i128,
}

#[contract]
pub struct SavingsVault;

#[contractimpl]
impl SavingsVault {
    /// One-time setup. `admin` may set the router and distribute yield.
    pub fn initialize(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&DataKey::Config, &Config { admin, token });
        env.storage().instance().set(&DataKey::TotalShares, &0i128);
        env.storage().instance().set(&DataKey::TotalAssets, &0i128);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
    }

    /// Authorize the AutoSplitRouter that may `credit` this vault.
    pub fn set_router(env: Env, router: Address) {
        let cfg = Self::config(env.clone());
        cfg.admin.require_auth();
        env.storage().instance().set(&DataKey::Router, &router);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
    }

    /// Point the vault at a Blend lending pool for real, protocol-generated
    /// yield. Refuses to replace a pool that still has a deployed position —
    /// `invest` everything back out (or let `withdraw` drain it) first, so a
    /// pool swap can never strand funds.
    pub fn set_yield_pool(env: Env, pool: Address) {
        let cfg = Self::config(env.clone());
        cfg.admin.require_auth();
        if Self::yield_pool(env.clone()).is_some() && Self::blend_baseline(env.clone()) != 0 {
            panic_with_error!(&env, Error::YieldPoolFunded);
        }
        env.storage().instance().set(&DataKey::YieldPool, &pool);
        env.storage().instance().set(&DataKey::BlendBaseline, &0i128);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
    }

    /// Move `amount` of the vault's idle local balance into the configured
    /// Blend pool as a plain (non-collateralized) supply — the vault only
    /// ever lends what recipients saved, never borrows against it. Admin-only
    /// and capped at the vault's real local balance, so it can't overdraw.
    pub fn invest(env: Env, amount: i128) {
        let cfg = Self::config(env.clone());
        cfg.admin.require_auth();
        Self::require_positive(&env, amount);
        let pool = Self::yield_pool(env.clone())
            .unwrap_or_else(|| panic_with_error!(&env, Error::YieldPoolNotSet));

        let vault_address = env.current_contract_address();
        let local = token::TokenClient::new(&env, &cfg.token).balance(&vault_address);
        if amount > local {
            panic_with_error!(&env, Error::InsufficientBalance);
        }

        let requests = vec![
            &env,
            BlendRequest {
                request_type: BLEND_REQUEST_SUPPLY,
                address: cfg.token.clone(),
                amount,
            },
        ];
        // `pool.submit` moves tokens by calling `token.transfer(spender, pool, amount)`
        // *from inside the pool contract* — a call two hops from here (vault -> pool
        // -> token), which a contract's own address cannot auto-authorize the way it
        // can a direct one-hop call. This pre-authorizes that specific nested call on
        // the vault's behalf; the shape (contract/fn_name/args) must match Blend's
        // real internal call exactly, verified against blend-contracts-v2's
        // `handle_transfers` rather than assumed.
        env.authorize_as_current_contract(vec![
            &env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: cfg.token.clone(),
                    fn_name: Symbol::new(&env, "transfer"),
                    args: vec![
                        &env,
                        vault_address.clone().into_val(&env),
                        pool.clone().into_val(&env),
                        amount.into_val(&env),
                    ],
                },
                sub_invocations: vec![&env],
            }),
        ]);
        BlendPoolClient::new(&env, &pool).submit(
            &vault_address,
            &vault_address,
            &vault_address,
            &requests,
        );

        let baseline = Self::blend_baseline(env.clone()) + amount;
        env.storage().instance().set(&DataKey::BlendBaseline, &baseline);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
    }

    /// Reconcile accounted assets with what the vault's Blend position is
    /// really worth right now, crediting the gap as yield (no shares minted,
    /// same as `accrue_yield`) so every share gains pro rata. Permissionless
    /// — it only ever raises `total_assets` to match value that Blend's own
    /// reserve data proves the vault holds, so anyone can "poke" it. A no-op
    /// before there are depositors, so an early poke can't orphan value with
    /// no shareholder to receive it.
    pub fn sync_yield(env: Env) -> i128 {
        let cfg = Self::config(env.clone());
        let pool = Self::yield_pool(env.clone())
            .unwrap_or_else(|| panic_with_error!(&env, Error::YieldPoolNotSet));
        if Self::total_shares(env.clone()) == 0 {
            return 0;
        }

        let vault_address = env.current_contract_address();
        let client = BlendPoolClient::new(&env, &pool);
        let reserve = client.get_reserve(&cfg.token);
        let positions = client.get_positions(&vault_address);
        let b_tokens = positions.supply.get(reserve.config.index).unwrap_or(0);
        // Floor, matching Blend's own `to_asset_from_b_token` — the vault
        // never counts more than the pool would actually hand back.
        let current_value = b_tokens * reserve.data.b_rate / BLEND_RATE_SCALAR;

        let baseline = Self::blend_baseline(env.clone());
        if current_value <= baseline {
            return 0;
        }
        let gained = current_value - baseline;

        let total_assets = Self::total_assets(env.clone()) + gained;
        env.storage()
            .instance()
            .set(&DataKey::TotalAssets, &total_assets);
        env.storage()
            .instance()
            .set(&DataKey::BlendBaseline, &current_value);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);

        YieldAccrued {
            amount: gained,
            total_assets,
        }
        .publish(&env);
        gained
    }

    /// Deposit directly into the vault, pulling `amount` from `from`.
    /// `beneficiary` receives the shares, so a sender can fund someone else's savings.
    pub fn deposit(env: Env, from: Address, beneficiary: Address, amount: i128) {
        from.require_auth();
        Self::require_positive(&env, amount);

        let cfg = Self::config(env.clone());
        let assets_before = Self::total_assets(env.clone());

        token::TokenClient::new(&env, &cfg.token).transfer(
            &from,
            &env.current_contract_address(),
            &amount,
        );

        let shares = Self::mint_shares(&env, &beneficiary, amount, assets_before);
        Deposit {
            beneficiary,
            amount,
            shares,
        }
        .publish(&env);
    }

    /// Credit a beneficiary for tokens the router has *already* transferred in.
    ///
    /// Only the configured router may call this. The vault independently verifies the
    /// tokens arrived by checking its own on-chain balance against accounted assets,
    /// so a compromised router still cannot mint shares out of thin air.
    pub fn credit(env: Env, beneficiary: Address, amount: i128) {
        let router: Address = env
            .storage()
            .instance()
            .get(&DataKey::Router)
            .unwrap_or_else(|| panic_with_error!(&env, Error::RouterNotSet));
        router.require_auth();
        Self::require_positive(&env, amount);

        let cfg = Self::config(env.clone());
        let assets_before = Self::total_assets(env.clone());
        let on_chain = token::TokenClient::new(&env, &cfg.token)
            .balance(&env.current_contract_address());

        if on_chain < assets_before + amount {
            panic_with_error!(&env, Error::FundsNotReceived);
        }

        let shares = Self::mint_shares(&env, &beneficiary, amount, assets_before);
        Credit {
            beneficiary,
            amount,
            shares,
        }
        .publish(&env);
    }

    /// Withdraw `amount` of underlying assets, burning the matching shares.
    pub fn withdraw(env: Env, user: Address, amount: i128) {
        user.require_auth();
        Self::require_positive(&env, amount);

        let cfg = Self::config(env.clone());
        let total_assets = Self::total_assets(env.clone());
        let total_shares = Self::total_shares(env.clone());
        let user_shares = Self::shares_of(env.clone(), user.clone());

        if total_shares == 0 || total_assets == 0 {
            panic_with_error!(&env, Error::InsufficientBalance);
        }

        let user_assets = user_shares * total_assets / total_shares;
        if amount > user_assets {
            panic_with_error!(&env, Error::InsufficientBalance);
        }

        // Round the burn up so rounding dust always favours the vault, never the withdrawer.
        let mut burn = (amount * total_shares + total_assets - 1) / total_assets;
        if burn > user_shares {
            burn = user_shares;
        }

        Self::set_shares(&env, &user, user_shares - burn);
        env.storage()
            .instance()
            .set(&DataKey::TotalShares, &(total_shares - burn));
        env.storage()
            .instance()
            .set(&DataKey::TotalAssets, &(total_assets - amount));

        // Most withdrawals fit in whatever the vault already holds locally —
        // no reason to touch Blend for a small, routine cash-out. Only a
        // shortfall pulls from the yield pool, and only for exactly the gap.
        let vault_address = env.current_contract_address();
        let token_client = token::TokenClient::new(&env, &cfg.token);
        let local = token_client.balance(&vault_address);
        if local < amount {
            if let Some(pool) = Self::yield_pool(env.clone()) {
                let shortfall = amount - local;
                let requests = vec![
                    &env,
                    BlendRequest {
                        request_type: BLEND_REQUEST_WITHDRAW,
                        address: cfg.token.clone(),
                        amount: shortfall,
                    },
                ];
                BlendPoolClient::new(&env, &pool).submit(
                    &vault_address,
                    &vault_address,
                    &vault_address,
                    &requests,
                );
                let baseline = Self::blend_baseline(env.clone());
                let baseline = if shortfall > baseline { 0 } else { baseline - shortfall };
                env.storage().instance().set(&DataKey::BlendBaseline, &baseline);
            }
            // No yield pool configured: fall through. `transfer` below panics
            // with the token contract's own insufficient-balance error,
            // exactly as it always has.
        }

        token_client.transfer(&vault_address, &user, &amount);

        Withdraw {
            user,
            amount,
            shares: burn,
        }
        .publish(&env);
    }

    /// Withdraw the caller's entire balance.
    pub fn withdraw_all(env: Env, user: Address) {
        let balance = Self::balance_of(env.clone(), user.clone());
        Self::withdraw(env, user, balance);
    }

    /// Distribute yield to all shareholders by pulling `amount` from the admin.
    /// Mints no shares, so every existing share becomes worth proportionally more.
    pub fn accrue_yield(env: Env, amount: i128) {
        let cfg = Self::config(env.clone());
        cfg.admin.require_auth();
        Self::require_positive(&env, amount);

        if Self::total_shares(env.clone()) == 0 {
            panic_with_error!(&env, Error::NoDepositors);
        }

        token::TokenClient::new(&env, &cfg.token).transfer(
            &cfg.admin,
            &env.current_contract_address(),
            &amount,
        );

        let total_assets = Self::total_assets(env.clone()) + amount;
        env.storage()
            .instance()
            .set(&DataKey::TotalAssets, &total_assets);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);

        YieldAccrued {
            amount,
            total_assets,
        }
        .publish(&env);
    }

    // ---- read-only views ----

    /// A user's balance in underlying assets, including accrued yield.
    pub fn balance_of(env: Env, user: Address) -> i128 {
        let total_shares = Self::total_shares(env.clone());
        if total_shares == 0 {
            return 0;
        }
        Self::shares_of(env.clone(), user) * Self::total_assets(env) / total_shares
    }

    pub fn shares_of(env: Env, user: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Shares(user))
            .unwrap_or(0)
    }

    pub fn total_assets(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalAssets)
            .unwrap_or(0)
    }

    pub fn total_shares(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalShares)
            .unwrap_or(0)
    }

    /// The Blend pool the vault is configured to invest in, if any.
    pub fn yield_pool(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::YieldPool)
    }

    /// Underlying-equivalent value the vault expects from Blend based on
    /// principal flows alone — see `DataKey::BlendBaseline`.
    pub fn blend_baseline(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::BlendBaseline)
            .unwrap_or(0)
    }

    pub fn config(env: Env) -> Config {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized))
    }

    pub fn router(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Router)
    }

    // ---- internals ----

    fn mint_shares(env: &Env, to: &Address, amount: i128, assets_before: i128) -> i128 {
        let total_shares = Self::total_shares(env.clone());
        let shares = if total_shares == 0 || assets_before == 0 {
            amount
        } else {
            amount * total_shares / assets_before
        };

        Self::set_shares(env, to, Self::shares_of(env.clone(), to.clone()) + shares);
        env.storage()
            .instance()
            .set(&DataKey::TotalShares, &(total_shares + shares));
        env.storage()
            .instance()
            .set(&DataKey::TotalAssets, &(assets_before + amount));
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
        shares
    }

    fn set_shares(env: &Env, user: &Address, shares: i128) {
        let key = DataKey::Shares(user.clone());
        env.storage().persistent().set(&key, &shares);
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_BUMP);
    }

    fn require_positive(env: &Env, amount: i128) {
        if amount <= 0 {
            panic_with_error!(env, Error::InvalidAmount);
        }
    }
}

mod test;
