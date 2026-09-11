#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::testutils::Address as _;

/// Returns (env, vault_id, token_id, admin).
fn setup() -> (Env, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let vault_id = env.register(SavingsVault, ());

    SavingsVaultClient::new(&env, &vault_id).initialize(&admin, &token_id);

    (env, vault_id, token_id, admin)
}

fn mint(env: &Env, token_id: &Address, to: &Address, amount: i128) {
    token::StellarAssetClient::new(env, token_id).mint(to, &amount);
}

/// The contract panics with an error rather than returning `Result`, so `try_*`
/// surfaces the host-level `soroban_sdk::Error`. This converts for comparison.
fn err(e: Error) -> Result<soroban_sdk::Error, soroban_sdk::InvokeError> {
    Ok(e.into())
}

#[test]
fn first_deposit_mints_shares_one_to_one() {
    let (env, vault_id, token_id, _admin) = setup();
    let vault = SavingsVaultClient::new(&env, &vault_id);
    let alice = Address::generate(&env);
    mint(&env, &token_id, &alice, 1_000);

    vault.deposit(&alice, &alice, &400);

    assert_eq!(vault.shares_of(&alice), 400);
    assert_eq!(vault.balance_of(&alice), 400);
    assert_eq!(vault.total_assets(), 400);
    assert_eq!(token::TokenClient::new(&env, &token_id).balance(&alice), 600);
}

#[test]
fn deposit_can_name_a_different_beneficiary() {
    let (env, vault_id, token_id, _admin) = setup();
    let vault = SavingsVaultClient::new(&env, &vault_id);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);
    mint(&env, &token_id, &sender, 500);

    vault.deposit(&sender, &recipient, &250);

    assert_eq!(vault.balance_of(&recipient), 250);
    assert_eq!(vault.balance_of(&sender), 0);
}

#[test]
fn yield_accrues_pro_rata_across_holders() {
    let (env, vault_id, token_id, admin) = setup();
    let vault = SavingsVaultClient::new(&env, &vault_id);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    mint(&env, &token_id, &alice, 1_000);
    mint(&env, &token_id, &bob, 1_000);
    mint(&env, &token_id, &admin, 1_000);

    vault.deposit(&alice, &alice, &100);
    vault.deposit(&bob, &bob, &300);

    // 10% yield on a 400 pool.
    vault.accrue_yield(&40);

    assert_eq!(vault.total_assets(), 440);
    assert_eq!(vault.balance_of(&alice), 110);
    assert_eq!(vault.balance_of(&bob), 330);
    // Yield does not mint shares.
    assert_eq!(vault.total_shares(), 400);
}

#[test]
fn deposit_after_yield_is_not_diluted() {
    let (env, vault_id, token_id, admin) = setup();
    let vault = SavingsVaultClient::new(&env, &vault_id);
    let alice = Address::generate(&env);
    let carol = Address::generate(&env);
    mint(&env, &token_id, &alice, 1_000);
    mint(&env, &token_id, &carol, 1_000);
    mint(&env, &token_id, &admin, 1_000);

    vault.deposit(&alice, &alice, &100);
    vault.accrue_yield(&100); // share price doubles

    vault.deposit(&carol, &carol, &200);

    // Carol buys in at the higher price: 200 assets -> 100 shares.
    assert_eq!(vault.shares_of(&carol), 100);
    assert_eq!(vault.balance_of(&carol), 200);
    assert_eq!(vault.balance_of(&alice), 200);
}

#[test]
fn withdraw_returns_tokens_and_burns_shares() {
    let (env, vault_id, token_id, _admin) = setup();
    let vault = SavingsVaultClient::new(&env, &vault_id);
    let alice = Address::generate(&env);
    mint(&env, &token_id, &alice, 1_000);

    vault.deposit(&alice, &alice, &400);
    vault.withdraw(&alice, &150);

    assert_eq!(vault.balance_of(&alice), 250);
    assert_eq!(vault.total_assets(), 250);
    assert_eq!(token::TokenClient::new(&env, &token_id).balance(&alice), 750);
}

