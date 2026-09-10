#![no_std]
//! RemitStream AutoSplitRouter — goal-aware remittance splitter.
//!
//! Every incoming remittance is split according to the *recipient's* savings
//! goals. Goals are ordered by priority. Each one claims a slice (in basis
//! points) of every transfer; when a goal is full, its unclaimed slice cascades
//! to the next goal in line, and whatever no goal claims lands spendable in the
//! recipient's wallet.
//!
//! The recipient owns their goals — a sender can route money to someone but can
//! never change how that person saves.
//!
//! ## Back-compatible surface
//!
//! `set_rule` / `get_rule` still work. They map onto a single default goal named
//! "Savings", so older clients and the earlier flat-percentage model keep
//! functioning unchanged.

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype,
    panic_with_error, token, Address, Env, String, Vec,
};

const DAY_IN_LEDGERS: u32 = 17_280;
const INSTANCE_BUMP: u32 = 30 * DAY_IN_LEDGERS;
const INSTANCE_THRESHOLD: u32 = INSTANCE_BUMP - DAY_IN_LEDGERS;
const PERSISTENT_BUMP: u32 = 90 * DAY_IN_LEDGERS;
const PERSISTENT_THRESHOLD: u32 = PERSISTENT_BUMP - DAY_IN_LEDGERS;

/// Basis points denominator: 10_000 bps == 100%.
pub const BPS_DENOMINATOR: u32 = 10_000;
/// Hard ceiling on goals per recipient — keeps `route()` cost bounded.
pub const MAX_GOALS: u32 = 8;
/// Longest a goal name may be, in bytes.
pub const MAX_NAME_LEN: u32 = 48;
/// Name of the goal the back-compatible `set_rule` shim reads and writes.
const DEFAULT_GOAL: &str = "Savings";

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    /// A basis-points value is above 10_000, or the total across active goals would be.
    InvalidSplit = 4,
    /// Sender and recipient must differ.
    SelfTransfer = 5,
    /// No goal with that id belongs to the caller.
    GoalNotFound = 6,
    /// The recipient already has `MAX_GOALS` non-archived goals.
    TooManyGoals = 7,
    /// A reorder list is not a permutation of the caller's current goal ids.
    BadReorder = 8,
    /// A goal name is empty or longer than `MAX_NAME_LEN`.
    InvalidName = 9,
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

/// Lifecycle of a goal.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GoalStatus {
    /// Taking a slice of every inbound transfer.
    Active,
    /// Target met. Skipped by `route` until the target is raised.
    Reached,
    /// Retired by the owner. Frees its allocation.
    Archived,
}

/// A single savings goal owned by a recipient.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Goal {
    pub id: u32,
    pub name: String,
    /// Target in token base units. `0` means open-ended (no cap).
    pub target: i128,
    /// Principal routed into this goal so far. Excludes vault yield.
    pub saved: i128,
    /// Informational deadline as a unix timestamp. `0` means none.
    /// Not enforced on-chain — the UI uses it for a countdown.
    pub deadline: u64,
    /// Slice of every inbound remittance aimed at this goal, in basis points.
    pub allocation_bps: u32,
    pub status: GoalStatus,
}

/// Back-compatible flat rule, derived from the active goal allocations.
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

/// One goal's share of a specific split. Returned by `quote_plan` and mirrored
/// by the `GoalFunded` events `route` emits.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GoalFill {
    pub goal_id: u32,
    pub name: String,
    pub amount: i128,
    /// True if this contribution takes the goal to its target.
    pub reaches_target: bool,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Config,
    Goals(Address),
    NextId(Address),
    Stats(Address),
}

/// Emitted when a recipient changes their flat rule via `set_rule`.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RuleSet {
    #[topic]
    pub recipient: Address,
    pub save_bps: u32,
}

/// Emitted when a recipient creates a goal.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GoalCreated {
    #[topic]
    pub owner: Address,
    pub goal_id: u32,
    pub name: String,
    pub target: i128,
    pub allocation_bps: u32,
}

