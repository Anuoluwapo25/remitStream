#![no_std]
//! RemitStream AutoSplitRouter
//!
//! Sits in front of every incoming remittance and splits it according to a rule the
//! *recipient* controls: a configurable share goes straight into the SavingsVault,
//! the remainder lands in the recipient's wallet ready to cash out.
//!
//! The recipient owns their own rule — a sender cannot change how much gets saved.

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype,
    panic_with_error, token, Address, Env,
};

const DAY_IN_LEDGERS: u32 = 17_280;
const INSTANCE_BUMP: u32 = 30 * DAY_IN_LEDGERS;
const INSTANCE_THRESHOLD: u32 = INSTANCE_BUMP - DAY_IN_LEDGERS;
const PERSISTENT_BUMP: u32 = 90 * DAY_IN_LEDGERS;
const PERSISTENT_THRESHOLD: u32 = PERSISTENT_BUMP - DAY_IN_LEDGERS;

/// Basis points denominator: 10_000 bps == 100%.
pub const BPS_DENOMINATOR: u32 = 10_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    /// save_bps must be between 0 and 10_000 inclusive.
    InvalidSplit = 4,
    /// Sender and recipient must differ.
    SelfTransfer = 5,
}

/// Minimal view of the SavingsVault this router credits.
#[contractclient(name = "VaultClient")]
pub trait VaultInterface {
    fn credit(env: Env, beneficiary: Address, amount: i128);
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub vault: Address,
    pub token: Address,
}

/// A recipient's savings rule. Defaults to 0% saved until they opt in.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Rule {
    pub save_bps: u32,
    pub enabled: bool,
}

/// Lifetime totals per recipient, used by the dashboard.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Stats {
    pub total_received: i128,
    pub total_saved: i128,
    pub transfers: u32,
}

/// Result of a split, returned to the caller so the UI can show the breakdown.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Split {
    pub payout: i128,
    pub saved: i128,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Config,
    Rule(Address),
    Stats(Address),
}

/// Emitted when a recipient changes their savings rule.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RuleSet {
    #[topic]
    pub recipient: Address,
    pub save_bps: u32,
}

/// Emitted for every routed remittance. Indexed by both parties so the dashboard
/// can query a user's sent and received history.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Routed {
    #[topic]
    pub sender: Address,
    #[topic]
    pub recipient: Address,
    pub amount: i128,
    pub payout: i128,
    pub saved: i128,
}

#[contract]
pub struct AutoSplitRouter;

#[contractimpl]
impl AutoSplitRouter {
    pub fn initialize(env: Env, admin: Address, vault: Address, token: Address) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        env.storage().instance().set(
            &DataKey::Config,
            &Config {
                admin,
                vault,
                token,
            },
        );
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
    }

    /// Set the caller's own savings rule. `save_bps` is in basis points (2_000 == 20%).
    pub fn set_rule(env: Env, recipient: Address, save_bps: u32) {
        recipient.require_auth();
        if save_bps > BPS_DENOMINATOR {
            panic_with_error!(&env, Error::InvalidSplit);
        }

        let rule = Rule {
            save_bps,
            enabled: save_bps > 0,
        };
        let key = DataKey::Rule(recipient.clone());
        env.storage().persistent().set(&key, &rule);
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_BUMP);

        RuleSet {
            recipient,
            save_bps,
        }
        .publish(&env);
    }

    /// Send `amount` to `recipient`, splitting it per the recipient's rule.
    ///
    /// The router pulls the full amount, forwards the spendable part to the recipient,
    /// and pushes the saved part into the vault before crediting the recipient's shares.
    pub fn route(env: Env, sender: Address, recipient: Address, amount: i128) -> Split {
        sender.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        if sender == recipient {
            panic_with_error!(&env, Error::SelfTransfer);
        }

        let cfg = Self::config(env.clone());
        let rule = Self::get_rule(env.clone(), recipient.clone());
        let router = env.current_contract_address();
        let token_client = token::TokenClient::new(&env, &cfg.token);

        let saved = if rule.enabled {
            amount * i128::from(rule.save_bps) / i128::from(BPS_DENOMINATOR)
        } else {
            0
        };
        let payout = amount - saved;

        // Pull the whole remittance in, then fan it out. Only the sender signs.
        token_client.transfer(&sender, &router, &amount);

        if payout > 0 {
            token_client.transfer(&router, &recipient, &payout);
        }
        if saved > 0 {
            token_client.transfer(&router, &cfg.vault, &saved);
            VaultClient::new(&env, &cfg.vault).credit(&recipient, &saved);
        }

        Self::bump_stats(&env, &recipient, amount, saved);

        Routed {
            sender,
            recipient,
            amount,
            payout,
            saved,
        }
        .publish(&env);

        Split { payout, saved }
    }

    /// Preview a split without moving funds — used by the UI before confirmation.
    pub fn quote(env: Env, recipient: Address, amount: i128) -> Split {
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let rule = Self::get_rule(env, recipient);
        let saved = if rule.enabled {
            amount * i128::from(rule.save_bps) / i128::from(BPS_DENOMINATOR)
        } else {
            0
        };
        Split {
            payout: amount - saved,
            saved,
        }
    }

    pub fn get_rule(env: Env, recipient: Address) -> Rule {
        env.storage()
            .persistent()
            .get(&DataKey::Rule(recipient))
            .unwrap_or(Rule {
                save_bps: 0,
                enabled: false,
            })
    }

    pub fn get_stats(env: Env, recipient: Address) -> Stats {
        env.storage()
            .persistent()
            .get(&DataKey::Stats(recipient))
            .unwrap_or(Stats {
                total_received: 0,
                total_saved: 0,
                transfers: 0,
            })
    }

    pub fn config(env: Env) -> Config {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized))
    }

    fn bump_stats(env: &Env, recipient: &Address, amount: i128, saved: i128) {
        let mut stats = Self::get_stats(env.clone(), recipient.clone());
        stats.total_received += amount;
        stats.total_saved += saved;
        stats.transfers += 1;

        let key = DataKey::Stats(recipient.clone());
        env.storage().persistent().set(&key, &stats);
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_BUMP);
    }
}

mod test;