#[test]
fn withdraw_all_empties_the_position() {
    let (env, vault_id, token_id, admin) = setup();
    let vault = SavingsVaultClient::new(&env, &vault_id);
    let alice = Address::generate(&env);
    mint(&env, &token_id, &alice, 1_000);
    mint(&env, &token_id, &admin, 1_000);

    vault.deposit(&alice, &alice, &400);
    vault.accrue_yield(&40);
    vault.withdraw_all(&alice);

    assert_eq!(vault.balance_of(&alice), 0);
    assert_eq!(vault.shares_of(&alice), 0);
    assert_eq!(token::TokenClient::new(&env, &token_id).balance(&alice), 1_040);
}

#[test]
fn withdraw_beyond_balance_is_rejected() {
    let (env, vault_id, token_id, _admin) = setup();
    let vault = SavingsVaultClient::new(&env, &vault_id);
    let alice = Address::generate(&env);
    mint(&env, &token_id, &alice, 1_000);
    vault.deposit(&alice, &alice, &100);

    assert_eq!(
        vault.try_withdraw(&alice, &101).unwrap_err(),
        err(Error::InsufficientBalance)
    );
}

#[test]
fn one_holder_cannot_withdraw_anothers_funds() {
    let (env, vault_id, token_id, _admin) = setup();
    let vault = SavingsVaultClient::new(&env, &vault_id);
    let alice = Address::generate(&env);
    let mallory = Address::generate(&env);
    mint(&env, &token_id, &alice, 1_000);
    vault.deposit(&alice, &alice, &500);

    assert_eq!(
        vault.try_withdraw(&mallory, &100).unwrap_err(),
        err(Error::InsufficientBalance)
    );
    assert_eq!(vault.balance_of(&alice), 500);
}

#[test]
fn router_can_credit_once_funds_have_landed() {
    let (env, vault_id, token_id, _admin) = setup();
    let vault = SavingsVaultClient::new(&env, &vault_id);
    let router = Address::generate(&env);
    let recipient = Address::generate(&env);

    vault.set_router(&router);
    mint(&env, &token_id, &router, 1_000);

    // Router pushes the tokens in, then credits the beneficiary.
    token::TokenClient::new(&env, &token_id).transfer(&router, &vault_id, &200);
    vault.credit(&recipient, &200);

    assert_eq!(vault.balance_of(&recipient), 200);
    assert_eq!(vault.total_assets(), 200);
}

#[test]
fn credit_without_incoming_funds_is_rejected() {
    let (env, vault_id, _token_id, _admin) = setup();
    let vault = SavingsVaultClient::new(&env, &vault_id);
    let router = Address::generate(&env);
    let recipient = Address::generate(&env);
    vault.set_router(&router);

    // No transfer happened, so the balance check must fail.
    assert_eq!(
        vault.try_credit(&recipient, &200).unwrap_err(),
        err(Error::FundsNotReceived)
    );
}

#[test]
fn credit_before_router_is_configured_is_rejected() {
    let (env, vault_id, _token_id, _admin) = setup();
    let vault = SavingsVaultClient::new(&env, &vault_id);
    let recipient = Address::generate(&env);

    assert_eq!(
        vault.try_credit(&recipient, &100).unwrap_err(),
        err(Error::RouterNotSet)
    );
}

#[test]
fn yield_with_no_depositors_is_rejected() {
    let (env, vault_id, token_id, admin) = setup();
    let vault = SavingsVaultClient::new(&env, &vault_id);
    mint(&env, &token_id, &admin, 1_000);

    assert_eq!(
        vault.try_accrue_yield(&50).unwrap_err(),
        err(Error::NoDepositors)
    );
}

#[test]
fn non_positive_amounts_are_rejected() {
    let (env, vault_id, token_id, _admin) = setup();
    let vault = SavingsVaultClient::new(&env, &vault_id);
    let alice = Address::generate(&env);
    mint(&env, &token_id, &alice, 1_000);

    assert_eq!(
        vault.try_deposit(&alice, &alice, &0).unwrap_err(),
        err(Error::InvalidAmount)
    );
    assert_eq!(
        vault.try_deposit(&alice, &alice, &-5).unwrap_err(),
        err(Error::InvalidAmount)
    );
}

