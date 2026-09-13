#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger as _};

struct Ctx {
    env: Env,
    claims: Address,
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

    let claims = env.register(ClaimLink, ());
    ClaimLinkClient::new(&env, &claims).initialize(&token);

    Ctx { env, claims, token }
}

impl Ctx {
    fn claims(&self) -> ClaimLinkClient<'_> {
        ClaimLinkClient::new(&self.env, &self.claims)
    }
    fn token(&self) -> token::TokenClient<'_> {
        token::TokenClient::new(&self.env, &self.token)
    }
    fn funded_user(&self, amount: i128) -> Address {
        let user = Address::generate(&self.env);
        token::StellarAssetClient::new(&self.env, &self.token).mint(&user, &amount);
        user
    }
    fn note(&self, text: &str) -> String {
        String::from_str(&self.env, text)
    }
}

/// A secret and the hash `create_claim` is given instead of the secret itself
/// — mirroring how the real flow never sends the raw secret on-chain until
/// the moment of claim.
fn secret_and_hash(ctx: &Ctx, raw: &[u8]) -> (Bytes, BytesN<32>) {
    let secret = Bytes::from_slice(&ctx.env, raw);
    let hash: BytesN<32> = ctx.env.crypto().sha256(&secret).into();
    (secret, hash)
}

#[test]
fn a_correct_secret_delivers_the_funds() {
    let ctx = setup();
    let sender = ctx.funded_user(1_000);
    let recipient = Address::generate(&ctx.env); // has no funds, no prior activity
    let (secret, hash) = secret_and_hash(&ctx, b"correct horse battery");

    let id = ctx
        .claims()
        .create_claim(&sender, &500, &hash, &0, &ctx.note(""));
    assert_eq!(ctx.token().balance(&sender), 500);
    assert_eq!(ctx.token().balance(&ctx.claims), 500);

    let paid = ctx.claims().claim(&id, &secret, &recipient);

    assert_eq!(paid, 500);
    assert_eq!(ctx.token().balance(&recipient), 500);
    assert_eq!(ctx.token().balance(&ctx.claims), 0); // nothing stranded
    assert_eq!(ctx.claims().get_claim(&id).status, ClaimStatus::Claimed);
}

#[test]
fn the_recipient_never_has_to_sign() {
    // claim() takes no auth at all from `to` — proven by never calling
    // mock_all_auths for this test and still succeeding, since no auth is
    // required of anyone but the sender at creation time.
    let env = Env::default();
    let admin = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let claims = env.register(ClaimLink, ());
    let client = ClaimLinkClient::new(&env, &claims);
    client.initialize(&token);

    // Creating the claim still needs the sender's signature.
    env.mock_all_auths();
    let sender = Address::generate(&env);
    token::StellarAssetClient::new(&env, &token).mint(&sender, &1_000);
    let secret = Bytes::from_array(&env, b"give-this-to-mom!");
    let hash: BytesN<32> = env.crypto().sha256(&secret).into();
    let id = client.create_claim(&sender, &200, &hash, &0, &String::from_str(&env, "for mom"));

    // Now revoke all mocked auths and prove claim() still works unsigned.
    env.set_auths(&[]);
    let recipient = Address::generate(&env);
    client.claim(&id, &secret, &recipient);
    assert_eq!(token::TokenClient::new(&env, &token).balance(&recipient), 200);
}

#[test]
fn the_wrong_secret_is_rejected() {
    let ctx = setup();
    let sender = ctx.funded_user(1_000);
    let recipient = Address::generate(&ctx.env);
    let (_, hash) = secret_and_hash(&ctx, b"the-real-secret!");
    let (wrong, _) = secret_and_hash(&ctx, b"a-guessed-secret");

    let id = ctx
        .claims()
        .create_claim(&sender, &500, &hash, &0, &ctx.note(""));

    assert_eq!(
        ctx.claims().try_claim(&id, &wrong, &recipient).unwrap_err(),
        err(Error::WrongSecret)
    );
    // Untouched: still sitting in the contract, waiting for the real secret.
    assert_eq!(ctx.token().balance(&ctx.claims), 500);
}

