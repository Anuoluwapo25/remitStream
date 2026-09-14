#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger as _};

struct Ctx {
    env: Env,
    circles: Address,
    token: Address,
}

fn err(e: Error) -> Result<soroban_sdk::Error, soroban_sdk::InvokeError> {
    Ok(e.into())
}

fn setup() -> Ctx {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let circles = env.register(SavingsCircle, ());

    Ctx { env, circles, token }
}

impl Ctx {
    fn circles(&self) -> SavingsCircleClient<'_> {
        SavingsCircleClient::new(&self.env, &self.circles)
    }
    fn token(&self) -> token::TokenClient<'_> {
        token::TokenClient::new(&self.env, &self.token)
    }
    fn funded_user(&self, amount: i128) -> Address {
        let user = Address::generate(&self.env);
        token::StellarAssetClient::new(&self.env, &self.token).mint(&user, &amount);
        user
    }
    fn name(&self, text: &str) -> String {
        String::from_str(&self.env, text)
    }
}

#[test]
fn a_two_person_circle_completes_a_full_cycle() {
    let ctx = setup();
    let a = ctx.funded_user(1_000);
    let b = ctx.funded_user(1_000);

    let id = ctx
        .circles()
        .create_circle(&a, &ctx.token, &ctx.name("Rent fund"), &100, &1_000, &2);
    assert_eq!(
        ctx.circles().get_circle(&id).status,
        CircleStatus::Forming
    );

    ctx.circles().join_circle(&b, &id);
    assert_eq!(ctx.circles().get_circle(&id).status, CircleStatus::Active);

    // Round 0: both pay in, a (joined first) gets the pot.
    ctx.circles().contribute(&a, &id);
    assert_eq!(ctx.token().balance(&a), 900); // paid in, not yet settled
    ctx.circles().contribute(&b, &id);

    assert_eq!(ctx.token().balance(&a), 1_100); // 900 + 200 pot
    assert_eq!(ctx.token().balance(&b), 900);
    assert_eq!(ctx.token().balance(&ctx.circles), 0); // nothing stranded
    assert_eq!(ctx.circles().get_circle(&id).current_round, 1);

    // Round 1: both pay in again, b gets the pot this time.
    ctx.circles().contribute(&a, &id);
    ctx.circles().contribute(&b, &id);

    assert_eq!(ctx.token().balance(&a), 1_000); // net zero across both rounds
    assert_eq!(ctx.token().balance(&b), 1_000);
    assert_eq!(ctx.token().balance(&ctx.circles), 0);
    assert_eq!(
        ctx.circles().get_circle(&id).status,
        CircleStatus::Completed
    );
}

#[test]
fn a_three_person_circle_pays_out_in_join_order() {
    let ctx = setup();
    let a = ctx.funded_user(1_000);
    let b = ctx.funded_user(1_000);
    let c = ctx.funded_user(1_000);

    let id = ctx
        .circles()
        .create_circle(&a, &ctx.token, &ctx.name("Trio"), &50, &1_000, &3);
    ctx.circles().join_circle(&b, &id);
    ctx.circles().join_circle(&c, &id); // fills it -> activates

    ctx.circles().contribute(&a, &id);
    ctx.circles().contribute(&b, &id);
    ctx.circles().contribute(&c, &id); // last in -> settles round 0 to a

    assert_eq!(ctx.token().balance(&a), 1_100); // -50 paid, +150 pot
    assert_eq!(ctx.circles().get_circle(&id).current_round, 1);
}

#[test]
fn a_circle_only_activates_once_every_slot_is_filled() {
    let ctx = setup();
    let a = ctx.funded_user(1_000);
    let b = ctx.funded_user(1_000);

    let id = ctx
        .circles()
        .create_circle(&a, &ctx.token, &ctx.name("Three needed"), &10, &1_000, &3);
    assert_eq!(
        ctx.circles().try_contribute(&a, &id).unwrap_err(),
        err(Error::StillForming)
    );

    ctx.circles().join_circle(&b, &id);
    assert_eq!(
        ctx.circles().get_circle(&id).status,
        CircleStatus::Forming
    ); // still one slot short
}

#[test]
fn joining_a_full_circle_is_rejected() {
    let ctx = setup();
    let a = ctx.funded_user(1_000);
    let b = ctx.funded_user(1_000);
    let c = ctx.funded_user(1_000);

    let id = ctx
        .circles()
        .create_circle(&a, &ctx.token, &ctx.name("Pair"), &10, &1_000, &2);
    ctx.circles().join_circle(&b, &id); // fills it

    assert_eq!(
        ctx.circles().try_join_circle(&c, &id).unwrap_err(),
        err(Error::CircleFull)
    );
}

#[test]
fn joining_twice_is_rejected() {
    let ctx = setup();
    let a = ctx.funded_user(1_000);
    let b = ctx.funded_user(1_000);

    let id = ctx
        .circles()
        .create_circle(&a, &ctx.token, &ctx.name("Trio"), &10, &1_000, &3);
    ctx.circles().join_circle(&b, &id);

    assert_eq!(
        ctx.circles().try_join_circle(&b, &id).unwrap_err(),
        err(Error::AlreadyMember)
    );
}

#[test]
fn contributing_twice_in_one_round_is_rejected() {
    let ctx = setup();
    let a = ctx.funded_user(1_000);
    let b = ctx.funded_user(1_000);

    let id = ctx
        .circles()
        .create_circle(&a, &ctx.token, &ctx.name("Pair"), &10, &1_000, &2);
    ctx.circles().join_circle(&b, &id);
    ctx.circles().contribute(&a, &id);

    assert_eq!(
        ctx.circles().try_contribute(&a, &id).unwrap_err(),
        err(Error::AlreadyContributed)
    );
}