#[test]
fn initialize_is_one_shot() {
    let (env, vault_id, token_id, admin) = setup();
    let vault = SavingsVaultClient::new(&env, &vault_id);

    assert_eq!(
        vault.try_initialize(&admin, &token_id).unwrap_err(),
        err(Error::AlreadyInitialized)
    );
}

#[test]
fn withdrawal_rounding_never_favours_the_withdrawer() {
    let (env, vault_id, token_id, admin) = setup();
    let vault = SavingsVaultClient::new(&env, &vault_id);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    mint(&env, &token_id, &alice, 10_000);
    mint(&env, &token_id, &bob, 10_000);
    mint(&env, &token_id, &admin, 10_000);

    vault.deposit(&alice, &alice, &333);
    vault.deposit(&bob, &bob, &667);
    vault.accrue_yield(&7); // creates a non-round share price

    let alice_before = vault.balance_of(&alice);
    vault.withdraw(&alice, &100);

    // Never returns more value than was owed.
    assert!(vault.balance_of(&alice) <= alice_before - 100);
    // The vault stays solvent: real tokens cover accounted assets.
    let held = token::TokenClient::new(&env, &token_id).balance(&vault_id);
    assert!(held >= vault.total_assets());
}

// --------------------------------------------------------------- Blend yield
//
// A minimal stand-in for a Blend lending pool: same `submit` / `get_reserve`
// / `get_positions` surface the vault calls, with a controllable b_rate so a
// test can simulate interest accruing between two vault calls. It moves real
// tokens on supply/withdraw, so the vault's local-balance and solvency math
// is exercised exactly as it would be against the real pool — what it does
// *not* prove is byte-for-byte ABI agreement with Blend's actual deployed
// contract, which needs a dry run against a real pool before going live.

mod blend_mock {
    use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, Map, Vec};
    use crate::{BlendPositions, BlendRequest, BlendReserve, BlendReserveConfig, BlendReserveData};

    const RATE_SCALAR: i128 = 1_000_000_000_000;

    #[contracttype]
    #[derive(Clone)]
    enum Key {
        Token,
        Index,
        BRate,
        BTokens(Address),
    }

    #[contract]
    pub struct MockBlendPool;

    #[contractimpl]
    impl MockBlendPool {
        pub fn init(env: Env, token: Address, index: u32) {
            env.storage().instance().set(&Key::Token, &token);
            env.storage().instance().set(&Key::Index, &index);
            env.storage().instance().set(&Key::BRate, &RATE_SCALAR); // 1.0 to start
        }

        /// Test-only lever: simulate interest by moving the exchange rate.
        pub fn set_b_rate(env: Env, new_rate: i128) {
            env.storage().instance().set(&Key::BRate, &new_rate);
        }

        pub fn submit(
            env: Env,
            from: Address,
            spender: Address,
            to: Address,
            requests: Vec<BlendRequest>,
        ) -> BlendPositions {
            let token: Address = env.storage().instance().get(&Key::Token).unwrap();
            let index: u32 = env.storage().instance().get(&Key::Index).unwrap();
            let b_rate: i128 = env.storage().instance().get(&Key::BRate).unwrap();
            let tc = token::TokenClient::new(&env, &token);
            let mut b_tokens = Self::b_tokens_of(&env, &from);

            for r in requests.iter() {
                if r.request_type == 0 {
                    // Supply
                    tc.transfer(&spender, &env.current_contract_address(), &r.amount);
                    b_tokens += r.amount * RATE_SCALAR / b_rate;
                } else if r.request_type == 1 {
                    // Withdraw
                    let burn = r.amount * RATE_SCALAR / b_rate;
                    b_tokens -= burn;
                    tc.transfer(&env.current_contract_address(), &to, &r.amount);
                }
            }
            Self::set_b_tokens(&env, &from, b_tokens);

            let mut supply = Map::new(&env);
            supply.set(index, b_tokens);
            BlendPositions {
                liabilities: Map::new(&env),
                collateral: Map::new(&env),
                supply,
            }
        }

        pub fn get_reserve(env: Env, asset: Address) -> BlendReserve {
            let index: u32 = env.storage().instance().get(&Key::Index).unwrap();
            let b_rate: i128 = env.storage().instance().get(&Key::BRate).unwrap();
            BlendReserve {
                asset,
                config: BlendReserveConfig {
                    index,
                    decimals: 7,
                    c_factor: 0,
                    l_factor: 0,
                    util: 0,
                    max_util: 0,
                    r_base: 0,
                    r_one: 0,
                    r_two: 0,
                    r_three: 0,
                    reactivity: 0,
                    supply_cap: 0,
                    enabled: true,
                },
                data: BlendReserveData {
                    d_rate: RATE_SCALAR,
                    b_rate,
                    ir_mod: 0,
                    b_supply: 0,
                    d_supply: 0,
                    backstop_credit: 0,
                    last_time: 0,
                },
                scalar: 10_000_000,
            }
        }

        pub fn get_positions(env: Env, address: Address) -> BlendPositions {
            let index: u32 = env.storage().instance().get(&Key::Index).unwrap();
            let mut supply = Map::new(&env);
            supply.set(index, Self::b_tokens_of(&env, &address));
            BlendPositions {
                liabilities: Map::new(&env),
                collateral: Map::new(&env),
                supply,
            }
        }

        fn b_tokens_of(env: &Env, user: &Address) -> i128 {
            env.storage()
                .instance()
                .get(&Key::BTokens(user.clone()))
                .unwrap_or(0)
        }

        fn set_b_tokens(env: &Env, user: &Address, amount: i128) {
            env.storage().instance().set(&Key::BTokens(user.clone()), &amount);
        }
    }
}
use blend_mock::{MockBlendPool, MockBlendPoolClient};

