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
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, Env,
};

const DAY_IN_LEDGERS: u32 = 17_280;
const INSTANCE_BUMP: u32 = 30 * DAY_IN_LEDGERS;
const INSTANCE_THRESHOLD: u32 = INSTANCE_BUMP - DAY_IN_LEDGERS;
const PERSISTENT_BUMP: u32 = 90 * DAY_IN_LEDGERS;
const PERSISTENT_THRESHOLD: u32 = PERSISTENT_BUMP - DAY_IN_LEDGERS;

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

        token::TokenClient::new(&env, &cfg.token).transfer(
            &env.current_contract_address(),
            &user,
            &amount,
        );

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
