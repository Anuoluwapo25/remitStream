#![no_std]
//! RemitStream SavingsCircle — a rotating savings circle (ajo, esusu, susu,
//! chama, tanda, cundina — nearly every culture has one), enforced on-chain
//! instead of by trust in whoever is holding the pot.
//!
//! The mechanic is old and works: a fixed group of people each contribute the
//! same amount every round; the whole pot goes to a different member each
//! round, until everyone has received it exactly once. It lets someone access
//! a useful lump sum immediately — an interest-free advance funded by people
//! who trust each other — without qualifying for a loan from anyone who
//! doesn't. It is also, informally, exactly how the classic version fails:
//! the collector disappears with the pot, or a member takes their turn and
//! then stops paying in.
//!
//! Neither failure is possible here. Contributions sit in this contract, not
//! in anyone's hands; a round only pays out once every member in it has paid
//! their share, and the transfer goes straight from the contract to that
//! round's member, in one atomic transaction. Nobody is ever the treasurer.
//!
//! This is not something a wallet can offer. A wallet holds one person's
//! keys; it has no way to enforce an agreement between several people who
//! don't trust each other. That enforcement only exists because it is a
//! program running on a ledger everyone in the circle can already see.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, Env, String, Vec,
};

/// Smallest a circle may be. Below this it is just two people trading money
/// back and forth, which needs none of this.
pub const MIN_MEMBERS: u32 = 2;
/// Largest a circle may be — keeps a round's settlement cost bounded.
pub const MAX_MEMBERS: u32 = 12;
/// Longest a circle's name may be, in bytes.
pub const MAX_NAME_LEN: u32 = 48;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidAmount = 1,
    /// `size` is below `MIN_MEMBERS` or above `MAX_MEMBERS`.
    InvalidSize = 2,
    /// `round_seconds` was zero.
    InvalidRoundLength = 3,
    /// A name is empty or longer than `MAX_NAME_LEN`.
    InvalidName = 4,
    CircleNotFound = 5,
    /// The circle already has all its members and started its first round.
    CircleFull = 6,
    /// This address is already a member of this circle.
    AlreadyMember = 7,
    /// This address is not a member of this circle.
    NotAMember = 8,
    /// The circle is still filling its member slots.
    StillForming = 9,
    /// The circle already finished — every member has been paid once.
    AlreadyCompleted = 10,
    /// This member has already paid into the current round.
    AlreadyContributed = 11,
    /// This member has nothing to reclaim in the current round.
    NothingToReclaim = 12,
    /// The round's grace period hasn't passed yet — it isn't reclaimable.
    RoundStillOpen = 13,
}

/// Lifecycle of a circle.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CircleStatus {
    /// Still recruiting members up to `size`.
    Forming,
    /// Full. Rounds are running.
    Active,
    /// Every member has received the pot exactly once.
    Completed,
}

