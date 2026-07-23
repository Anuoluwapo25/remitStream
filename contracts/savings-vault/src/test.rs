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