#[test]
fn only_members_can_contribute() {
    let ctx = setup();
    let a = ctx.funded_user(1_000);
    let b = ctx.funded_user(1_000);
    let outsider = ctx.funded_user(1_000);

    let id = ctx
        .circles()
        .create_circle(&a, &ctx.token, &ctx.name("Pair"), &10, &1_000, &2);
    ctx.circles().join_circle(&b, &id);

    assert_eq!(
        ctx.circles().try_contribute(&outsider, &id).unwrap_err(),
        err(Error::NotAMember)
    );
}

#[test]
fn a_stalled_contribution_can_be_reclaimed_after_the_grace_period() {
    let ctx = setup();
    let a = ctx.funded_user(1_000);
    let b = ctx.funded_user(1_000);

    ctx.env.ledger().set_timestamp(1_000);
    let id = ctx
        .circles()
        .create_circle(&a, &ctx.token, &ctx.name("Pair"), &100, &500, &2);
    ctx.circles().join_circle(&b, &id); // activates at t=1000

    ctx.circles().contribute(&a, &id); // a pays in, b never shows up
    assert_eq!(ctx.token().balance(&a), 900);

    ctx.env.ledger().set_timestamp(1_501); // past round_start(1000) + 500
    ctx.circles().reclaim_stalled_round(&a, &id);

    assert_eq!(ctx.token().balance(&a), 1_000); // made whole
    assert_eq!(ctx.token().balance(&ctx.circles), 0);
    assert!(!ctx.circles().get_circle(&id).contributed.get(0).unwrap());
}

#[test]
fn reclaiming_before_the_grace_period_is_rejected() {
    let ctx = setup();
    let a = ctx.funded_user(1_000);
    let b = ctx.funded_user(1_000);

    ctx.env.ledger().set_timestamp(1_000);
    let id = ctx
        .circles()
        .create_circle(&a, &ctx.token, &ctx.name("Pair"), &100, &500, &2);
    ctx.circles().join_circle(&b, &id);
    ctx.circles().contribute(&a, &id);

    ctx.env.ledger().set_timestamp(1_200); // still within the 500s window
    assert_eq!(
        ctx.circles().try_reclaim_stalled_round(&a, &id).unwrap_err(),
        err(Error::RoundStillOpen)
    );
}

#[test]
fn reclaiming_with_nothing_paid_in_is_rejected() {
    let ctx = setup();
    let a = ctx.funded_user(1_000);
    let b = ctx.funded_user(1_000);

    let id = ctx
        .circles()
        .create_circle(&a, &ctx.token, &ctx.name("Pair"), &100, &500, &2);
    ctx.circles().join_circle(&b, &id);

    ctx.env.ledger().set_timestamp(10_000);
    assert_eq!(
        ctx.circles().try_reclaim_stalled_round(&a, &id).unwrap_err(),
        err(Error::NothingToReclaim)
    );
}

#[test]
fn an_invalid_size_is_rejected() {
    let ctx = setup();
    let a = ctx.funded_user(1_000);

    assert_eq!(
        ctx.circles()
            .try_create_circle(&a, &ctx.token, &ctx.name("Too small"), &10, &1_000, &1)
            .unwrap_err(),
        err(Error::InvalidSize)
    );
    assert_eq!(
        ctx.circles()
            .try_create_circle(&a, &ctx.token, &ctx.name("Too big"), &10, &1_000, &13)
            .unwrap_err(),
        err(Error::InvalidSize)
    );
}

#[test]
fn a_non_positive_contribution_is_rejected() {
    let ctx = setup();
    let a = ctx.funded_user(1_000);

    assert_eq!(
        ctx.circles()
            .try_create_circle(&a, &ctx.token, &ctx.name("Zero"), &0, &1_000, &2)
            .unwrap_err(),
        err(Error::InvalidAmount)
    );
}

#[test]
fn a_zero_length_round_is_rejected() {
    let ctx = setup();
    let a = ctx.funded_user(1_000);

    assert_eq!(
        ctx.circles()
            .try_create_circle(&a, &ctx.token, &ctx.name("Instant"), &10, &0, &2)
            .unwrap_err(),
        err(Error::InvalidRoundLength)
    );
}

#[test]
fn an_empty_name_is_rejected() {
    let ctx = setup();
    let a = ctx.funded_user(1_000);

    assert_eq!(
        ctx.circles()
            .try_create_circle(&a, &ctx.token, &ctx.name(""), &10, &1_000, &2)
            .unwrap_err(),
        err(Error::InvalidName)
    );
}

#[test]
fn contributing_to_a_completed_circle_is_rejected() {
    let ctx = setup();
    let a = ctx.funded_user(1_000);
    let b = ctx.funded_user(1_000);

    let id = ctx
        .circles()
        .create_circle(&a, &ctx.token, &ctx.name("Pair"), &10, &1_000, &2);
    ctx.circles().join_circle(&b, &id);
    ctx.circles().contribute(&a, &id);
    ctx.circles().contribute(&b, &id); // round 0 settles
    ctx.circles().contribute(&a, &id);
    ctx.circles().contribute(&b, &id); // round 1 settles -> Completed

    assert_eq!(
        ctx.circles().try_contribute(&a, &id).unwrap_err(),
        err(Error::AlreadyCompleted)
    );
}

#[test]
fn an_unknown_circle_id_is_rejected() {
    let ctx = setup();
    let a = ctx.funded_user(1_000);

    assert_eq!(ctx.circles().try_get_circle(&99).unwrap_err(), err(Error::CircleNotFound));
    assert_eq!(
        ctx.circles().try_join_circle(&a, &99).unwrap_err(),
        err(Error::CircleNotFound)
    );
}