/// A rotating savings circle.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Circle {
    pub token: Address,
    pub name: String,
    /// What each member pays in per round.
    pub contribution: i128,
    /// Minimum time a round stays open before a stalled contribution can be
    /// reclaimed. Does not force a round closed — a round only ever settles
    /// when every member has paid in.
    pub round_seconds: u64,
    pub size: u32,
    /// Join order, which is also payout order: `members[current_round]` is
    /// this round's recipient. Fixed once the circle is full.
    pub members: Vec<Address>,
    /// Index into `members` of the round currently in progress.
    pub current_round: u32,
    /// Unix seconds the current round opened. 0 while still `Forming`.
    pub round_start: u64,
    /// Aligned with `members`: who has paid into the current round.
    pub contributed: Vec<bool>,
    pub status: CircleStatus,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    NextId,
    Circle(u64),
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CircleCreated {
    #[topic]
    pub creator: Address,
    pub circle_id: u64,
    pub contribution: i128,
    pub size: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MemberJoined {
    #[topic]
    pub member: Address,
    pub circle_id: u64,
    /// True if this join filled the last slot and started round 0.
    pub activated: bool,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Contributed {
    #[topic]
    pub member: Address,
    pub circle_id: u64,
    pub round: u32,
}

/// Emitted once per round, when every member has paid in and the pot moves.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoundSettled {
    #[topic]
    pub recipient: Address,
    pub circle_id: u64,
    pub round: u32,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CircleCompleted {
    #[topic]
    pub circle_id: u64,
}

#[contract]
pub struct SavingsCircle;

#[contractimpl]
impl SavingsCircle {
    /// Start a new circle. The creator becomes its first member. Returns the
    /// circle's id; share it with the people you're forming this with, who
    /// join with `join_circle`.
    pub fn create_circle(
        env: Env,
        creator: Address,
        token: Address,
        name: String,
        contribution: i128,
        round_seconds: u64,
        size: u32,
    ) -> u64 {
        creator.require_auth();

        if contribution <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        if !(MIN_MEMBERS..=MAX_MEMBERS).contains(&size) {
            panic_with_error!(&env, Error::InvalidSize);
        }
        if round_seconds == 0 {
            panic_with_error!(&env, Error::InvalidRoundLength);
        }
        if name.len() == 0 || name.len() > MAX_NAME_LEN {
            panic_with_error!(&env, Error::InvalidName);
        }

        let mut members = Vec::new(&env);
        members.push_back(creator.clone());
        let mut contributed = Vec::new(&env);
        contributed.push_back(false);

        let id = Self::take_next_id(&env);
        let circle = Circle {
            token,
            name,
            contribution,
            round_seconds,
            size,
            members,
            current_round: 0,
            round_start: 0,
            contributed,
            status: CircleStatus::Forming,
        };
        Self::store(&env, id, &circle);

        CircleCreated {
            creator,
            circle_id: id,
            contribution,
            size,
        }
        .publish(&env);
        id
    }

    /// Join a forming circle. Join order is payout order: the first to join
    /// after the creator is paid in round 1, and so on. Filling the last
    /// slot starts round 0 immediately.
    pub fn join_circle(env: Env, member: Address, circle_id: u64) {
        member.require_auth();
        let mut c = Self::load(&env, circle_id);

        if c.status != CircleStatus::Forming {
            panic_with_error!(&env, Error::CircleFull);
        }
        if Self::index_of(&c.members, &member).is_some() {
            panic_with_error!(&env, Error::AlreadyMember);
        }

        c.members.push_back(member.clone());
        c.contributed.push_back(false);

        let activated = c.members.len() == c.size;
        if activated {
            c.status = CircleStatus::Active;
            c.round_start = env.ledger().timestamp();
        }
        Self::store(&env, circle_id, &c);

        MemberJoined {
            member,
            circle_id,
            activated,
        }
        .publish(&env);
    }

    /// Pay into the circle's current round. Once every member has, the whole
    /// pot moves in this same call to whichever member's turn it is, and the
    /// next round opens.
    pub fn contribute(env: Env, member: Address, circle_id: u64) {
        member.require_auth();
        let mut c = Self::load(&env, circle_id);

        match c.status {
            CircleStatus::Forming => panic_with_error!(&env, Error::StillForming),
            CircleStatus::Completed => panic_with_error!(&env, Error::AlreadyCompleted),
            CircleStatus::Active => {}
        }
        let idx = Self::index_of(&c.members, &member)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotAMember));
        if c.contributed.get(idx).unwrap_or(false) {
            panic_with_error!(&env, Error::AlreadyContributed);
        }

        let here = env.current_contract_address();
        token::TokenClient::new(&env, &c.token).transfer(&member, &here, &c.contribution);
        c.contributed.set(idx, true);

        Contributed {
            member,
            circle_id,
            round: c.current_round,
        }
        .publish(&env);

        let everyone_paid = c.contributed.iter().all(|paid| paid);
        if everyone_paid {
            let recipient = c.members.get(c.current_round).unwrap();
            let pot = c.contribution * i128::from(c.size);
            token::TokenClient::new(&env, &c.token).transfer(&here, &recipient, &pot);

            RoundSettled {
                recipient,
                circle_id,
                round: c.current_round,
                amount: pot,
            }
            .publish(&env);

            c.current_round += 1;
            if c.current_round == c.size {
                c.status = CircleStatus::Completed;
                CircleCompleted { circle_id }.publish(&env);
            } else {
                c.round_start = env.ledger().timestamp();
                let mut fresh = Vec::new(&env);
                for _ in 0..c.members.len() {
                    fresh.push_back(false);
                }
                c.contributed = fresh;
            }
        }
        Self::store(&env, circle_id, &c);
    }

    /// Take back a contribution already paid into the current, still-open
    /// round, once the round has been open longer than `round_seconds` with
    /// no full settlement. Protects members from a circle stalled by
    /// whoever hasn't paid in yet — it does not skip or punish anyone, it
    /// just lets you stop waiting on them.
    pub fn reclaim_stalled_round(env: Env, member: Address, circle_id: u64) {
        member.require_auth();
        let mut c = Self::load(&env, circle_id);

        match c.status {
            CircleStatus::Forming => panic_with_error!(&env, Error::StillForming),
            CircleStatus::Completed => panic_with_error!(&env, Error::AlreadyCompleted),
            CircleStatus::Active => {}
        }
        let idx = Self::index_of(&c.members, &member)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotAMember));
        if !c.contributed.get(idx).unwrap_or(false) {
            panic_with_error!(&env, Error::NothingToReclaim);
        }
        if env.ledger().timestamp() <= c.round_start + c.round_seconds {
            panic_with_error!(&env, Error::RoundStillOpen);
        }

        let here = env.current_contract_address();
        token::TokenClient::new(&env, &c.token).transfer(&here, &member, &c.contribution);
        c.contributed.set(idx, false);
        Self::store(&env, circle_id, &c);
    }

    pub fn get_circle(env: Env, circle_id: u64) -> Circle {
        Self::load(&env, circle_id)
    }

    // ------------------------------------------------------------------ internals

    fn take_next_id(env: &Env) -> u64 {
        let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(1);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));
        id
    }

    fn load(env: &Env, circle_id: u64) -> Circle {
        env.storage()
            .persistent()
            .get(&DataKey::Circle(circle_id))
            .unwrap_or_else(|| panic_with_error!(env, Error::CircleNotFound))
    }

    fn store(env: &Env, circle_id: u64, circle: &Circle) {
        env.storage()
            .persistent()
            .set(&DataKey::Circle(circle_id), circle);
    }

    fn index_of(members: &Vec<Address>, member: &Address) -> Option<u32> {
        for (i, m) in members.iter().enumerate() {
            if &m == member {
                return Some(i as u32);
            }
        }
        None
    }
}

mod test;