/// Returns (env, vault_id, token_id, admin, pool_id) with the pool already
/// wired to the token and set as the vault's yield pool.
fn setup_with_blend() -> (Env, Address, Address, Address, Address) {
    let (env, vault_id, token_id, admin) = setup();
    let pool_id = env.register(MockBlendPool, ());
    MockBlendPoolClient::new(&env, &pool_id).init(&token_id, &0);
    SavingsVaultClient::new(&env, &vault_id).set_yield_pool(&pool_id);
    (env, vault_id, token_id, admin, pool_id)
}

#[test]
fn investing_moves_idle_balance_into_the_yield_pool() {
    let (env, vault_id, token_id, _admin, pool_id) = setup_with_blend();
    let vault = SavingsVaultClient::new(&env, &vault_id);
    let alice = Address::generate(&env);
    mint(&env, &token_id, &alice, 1_000);
    vault.deposit(&alice, &alice, &1_000);

    vault.invest(&600);

    let tc = token::TokenClient::new(&env, &token_id);
    assert_eq!(tc.balance(&vault_id), 400);
    assert_eq!(tc.balance(&pool_id), 600);
    // Investing relocates funds; it doesn't change what anyone is owed.
    assert_eq!(vault.total_assets(), 1_000);
    assert_eq!(vault.balance_of(&alice), 1_000);
    assert_eq!(vault.blend_baseline(), 600);
}

#[test]
fn sync_yield_credits_interest_earned_in_the_pool() {
    let (env, vault_id, token_id, _admin, pool_id) = setup_with_blend();
    let vault = SavingsVaultClient::new(&env, &vault_id);
    let pool = MockBlendPoolClient::new(&env, &pool_id);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    mint(&env, &token_id, &alice, 1_000);
    mint(&env, &token_id, &bob, 1_000);
    vault.deposit(&alice, &alice, &600);
    vault.deposit(&bob, &bob, &400);
    vault.invest(&1_000); // everything parked in Blend

    // Simulate 10% interest: the exchange rate rises 10%.
    pool.set_b_rate(&(1_100_000_000_000_i128));

    let gained = vault.sync_yield();

    assert_eq!(gained, 100);
    assert_eq!(vault.total_assets(), 1_100);
    // No shares were minted — the gain is shared pro rata by principal.
    assert_eq!(vault.balance_of(&alice), 660);
    assert_eq!(vault.balance_of(&bob), 440);
    assert_eq!(vault.blend_baseline(), 1_100);

    // A second sync with no further rate change credits nothing new.
    assert_eq!(vault.sync_yield(), 0);
}

