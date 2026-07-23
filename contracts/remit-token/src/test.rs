#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger as _};

fn setup() -> (Env, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let token = env.register(RemitToken, ());
    RemitTokenClient::new(&env, &token).initialize(&admin);

    (env, token, admin)
}

fn err(e: Error) -> Result<soroban_sdk::Error, soroban_sdk::InvokeError> {
    Ok(e.into())
}

#[test]
fn metadata_is_exposed() {
    let (env, token, _admin) = setup();
    let client = RemitTokenClient::new(&env, &token);

    assert_eq!(client.decimals(), 7);
    assert_eq!(client.symbol(), String::from_str(&env, "rUSDC"));
    assert_eq!(client.name(), String::from_str(&env, "RemitStream USD"));
}

#[test]
fn admin_can_mint() {
    let (env, token, _admin) = setup();
    let client = RemitTokenClient::new(&env, &token);
    let user = Address::generate(&env);

    client.mint(&user, &5_000);

    assert_eq!(client.balance(&user), 5_000);
}

#[test]
fn transfer_moves_balance() {
    let (env, token, _admin) = setup();
    let client = RemitTokenClient::new(&env, &token);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    client.mint(&alice, &1_000);

    client.transfer(&alice, &bob, &400);

    assert_eq!(client.balance(&alice), 600);
    assert_eq!(client.balance(&bob), 400);
}

#[test]
fn transfer_beyond_balance_is_rejected() {
    let (env, token, _admin) = setup();
    let client = RemitTokenClient::new(&env, &token);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    client.mint(&alice, &100);

    assert_eq!(
        client.try_transfer(&alice, &bob, &101).unwrap_err(),
        err(Error::InsufficientBalance)
    );
}

#[test]
fn approve_then_transfer_from_works() {
    let (env, token, _admin) = setup();
    let client = RemitTokenClient::new(&env, &token);
    let alice = Address::generate(&env);
    let spender = Address::generate(&env);
    let bob = Address::generate(&env);
    client.mint(&alice, &1_000);

    client.approve(&alice, &spender, &300, &(env.ledger().sequence() + 1_000));
    assert_eq!(client.allowance(&alice, &spender), 300);

    client.transfer_from(&spender, &alice, &bob, &200);

    assert_eq!(client.balance(&bob), 200);
    assert_eq!(client.allowance(&alice, &spender), 100);
}

#[test]
fn transfer_from_beyond_allowance_is_rejected() {
    let (env, token, _admin) = setup();
    let client = RemitTokenClient::new(&env, &token);
    let alice = Address::generate(&env);
    let spender = Address::generate(&env);
    let bob = Address::generate(&env);
    client.mint(&alice, &1_000);
    client.approve(&alice, &spender, &100, &(env.ledger().sequence() + 1_000));

    assert_eq!(
        client
            .try_transfer_from(&spender, &alice, &bob, &101)
            .unwrap_err(),
        err(Error::InsufficientAllowance)
    );
}

#[test]
fn expired_allowance_is_not_spendable() {
    let (env, token, _admin) = setup();
    let client = RemitTokenClient::new(&env, &token);
    let alice = Address::generate(&env);
    let spender = Address::generate(&env);
    let bob = Address::generate(&env);
    client.mint(&alice, &1_000);

    let expiry = env.ledger().sequence() + 10;
    client.approve(&alice, &spender, &500, &expiry);

    env.ledger().set_sequence_number(expiry + 1);

    assert_eq!(client.allowance(&alice, &spender), 0);
    assert_eq!(
        client
            .try_transfer_from(&spender, &alice, &bob, &100)
            .unwrap_err(),
        err(Error::InsufficientAllowance)
    );
}

#[test]
fn burn_reduces_balance() {
    let (env, token, _admin) = setup();
    let client = RemitTokenClient::new(&env, &token);
    let alice = Address::generate(&env);
    client.mint(&alice, &1_000);

    client.burn(&alice, &250);

    assert_eq!(client.balance(&alice), 750);
}

#[test]
fn faucet_funds_a_new_user() {
    let (env, token, _admin) = setup();
    let client = RemitTokenClient::new(&env, &token);
    let user = Address::generate(&env);

    client.faucet(&user);

    assert_eq!(client.balance(&user), FAUCET_AMOUNT);
}

#[test]
fn faucet_is_rate_limited() {
    let (env, token, _admin) = setup();
    let client = RemitTokenClient::new(&env, &token);
    let user = Address::generate(&env);

    client.faucet(&user);

    assert_eq!(client.try_faucet(&user).unwrap_err(), err(Error::FaucetCooldown));
    assert_eq!(client.balance(&user), FAUCET_AMOUNT);
}

#[test]
fn faucet_allows_another_claim_after_cooldown() {
    let (env, token, _admin) = setup();
    let client = RemitTokenClient::new(&env, &token);
    let user = Address::generate(&env);

    client.faucet(&user);
    env.ledger()
        .set_sequence_number(env.ledger().sequence() + FAUCET_COOLDOWN_LEDGERS);
    client.faucet(&user);

    assert_eq!(client.balance(&user), FAUCET_AMOUNT * 2);
}

#[test]
fn faucet_cooldown_is_per_address() {
    let (env, token, _admin) = setup();
    let client = RemitTokenClient::new(&env, &token);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    client.faucet(&alice);
    client.faucet(&bob);

    assert_eq!(client.balance(&alice), FAUCET_AMOUNT);
    assert_eq!(client.balance(&bob), FAUCET_AMOUNT);
}

#[test]
fn non_positive_amounts_are_rejected() {
    let (env, token, _admin) = setup();
    let client = RemitTokenClient::new(&env, &token);
    let user = Address::generate(&env);

    assert_eq!(client.try_mint(&user, &0).unwrap_err(), err(Error::InvalidAmount));
    assert_eq!(
        client.try_mint(&user, &-1).unwrap_err(),
        err(Error::InvalidAmount)
    );
}

#[test]
fn initialize_is_one_shot() {
    let (env, token, admin) = setup();
    let client = RemitTokenClient::new(&env, &token);

    assert_eq!(
        client.try_initialize(&admin).unwrap_err(),
        err(Error::AlreadyInitialized)
    );
}
