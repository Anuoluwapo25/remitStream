#![no_std]
//! RemitStream test stablecoin (SEP-41 compatible).
//!
//! On mainnet RemitStream settles in real USDC. On testnet, using the classic USDC
//! asset would force every demo user through a trustline setup before they could
//! receive anything — unacceptable friction for onboarding. This is a pure Soroban
//! token instead: balances live in contract storage, so any address can receive
//! funds immediately with no trustline.
//!
//! It also exposes a rate-limited `faucet` so pilot users can self-fund.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, Address,
    Env, String,
};

const DAY_IN_LEDGERS: u32 = 17_280;
const INSTANCE_BUMP: u32 = 30 * DAY_IN_LEDGERS;
const INSTANCE_THRESHOLD: u32 = INSTANCE_BUMP - DAY_IN_LEDGERS;
const PERSISTENT_BUMP: u32 = 90 * DAY_IN_LEDGERS;
const PERSISTENT_THRESHOLD: u32 = PERSISTENT_BUMP - DAY_IN_LEDGERS;

/// 7 decimals, matching Stellar's native precision.
pub const DECIMALS: u32 = 7;
/// Each faucet claim hands out 1,000.0000000 tokens.
pub const FAUCET_AMOUNT: i128 = 1_000 * 10_000_000;
/// Roughly 6 hours between claims per address.
pub const FAUCET_COOLDOWN_LEDGERS: u32 = DAY_IN_LEDGERS / 4;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    InsufficientBalance = 4,
    InsufficientAllowance = 5,
    /// Allowance expiration ledger is already in the past.
    InvalidExpiration = 6,
    /// Faucet claimed again before the cooldown elapsed.
    FaucetCooldown = 7,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Balance(Address),
    Allowance(AllowanceKey),
    LastClaim(Address),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AllowanceKey {
    pub from: Address,
    pub spender: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AllowanceValue {
    pub amount: i128,
    pub expiration_ledger: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Transfer {
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Mint {
    #[topic]
    pub to: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Burn {
    #[topic]
    pub from: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Approve {
    #[topic]
    pub from: Address,
    #[topic]
    pub spender: Address,
    pub amount: i128,
    pub expiration_ledger: u32,
}

#[contract]
pub struct RemitToken;

#[contractimpl]
impl RemitToken {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
    }

    pub fn mint(env: Env, to: Address, amount: i128) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        admin.require_auth();
        Self::require_positive(&env, amount);

        Self::add_balance(&env, &to, amount);
        Mint { to, amount }.publish(&env);
    }

    /// Self-service testnet funding, rate limited per address.
    pub fn faucet(env: Env, to: Address) {
        to.require_auth();

        let now = env.ledger().sequence();
        if let Some(last) = env
            .storage()
            .temporary()
            .get::<DataKey, u32>(&DataKey::LastClaim(to.clone()))
        {
            if now < last + FAUCET_COOLDOWN_LEDGERS {
                panic_with_error!(&env, Error::FaucetCooldown);
            }
        }

        let key = DataKey::LastClaim(to.clone());
        env.storage().temporary().set(&key, &now);
        env.storage()
            .temporary()
            .extend_ttl(&key, FAUCET_COOLDOWN_LEDGERS, FAUCET_COOLDOWN_LEDGERS);

        Self::add_balance(&env, &to, FAUCET_AMOUNT);
        Mint {
            to,
            amount: FAUCET_AMOUNT,
        }
        .publish(&env);
    }

    // ---- SEP-41 ----

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        Self::require_positive(&env, amount);
        Self::move_balance(&env, &from, &to, amount);
        Transfer { from, to, amount }.publish(&env);
    }

    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        Self::require_positive(&env, amount);
        Self::spend_allowance(&env, &from, &spender, amount);
        Self::move_balance(&env, &from, &to, amount);
        Transfer { from, to, amount }.publish(&env);
    }

    pub fn approve(
        env: Env,
        from: Address,
        spender: Address,
        amount: i128,
        expiration_ledger: u32,
    ) {
        from.require_auth();
        if amount < 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        if amount > 0 && expiration_ledger < env.ledger().sequence() {
            panic_with_error!(&env, Error::InvalidExpiration);
        }

        let key = DataKey::Allowance(AllowanceKey {
            from: from.clone(),
            spender: spender.clone(),
        });
        env.storage().temporary().set(
            &key,
            &AllowanceValue {
                amount,
                expiration_ledger,
            },
        );
        if amount > 0 {
            let live_for = expiration_ledger.saturating_sub(env.ledger().sequence());
            env.storage().temporary().extend_ttl(&key, live_for, live_for);
        }

        Approve {
            from,
            spender,
            amount,
            expiration_ledger,
        }
        .publish(&env);
    }

    pub fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        Self::load_allowance(&env, &from, &spender).amount
    }

    pub fn burn(env: Env, from: Address, amount: i128) {
        from.require_auth();
        Self::require_positive(&env, amount);
        Self::sub_balance(&env, &from, amount);
        Burn { from, amount }.publish(&env);
    }

    pub fn burn_from(env: Env, spender: Address, from: Address, amount: i128) {
        spender.require_auth();
        Self::require_positive(&env, amount);
        Self::spend_allowance(&env, &from, &spender, amount);
        Self::sub_balance(&env, &from, amount);
        Burn { from, amount }.publish(&env);
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(id))
            .unwrap_or(0)
    }

    pub fn decimals(_env: Env) -> u32 {
        DECIMALS
    }

    pub fn name(env: Env) -> String {
        String::from_str(&env, "RemitStream USD")
    }

    pub fn symbol(env: Env) -> String {
        String::from_str(&env, "rUSDC")
    }

    // ---- internals ----

    fn load_allowance(env: &Env, from: &Address, spender: &Address) -> AllowanceValue {
        let key = DataKey::Allowance(AllowanceKey {
            from: from.clone(),
            spender: spender.clone(),
        });
        env.storage()
            .temporary()
            .get::<DataKey, AllowanceValue>(&key)
            .filter(|a| a.expiration_ledger >= env.ledger().sequence())
            .unwrap_or(AllowanceValue {
                amount: 0,
                expiration_ledger: 0,
            })
    }

    fn spend_allowance(env: &Env, from: &Address, spender: &Address, amount: i128) {
        let mut allowance = Self::load_allowance(env, from, spender);
        if allowance.amount < amount {
            panic_with_error!(env, Error::InsufficientAllowance);
        }
        allowance.amount -= amount;

        let key = DataKey::Allowance(AllowanceKey {
            from: from.clone(),
            spender: spender.clone(),
        });
        env.storage().temporary().set(&key, &allowance);
    }

    fn move_balance(env: &Env, from: &Address, to: &Address, amount: i128) {
        Self::sub_balance(env, from, amount);
        Self::add_balance(env, to, amount);
    }

    fn add_balance(env: &Env, id: &Address, amount: i128) {
        let key = DataKey::Balance(id.clone());
        let balance = Self::balance(env.clone(), id.clone()) + amount;
        env.storage().persistent().set(&key, &balance);
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_BUMP);
    }

    fn sub_balance(env: &Env, id: &Address, amount: i128) {
        let balance = Self::balance(env.clone(), id.clone());
        if balance < amount {
            panic_with_error!(env, Error::InsufficientBalance);
        }
        let key = DataKey::Balance(id.clone());
        env.storage().persistent().set(&key, &(balance - amount));
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
