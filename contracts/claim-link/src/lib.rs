#![no_std]
//! RemitStream ClaimLink — send money to someone who has no wallet yet.
//!
//! Every other contract in this suite assumes the recipient already has a
//! Stellar address. For a remittance product that is the whole problem:
//! the person on the other end is often exactly the person *without* one.
//! Requiring an address up front means the sender has to wait for the
//! recipient to install a wallet, generate a key, and send it back before
//! any money can move.
//!
//! ClaimLink removes that step. The sender locks funds behind a secret —
//! sixteen random bytes, chosen on their own device — and only its sha256
//! hash goes on-chain. The secret itself travels however the sender already
//! reaches the recipient: a text message, a WhatsApp link, a QR code. The
//! recipient's page reads it out of a URL fragment (never sent to any
//! server) and, once they have or create a wallet, submits it to `claim`.
//!
//! `claim` deliberately requires no signature from the recipient. Producing
//! the secret *is* the authorization — the same trust model as a gift card,
//! a claim check, or a cash-pickup code. This is a feature, not an oversight:
//! it is what lets someone with no Stellar account yet be the first to touch
//! this contract at all. The security property it relies on is the same one
//! every claim-code scheme relies on: keep the secret private until the
//! right person redeems it.
//!
//! If nobody claims it before the sender's chosen deadline, the sender takes
//! it back with `reclaim`. A claim with no deadline never expires and can
//! never be reclaimed — the sender is committing the funds unconditionally
//! until someone, someday, produces the secret.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, Bytes, BytesN, Env, String,
};

const DAY_IN_LEDGERS: u32 = 17_280;
const INSTANCE_BUMP: u32 = 30 * DAY_IN_LEDGERS;
const INSTANCE_THRESHOLD: u32 = INSTANCE_BUMP - DAY_IN_LEDGERS;
const PERSISTENT_BUMP: u32 = 90 * DAY_IN_LEDGERS;
const PERSISTENT_THRESHOLD: u32 = PERSISTENT_BUMP - DAY_IN_LEDGERS;

/// Longest a claim's note may be, in bytes.
pub const MAX_NOTE_LEN: u32 = 140;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    ClaimNotFound = 4,
    /// The provided secret's hash doesn't match the one the claim was created with.
    WrongSecret = 5,
    /// The claim was already claimed or reclaimed.
    AlreadyResolved = 6,
    /// `claim` was called after the sender's chosen deadline passed.
    Expired = 7,
    /// `reclaim` was called before the deadline, or on a claim with none.
    NotExpired = 8,
    /// A note is longer than `MAX_NOTE_LEN`.
    NoteTooLong = 9,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub token: Address,
}

/// Lifecycle of a claim.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ClaimStatus {
    /// Funds are locked, waiting for the secret.
    Pending,
    /// Successfully redeemed.
    Claimed,
    /// Taken back by the sender after expiry.
    Reclaimed,
}

/// A single locked transfer, redeemable by whoever produces the secret whose
/// sha256 hash is `secret_hash`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Claim {
    pub sender: Address,
    pub amount: i128,
    pub secret_hash: BytesN<32>,
    /// Unix seconds after which the sender may reclaim. 0 means no deadline —
    /// the claim never expires and can never be reclaimed.
    pub expires_at: u64,
    /// A short message the recipient sees when they open the link.
    pub note: String,
    pub status: ClaimStatus,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Config,
    NextId,
    Claim(u64),
}

/// Emitted when a sender locks a new claim.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ClaimCreated {
    #[topic]
    pub sender: Address,
    pub claim_id: u64,
    pub amount: i128,
    pub expires_at: u64,
}

/// Emitted when a claim is successfully redeemed.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Redeemed {
    #[topic]
    pub to: Address,
    pub claim_id: u64,
    pub amount: i128,
}

/// Emitted when a sender takes back an expired, unclaimed claim.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Reclaimed {
    #[topic]
    pub sender: Address,
    pub claim_id: u64,
    pub amount: i128,
}

#[contract]
pub struct ClaimLink;