#[test]
fn a_claim_cannot_be_redeemed_twice() {
    let ctx = setup();
    let sender = ctx.funded_user(1_000);
    let a = Address::generate(&ctx.env);
    let b = Address::generate(&ctx.env);
    let (secret, hash) = secret_and_hash(&ctx, b"one-time-use-only");

    let id = ctx
        .claims()
        .create_claim(&sender, &500, &hash, &0, &ctx.note(""));
    ctx.claims().claim(&id, &secret, &a);

    assert_eq!(
        ctx.claims().try_claim(&id, &secret, &b).unwrap_err(),
        err(Error::AlreadyResolved)
    );
    assert_eq!(ctx.token().balance(&b), 0);
}

#[test]
fn an_expired_claim_cannot_be_redeemed() {
    let ctx = setup();
    let sender = ctx.funded_user(1_000);
    let recipient = Address::generate(&ctx.env);
    let (secret, hash) = secret_and_hash(&ctx, b"too-slow-to-redeem");

    ctx.env.ledger().set_timestamp(1_000);
    let id = ctx
        .claims()
        .create_claim(&sender, &500, &hash, &1_500, &ctx.note(""));

    ctx.env.ledger().set_timestamp(1_501);
    assert_eq!(
        ctx.claims()
            .try_claim(&id, &secret, &recipient)
            .unwrap_err(),
        err(Error::Expired)
    );
}

#[test]
fn the_sender_reclaims_an_expired_unclaimed_transfer() {
    let ctx = setup();
    let sender = ctx.funded_user(1_000);
    let (_, hash) = secret_and_hash(&ctx, b"nobody-ever-opens-this");

    ctx.env.ledger().set_timestamp(1_000);
    let id = ctx
        .claims()
        .create_claim(&sender, &500, &hash, &1_500, &ctx.note(""));
    assert_eq!(ctx.token().balance(&sender), 500);

    ctx.env.ledger().set_timestamp(1_501);
    ctx.claims().reclaim(&id);

    assert_eq!(ctx.token().balance(&sender), 1_000); // whole to made back
    assert_eq!(ctx.token().balance(&ctx.claims), 0);
    assert_eq!(ctx.claims().get_claim(&id).status, ClaimStatus::Reclaimed);
}

#[test]
fn reclaiming_before_the_deadline_is_rejected() {
    let ctx = setup();
    let sender = ctx.funded_user(1_000);
    let (_, hash) = secret_and_hash(&ctx, b"still-within-window");

    ctx.env.ledger().set_timestamp(1_000);
    let id = ctx
        .claims()
        .create_claim(&sender, &500, &hash, &2_000, &ctx.note(""));

    assert_eq!(ctx.claims().try_reclaim(&id).unwrap_err(), err(Error::NotExpired));
}

#[test]
fn a_claim_with_no_deadline_can_never_be_reclaimed() {
    let ctx = setup();
    let sender = ctx.funded_user(1_000);
    let (_, hash) = secret_and_hash(&ctx, b"open-ended-commitment");

    let id = ctx
        .claims()
        .create_claim(&sender, &500, &hash, &0, &ctx.note(""));

    ctx.env.ledger().set_timestamp(999_999_999);
    assert_eq!(ctx.claims().try_reclaim(&id).unwrap_err(), err(Error::NotExpired));
}

#[test]
fn a_reclaimed_claim_cannot_then_be_claimed() {
    let ctx = setup();
    let sender = ctx.funded_user(1_000);
    let recipient = Address::generate(&ctx.env);
    let (secret, hash) = secret_and_hash(&ctx, b"reclaimed-already");

    ctx.env.ledger().set_timestamp(1_000);
    let id = ctx
        .claims()
        .create_claim(&sender, &500, &hash, &1_500, &ctx.note(""));
    ctx.env.ledger().set_timestamp(1_501);
    ctx.claims().reclaim(&id);

    assert_eq!(
        ctx.claims()
            .try_claim(&id, &secret, &recipient)
            .unwrap_err(),
        err(Error::AlreadyResolved)
    );
}