/// Emitted when a goal's target, allocation, or status changes.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GoalUpdated {
    #[topic]
    pub owner: Address,
    pub goal_id: u32,
    pub target: i128,
    pub allocation_bps: u32,
    pub status: GoalStatus,
}

/// Emitted once per goal that receives funds during a `route` call.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GoalFunded {
    #[topic]
    pub owner: Address,
    #[topic]
    pub sender: Address,
    pub goal_id: u32,
    pub amount: i128,
    pub saved_after: i128,
    pub reached: bool,
}

/// Emitted for every routed remittance. Indexed by both parties so the dashboard
/// can query a user's sent and received history. Shape is unchanged from v1.
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
        env.storage()
            .instance()
            .set(&DataKey::Config, &Config { admin, vault, token });
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
    }

    // --------------------------------------------------------------- goals API

    /// Create a savings goal owned by `owner`. Returns the new goal's id.
    ///
    /// `target` is in token base units; `0` means open-ended. `deadline` is a
    /// unix timestamp used only for display; pass `0` for none. `allocation_bps`
    /// is this goal's slice of every inbound transfer — the sum across all
    /// active goals may not exceed 100%.
    pub fn add_goal(
        env: Env,
        owner: Address,
        name: String,
        target: i128,
        deadline: u64,
        allocation_bps: u32,
    ) -> u32 {
        owner.require_auth();
        Self::require_init(&env);
        Self::validate_goal_fields(&env, &name, target, allocation_bps);

        let mut goals = Self::load_goals(&env, &owner);
        if Self::live_goal_count(&goals) >= MAX_GOALS {
            panic_with_error!(&env, Error::TooManyGoals);
        }
        if Self::active_alloc_bps(&goals, None) + allocation_bps > BPS_DENOMINATOR {
            panic_with_error!(&env, Error::InvalidSplit);
        }

        let id = Self::take_next_id(&env, &owner);
        goals.push_back(Goal {
            id,
            name: name.clone(),
            target,
            saved: 0,
            deadline,
            allocation_bps,
            status: GoalStatus::Active,
        });
        Self::store_goals(&env, &owner, &goals);

        GoalCreated {
            owner,
            goal_id: id,
            name,
            target,
            allocation_bps,
        }
        .publish(&env);
        id
    }

    /// Replace a goal's editable fields. Raising the target above what's already
    /// saved reactivates a goal that had been marked `Reached`.
    pub fn update_goal(
        env: Env,
        owner: Address,
        goal_id: u32,
        name: String,
        target: i128,
        deadline: u64,
        allocation_bps: u32,
    ) {
        owner.require_auth();
        Self::require_init(&env);
        Self::validate_goal_fields(&env, &name, target, allocation_bps);

        let mut goals = Self::load_goals(&env, &owner);
        let idx = Self::index_of(&env, &goals, goal_id);
        if Self::active_alloc_bps(&goals, Some(goal_id)) + allocation_bps > BPS_DENOMINATOR {
            panic_with_error!(&env, Error::InvalidSplit);
        }

        let mut g = goals.get(idx).unwrap();
        g.name = name;
        g.target = target;
        g.deadline = deadline;
        g.allocation_bps = allocation_bps;
        g.status = if target > 0 && g.saved >= target {
            GoalStatus::Reached
        } else {
            GoalStatus::Active
        };
        goals.set(idx, g.clone());
        Self::store_goals(&env, &owner, &goals);

        GoalUpdated {
            owner,
            goal_id,
            target,
            allocation_bps,
            status: g.status,
        }
        .publish(&env);
    }

    /// Convenience: change only a goal's allocation. Handy for a slider.
    pub fn set_goal_allocation(env: Env, owner: Address, goal_id: u32, allocation_bps: u32) {
        owner.require_auth();
        Self::require_init(&env);
        if allocation_bps > BPS_DENOMINATOR {
            panic_with_error!(&env, Error::InvalidSplit);
        }

        let mut goals = Self::load_goals(&env, &owner);
        let idx = Self::index_of(&env, &goals, goal_id);
        if Self::active_alloc_bps(&goals, Some(goal_id)) + allocation_bps > BPS_DENOMINATOR {
            panic_with_error!(&env, Error::InvalidSplit);
        }

        let mut g = goals.get(idx).unwrap();
        g.allocation_bps = allocation_bps;
        if g.status == GoalStatus::Archived && allocation_bps > 0 {
            g.status = if g.target > 0 && g.saved >= g.target {
                GoalStatus::Reached
            } else {
                GoalStatus::Active
            };
        }
        goals.set(idx, g.clone());
        Self::store_goals(&env, &owner, &goals);

        GoalUpdated {
            owner,
            goal_id,
            target: g.target,
            allocation_bps,
            status: g.status,
        }
        .publish(&env);
    }

    /// Retire a goal. Its allocation is freed for other goals; the principal it
    /// already holds stays in the vault and is still withdrawable.
    pub fn archive_goal(env: Env, owner: Address, goal_id: u32) {
        owner.require_auth();
        Self::require_init(&env);

        let mut goals = Self::load_goals(&env, &owner);
        let idx = Self::index_of(&env, &goals, goal_id);
        let mut g = goals.get(idx).unwrap();
        g.status = GoalStatus::Archived;
        g.allocation_bps = 0;
        goals.set(idx, g.clone());
        Self::store_goals(&env, &owner, &goals);

        GoalUpdated {
            owner,
            goal_id,
            target: g.target,
            allocation_bps: 0,
            status: GoalStatus::Archived,
        }
        .publish(&env);
    }

    /// Set the priority order of the caller's goals. `order` must be a
    /// permutation of the caller's current goal ids. Earlier goals fill first.
    pub fn reorder_goals(env: Env, owner: Address, order: Vec<u32>) {
        owner.require_auth();
        Self::require_init(&env);

        let goals = Self::load_goals(&env, &owner);
        if order.len() != goals.len() {
            panic_with_error!(&env, Error::BadReorder);
        }
        // Every current goal id must appear in `order`. Combined with the equal
        // length check, that makes `order` a permutation (no dups, no strangers).
        for g in goals.iter() {
            let mut found = false;
            for id in order.iter() {
                if id == g.id {
                    found = true;
                    break;
                }
            }
            if !found {
                panic_with_error!(&env, Error::BadReorder);
            }
        }

        let mut rebuilt = Vec::new(&env);
        for id in order.iter() {
            let idx = Self::index_of(&env, &goals, id);
            rebuilt.push_back(goals.get(idx).unwrap());
        }
        Self::store_goals(&env, &owner, &rebuilt);
    }

    pub fn get_goals(env: Env, owner: Address) -> Vec<Goal> {
        Self::load_goals(&env, &owner)
    }

    // ------------------------------------------------- back-compatible flat rule

    /// Set the caller's savings rate as a single percentage (basis points).
    ///
    /// This is sugar over one goal named "Savings": it creates that goal, or
    /// updates its allocation, or archives it when `save_bps` is 0. Recipients
    /// with hand-built goals should use `set_goal_allocation` instead.
    pub fn set_rule(env: Env, recipient: Address, save_bps: u32) {
        recipient.require_auth();
        Self::require_init(&env);
        if save_bps > BPS_DENOMINATOR {
            panic_with_error!(&env, Error::InvalidSplit);
        }

        let mut goals = Self::load_goals(&env, &recipient);
        let default_name = String::from_str(&env, DEFAULT_GOAL);
        let mut found: Option<u32> = None;
        for (i, g) in goals.iter().enumerate() {
            if g.name == default_name {
                found = Some(i as u32);
                break;
            }
        }

        match found {
            Some(idx) => {
                let mut g = goals.get(idx).unwrap();
                if Self::active_alloc_bps(&goals, Some(g.id)) + save_bps > BPS_DENOMINATOR {
                    panic_with_error!(&env, Error::InvalidSplit);
                }
                g.allocation_bps = save_bps;
                g.status = if save_bps == 0 {
                    GoalStatus::Archived
                } else if g.target > 0 && g.saved >= g.target {
                    GoalStatus::Reached
                } else {
                    GoalStatus::Active
                };
                goals.set(idx, g);
                Self::store_goals(&env, &recipient, &goals);
            }
            None => {
                if save_bps > 0 {
                    if Self::live_goal_count(&goals) >= MAX_GOALS {
                        panic_with_error!(&env, Error::TooManyGoals);
                    }
                    if Self::active_alloc_bps(&goals, None) + save_bps > BPS_DENOMINATOR {
                        panic_with_error!(&env, Error::InvalidSplit);
                    }
                    let id = Self::take_next_id(&env, &recipient);
                    goals.push_back(Goal {
                        id,
                        name: default_name,
                        target: 0,
                        saved: 0,
                        deadline: 0,
                        allocation_bps: save_bps,
                        status: GoalStatus::Active,
                    });
                    Self::store_goals(&env, &recipient, &goals);
                }
            }
        }

        RuleSet {
            recipient,
            save_bps,
        }
        .publish(&env);
    }

    /// The caller's effective flat rate: the sum of active goal allocations,
    /// capped at 100%.
    pub fn get_rule(env: Env, recipient: Address) -> Rule {
        let goals = Self::load_goals(&env, &recipient);
        let mut bps = Self::active_alloc_bps(&goals, None);
        if bps > BPS_DENOMINATOR {
            bps = BPS_DENOMINATOR;
        }
        Rule {
            save_bps: bps,
            enabled: bps > 0,
        }
    }

    // ------------------------------------------------------------------- routing

    /// Send `amount` to `recipient`, splitting it across the recipient's goals.
    ///
    /// The router pulls the full amount, forwards the unsaved remainder to the
    /// recipient's wallet, pushes the saved part into the vault, and credits the
    /// recipient's shares. Only the sender signs.
    pub fn route(env: Env, sender: Address, recipient: Address, amount: i128) -> Split {
        sender.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        if sender == recipient {
            panic_with_error!(&env, Error::SelfTransfer);
        }

        let cfg = Self::config(env.clone());
        let mut goals = Self::load_goals(&env, &recipient);
        let (saved, fills) = Self::plan(&env, &goals, amount);
        let payout = amount - saved;

        let router = env.current_contract_address();
        let token_client = token::TokenClient::new(&env, &cfg.token);

        // Pull the whole remittance in, then fan it out. Only the sender signs.
        token_client.transfer(&sender, &router, &amount);
        if payout > 0 {
            token_client.transfer(&router, &recipient, &payout);
        }
        if saved > 0 {
            token_client.transfer(&router, &cfg.vault, &saved);
            VaultClient::new(&env, &cfg.vault).credit(&recipient, &saved);

            for fill in fills.iter() {
                let idx = Self::index_of(&env, &goals, fill.goal_id);
                let mut g = goals.get(idx).unwrap();
                g.saved += fill.amount;
                let reached = g.target > 0 && g.saved >= g.target;
                if reached {
                    g.status = GoalStatus::Reached;
                }
                goals.set(idx, g.clone());

                GoalFunded {
                    owner: recipient.clone(),
                    sender: sender.clone(),
                    goal_id: fill.goal_id,
                    amount: fill.amount,
                    saved_after: g.saved,
                    reached,
                }
                .publish(&env);
            }
            Self::store_goals(&env, &recipient, &goals);
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
        let goals = Self::load_goals(&env, &recipient);
        let (saved, _) = Self::plan(&env, &goals, amount);
        Split {
            payout: amount - saved,
            saved,
        }
    }

    /// Preview which goals a transfer would feed, and by how much. The amounts
    /// sum to `quote(recipient, amount).saved`.
    pub fn quote_plan(env: Env, recipient: Address, amount: i128) -> Vec<GoalFill> {
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let goals = Self::load_goals(&env, &recipient);
        let (_, fills) = Self::plan(&env, &goals, amount);
        fills
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

    // ------------------------------------------------------------------ internals

    /// The split planner. Pure over the goal list — `route` and `quote` share it
    /// so the preview and the execution can never disagree.
    ///
    /// Each active goal gets `amount * allocation_bps / 10_000` as its base
    /// slice. A goal capped by its target takes only what fits; the leftover
    /// cascades to the next goal in priority order. Anything left after the last
    /// goal is the recipient's spendable payout.
    fn plan(env: &Env, goals: &Vec<Goal>, amount: i128) -> (i128, Vec<GoalFill>) {
        let mut total_saved: i128 = 0;
        let mut carry: i128 = 0;
        let mut fills = Vec::new(env);

        for g in goals.iter() {
            if g.status != GoalStatus::Active || g.allocation_bps == 0 {
                continue;
            }
            let base = amount * i128::from(g.allocation_bps) / i128::from(BPS_DENOMINATOR);
            let pool = base + carry;
            if pool <= 0 {
                continue;
            }
            let take = if g.target > 0 {
                let room = g.target - g.saved;
                if room <= 0 {
                    0
                } else if pool > room {
                    room
                } else {
                    pool
                }
            } else {
                pool
            };
            carry = pool - take;
            if take > 0 {
                total_saved += take;
                fills.push_back(GoalFill {
                    goal_id: g.id,
                    name: g.name.clone(),
                    amount: take,
                    reaches_target: g.target > 0 && g.saved + take >= g.target,
                });
            }
        }

        (total_saved, fills)
    }

    fn validate_goal_fields(env: &Env, name: &String, target: i128, allocation_bps: u32) {
        if target < 0 {
            panic_with_error!(env, Error::InvalidAmount);
        }
        if name.len() == 0 || name.len() > MAX_NAME_LEN {
            panic_with_error!(env, Error::InvalidName);
        }
        if allocation_bps > BPS_DENOMINATOR {
            panic_with_error!(env, Error::InvalidSplit);
        }
    }

    fn require_init(env: &Env) {
        if !env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(env, Error::NotInitialized);
        }
    }

    fn load_goals(env: &Env, owner: &Address) -> Vec<Goal> {
        env.storage()
            .persistent()
            .get(&DataKey::Goals(owner.clone()))
            .unwrap_or(Vec::new(env))
    }

    fn store_goals(env: &Env, owner: &Address, goals: &Vec<Goal>) {
        let key = DataKey::Goals(owner.clone());
        env.storage().persistent().set(&key, goals);
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_BUMP);
    }

    fn take_next_id(env: &Env, owner: &Address) -> u32 {
        let key = DataKey::NextId(owner.clone());
        let id: u32 = env.storage().persistent().get(&key).unwrap_or(1);
        env.storage().persistent().set(&key, &(id + 1));
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_BUMP);
        id
    }

    /// Sum of `allocation_bps` over active goals, optionally ignoring one id
    /// (the one being edited).
    fn active_alloc_bps(goals: &Vec<Goal>, skip_id: Option<u32>) -> u32 {
        let mut sum = 0u32;
        for g in goals.iter() {
            if g.status == GoalStatus::Active && Some(g.id) != skip_id {
                sum += g.allocation_bps;
            }
        }
        sum
    }

    /// Count of goals that still occupy a slot (everything not archived).
    fn live_goal_count(goals: &Vec<Goal>) -> u32 {
        let mut n = 0u32;
        for g in goals.iter() {
            if g.status != GoalStatus::Archived {
                n += 1;
            }
        }
        n
    }

    fn index_of(env: &Env, goals: &Vec<Goal>, goal_id: u32) -> u32 {
        for (i, g) in goals.iter().enumerate() {
            if g.id == goal_id {
                return i as u32;
            }
        }
        panic_with_error!(env, Error::GoalNotFound);
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