#[contractimpl]
impl ClaimLink {
    pub fn initialize(env: Env, token: Address) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Config, &Config { token });
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
    }

    /// Lock `amount` behind `secret_hash`, the sha256 hash of a secret only
    /// the sender generates and shares out of band. Returns the claim id.
    ///
    /// `expires_at` is a unix timestamp; pass 0 for a claim that never
    /// expires (and so can never be reclaimed). `note` is shown to whoever
    /// opens the claim, up to `MAX_NOTE_LEN` bytes — pass an empty string
    /// for none.
    pub fn create_claim(
        env: Env,
        sender: Address,
        amount: i128,
        secret_hash: BytesN<32>,
        expires_at: u64,
        note: String,
    ) -> u64 {
        sender.require_auth();
        let cfg = Self::config(env.clone());

        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        if note.len() > MAX_NOTE_LEN {
            panic_with_error!(&env, Error::NoteTooLong);
        }

        let here = env.current_contract_address();
        token::TokenClient::new(&env, &cfg.token).transfer(&sender, &here, &amount);

        let id = Self::take_next_id(&env);
        let claim = Claim {
            sender: sender.clone(),
            amount,
            secret_hash,
            expires_at,
            note,
            status: ClaimStatus::Pending,
        };
        Self::store_claim(&env, id, &claim);

        ClaimCreated {
            sender,
            claim_id: id,
            amount,
            expires_at,
        }
        .publish(&env);
        id
    }

    /// Redeem a claim by proving knowledge of its secret. Sends the funds to
    /// `to`. Deliberately requires no signature — see the module docs: the
    /// secret itself is the authorization, so someone with no Stellar
    /// account until this very transaction can still be the one who claims.
    pub fn claim(env: Env, claim_id: u64, secret: Bytes, to: Address) -> i128 {
        let mut c = Self::load_claim(&env, claim_id);
        if c.status != ClaimStatus::Pending {
            panic_with_error!(&env, Error::AlreadyResolved);
        }
        if c.expires_at > 0 && env.ledger().timestamp() > c.expires_at {
            panic_with_error!(&env, Error::Expired);
        }

        let computed: BytesN<32> = env.crypto().sha256(&secret).into();
        if computed != c.secret_hash {
            panic_with_error!(&env, Error::WrongSecret);
        }

        c.status = ClaimStatus::Claimed;
        Self::store_claim(&env, claim_id, &c);

        let cfg = Self::config(env.clone());
        let here = env.current_contract_address();
        token::TokenClient::new(&env, &cfg.token).transfer(&here, &to, &c.amount);

        Redeemed {
            to,
            claim_id,
            amount: c.amount,
        }
        .publish(&env);
        c.amount
    }

    /// The sender takes back an unclaimed claim after its deadline passed.
    pub fn reclaim(env: Env, claim_id: u64) {
        let mut c = Self::load_claim(&env, claim_id);
        c.sender.require_auth();

        if c.status != ClaimStatus::Pending {
            panic_with_error!(&env, Error::AlreadyResolved);
        }
        if c.expires_at == 0 || env.ledger().timestamp() <= c.expires_at {
            panic_with_error!(&env, Error::NotExpired);
        }

        c.status = ClaimStatus::Reclaimed;
        Self::store_claim(&env, claim_id, &c);

        let cfg = Self::config(env.clone());
        let here = env.current_contract_address();
        token::TokenClient::new(&env, &cfg.token).transfer(&here, &c.sender, &c.amount);

        Reclaimed {
            sender: c.sender,
            claim_id,
            amount: c.amount,
        }
        .publish(&env);
    }

    /// Preview a claim before redeeming it — status, amount, note, deadline.
    /// Safe to call with no wallet connected; reveals nothing about the
    /// secret (only its hash was ever stored).
    pub fn get_claim(env: Env, claim_id: u64) -> Claim {
        Self::load_claim(&env, claim_id)
    }

    pub fn config(env: Env) -> Config {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized))
    }

    // ------------------------------------------------------------------ internals

    fn take_next_id(env: &Env) -> u64 {
        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextId)
            .unwrap_or(1);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));
        id
    }

    fn load_claim(env: &Env, claim_id: u64) -> Claim {
        env.storage()
            .persistent()
            .get(&DataKey::Claim(claim_id))
            .unwrap_or_else(|| panic_with_error!(env, Error::ClaimNotFound))
    }

    fn store_claim(env: &Env, claim_id: u64, claim: &Claim) {
        let key = DataKey::Claim(claim_id);
        env.storage().persistent().set(&key, claim);
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_BUMP);
    }
}

mod test;