#[test]
fn withdraw_tops_up_from_the_pool_when_local_balance_is_short() {
    let (env, vault_id, token_id, _admin, pool_id) = setup_with_blend();
    let vault = SavingsVaultClient::new(&env, &vault_id);
    let alice = Address::generate(&env);
    mint(&env, &token_id, &alice, 1_000);
    vault.deposit(&alice, &alice, &1_000);
    vault.invest(&700); // local balance now 300

    vault.withdraw(&alice, &800); // 500 short — pulled from the pool

    let tc = token::TokenClient::new(&env, &token_id);
    assert_eq!(tc.balance(&alice), 800);
    assert_eq!(vault.balance_of(&alice), 200);
    assert_eq!(vault.blend_baseline(), 200); // 700 invested - 500 pulled back
    // The vault stays solvent across both places its money can live.
    let held = tc.balance(&vault_id) + tc.balance(&pool_id);
    assert!(held >= vault.total_assets());
}

#[test]
fn set_yield_pool_refuses_to_swap_while_the_current_one_is_funded() {
    let (env, vault_id, token_id, _admin, _pool_id) = setup_with_blend();
    let vault = SavingsVaultClient::new(&env, &vault_id);
    let alice = Address::generate(&env);
    mint(&env, &token_id, &alice, 1_000);
    vault.deposit(&alice, &alice, &1_000);
    vault.invest(&500);

    let other_pool = env.register(MockBlendPool, ());
    MockBlendPoolClient::new(&env, &other_pool).init(&token_id, &0);

    assert_eq!(
        vault.try_set_yield_pool(&other_pool).unwrap_err(),
        err(Error::YieldPoolFunded)
    );
}

#[test]
fn invest_and_sync_require_a_configured_yield_pool() {
    let (env, vault_id, token_id, admin) = setup();
    let vault = SavingsVaultClient::new(&env, &vault_id);
    mint(&env, &token_id, &admin, 1_000);

    assert_eq!(
        vault.try_invest(&100).unwrap_err(),
        err(Error::YieldPoolNotSet)
    );
    assert_eq!(
        vault.try_sync_yield().unwrap_err(),
        err(Error::YieldPoolNotSet)
    );
}

#[test]
fn sync_yield_is_a_noop_before_anyone_has_deposited() {
    let (env, _vault_id, _token_id, _admin, _pool_id) = setup_with_blend();
    let vault = SavingsVaultClient::new(&env, &_vault_id);
    assert_eq!(vault.sync_yield(), 0);
}

#[test]
fn invest_cannot_overdraw_the_vaults_local_balance() {
    let (env, _vault_id, token_id, _admin, _pool_id) = setup_with_blend();
    let vault = SavingsVaultClient::new(&env, &_vault_id);
    let alice = Address::generate(&env);
    mint(&env, &token_id, &alice, 1_000);
    vault.deposit(&alice, &alice, &300);

    assert_eq!(
        vault.try_invest(&301).unwrap_err(),
        err(Error::InsufficientBalance)
    );
}

#[test]
fn a_vault_with_no_yield_pool_behaves_exactly_as_before() {
    // No set_yield_pool call at all — existing deployments keep working
    // unchanged until an admin opts in.
    let (env, vault_id, token_id, _admin) = setup();
    let vault = SavingsVaultClient::new(&env, &vault_id);
    let alice = Address::generate(&env);
    mint(&env, &token_id, &alice, 1_000);
    vault.deposit(&alice, &alice, &500);

    assert_eq!(vault.yield_pool(), None);
    vault.withdraw(&alice, &500);
    assert_eq!(token::TokenClient::new(&env, &token_id).balance(&alice), 1_000);
    let _ = vault_id;
}