#[test]
fn a_non_positive_amount_is_rejected() {
    let ctx = setup();
    let sender = ctx.funded_user(1_000);
    let (_, hash) = secret_and_hash(&ctx, b"zero-amount-attempt");

    assert_eq!(
        ctx.claims()
            .try_create_claim(&sender, &0, &hash, &0, &ctx.note(""))
            .unwrap_err(),
        err(Error::InvalidAmount)
    );
}

#[test]
fn an_overlong_note_is_rejected() {
    let ctx = setup();
    let sender = ctx.funded_user(1_000);
    let (_, hash) = secret_and_hash(&ctx, b"note-too-long-oopsie");
    let long = "x".repeat((MAX_NOTE_LEN + 1) as usize);

    assert_eq!(
        ctx.claims()
            .try_create_claim(&sender, &100, &hash, &0, &ctx.note(&long))
            .unwrap_err(),
        err(Error::NoteTooLong)
    );
}

#[test]
fn an_unknown_claim_id_is_rejected_everywhere() {
    let ctx = setup();
    let recipient = Address::generate(&ctx.env);
    let (secret, _) = secret_and_hash(&ctx, b"doesnt-matter-here");

    assert_eq!(ctx.claims().try_get_claim(&99).unwrap_err(), err(Error::ClaimNotFound));
    assert_eq!(
        ctx.claims().try_claim(&99, &secret, &recipient).unwrap_err(),
        err(Error::ClaimNotFound)
    );
    assert_eq!(ctx.claims().try_reclaim(&99).unwrap_err(), err(Error::ClaimNotFound));
}

#[test]
fn anyone_can_preview_a_claim_before_redeeming_it() {
    let ctx = setup();
    let sender = ctx.funded_user(1_000);
    let (_, hash) = secret_and_hash(&ctx, b"preview-me-first");

    let id = ctx
        .claims()
        .create_claim(&sender, &321, &hash, &777, &ctx.note("rent money"));

    let preview = ctx.claims().get_claim(&id);
    assert_eq!(preview.amount, 321);
    assert_eq!(preview.expires_at, 777);
    assert_eq!(preview.note, ctx.note("rent money"));
    assert_eq!(preview.status, ClaimStatus::Pending);
}

#[test]
fn many_claims_from_different_senders_stay_independent() {
    let ctx = setup();
    let a = ctx.funded_user(1_000);
    let b = ctx.funded_user(1_000);
    let (secret_a, hash_a) = secret_and_hash(&ctx, b"claim-from-sender-a");
    let (secret_b, hash_b) = secret_and_hash(&ctx, b"claim-from-sender-b");

    let id_a = ctx.claims().create_claim(&a, &100, &hash_a, &0, &ctx.note(""));
    let id_b = ctx.claims().create_claim(&b, &200, &hash_b, &0, &ctx.note(""));
    assert_ne!(id_a, id_b);

    let recipient = Address::generate(&ctx.env);
    ctx.claims().claim(&id_a, &secret_a, &recipient);
    assert_eq!(ctx.token().balance(&recipient), 100);

    // b's claim is untouched by a's redemption.
    assert_eq!(ctx.claims().get_claim(&id_b).status, ClaimStatus::Pending);
    ctx.claims().claim(&id_b, &secret_b, &recipient);
    assert_eq!(ctx.token().balance(&recipient), 300);
}

#[test]
fn initialize_is_one_shot() {
    let ctx = setup();
    assert_eq!(
        ctx.claims().try_initialize(&ctx.token).unwrap_err(),
        err(Error::AlreadyInitialized)
    );
}
