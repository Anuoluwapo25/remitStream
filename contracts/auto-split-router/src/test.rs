#![cfg(test)]
extern crate std;

use super::*;
use savings_vault::{SavingsVault, SavingsVaultClient};
use soroban_sdk::testutils::Address as _;

struct Ctx {
    env: Env,
    router: Address,
    vault: Address,
    token: Address,
}

/// The contract panics with an error rather than returning `Result`, so `try_*`
/// surfaces the host-level `soroban_sdk::Error`. This converts for comparison.
fn err(e: Error) -> Result<soroban_sdk::Error, soroban_sdk::InvokeError> {
    Ok(e.into())
}

fn setup() -> Ctx {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(admin.clone()).address();

    let vault = env.register(SavingsVault, ());
    SavingsVaultClient::new(&env, &vault).initialize(&admin, &token);

    let router = env.register(AutoSplitRouter, ());
    AutoSplitRouterClient::new(&env, &router).initialize(&admin, &vault, &token);

    // The vault only accepts credits from this router.
    SavingsVaultClient::new(&env, &vault).set_router(&router);

    Ctx {
        env,
        router,
        vault,
        token,
    }
}

impl Ctx {
    fn router(&self) -> AutoSplitRouterClient<'_> {
        AutoSplitRouterClient::new(&self.env, &self.router)
    }
    fn vault(&self) -> SavingsVaultClient<'_> {
        SavingsVaultClient::new(&self.env, &self.vault)
    }
    fn token(&self) -> token::TokenClient<'_> {
        token::TokenClient::new(&self.env, &self.token)
    }
    fn funded_user(&self, amount: i128) -> Address {
        let user = Address::generate(&self.env);
        token::StellarAssetClient::new(&self.env, &self.token).mint(&user, &amount);
        user
    }
}

#[test]
fn without_a_rule_the_whole_amount_is_paid_out() {
    let ctx = setup();
    let sender = ctx.funded_user(1_000);
    let recipient = Address::generate(&ctx.env);

    let split = ctx.router().route(&sender, &recipient, &500);

    assert_eq!(split, Split { payout: 500, saved: 0 });
    assert_eq!(ctx.token().balance(&recipient), 500);
    assert_eq!(ctx.vault().balance_of(&recipient), 0);
    // The router never keeps a residue.
    assert_eq!(ctx.token().balance(&ctx.router), 0);
}

#[test]
fn a_twenty_percent_rule_splits_the_remittance() {
    let ctx = setup();
    let sender = ctx.funded_user(1_000);
    let recipient = Address::generate(&ctx.env);

    ctx.router().set_rule(&recipient, &2_000); // 20%
    let split = ctx.router().route(&sender, &recipient, &500);

    assert_eq!(split, Split { payout: 400, saved: 100 });
    assert_eq!(ctx.token().balance(&recipient), 400);
    assert_eq!(ctx.vault().balance_of(&recipient), 100);
    assert_eq!(ctx.token().balance(&ctx.vault), 100);
    assert_eq!(ctx.token().balance(&ctx.router), 0);
}

#[test]
fn a_hundred_percent_rule_saves_everything() {
    let ctx = setup();
    let sender = ctx.funded_user(1_000);
    let recipient = Address::generate(&ctx.env);

    ctx.router().set_rule(&recipient, &10_000);
    let split = ctx.router().route(&sender, &recipient, &300);

    assert_eq!(split, Split { payout: 0, saved: 300 });
    assert_eq!(ctx.token().balance(&recipient), 0);
    assert_eq!(ctx.vault().balance_of(&recipient), 300);
}

#[test]
fn quote_matches_what_route_actually_does() {
    let ctx = setup();
    let sender = ctx.funded_user(10_000);
    let recipient = Address::generate(&ctx.env);
    ctx.router().set_rule(&recipient, &3_300);

    let quoted = ctx.router().quote(&recipient, &777);
    let actual = ctx.router().route(&sender, &recipient, &777);

    assert_eq!(quoted, actual);
}

#[test]
fn rounding_leaves_no_tokens_stranded_in_the_router() {
    let ctx = setup();
    let sender = ctx.funded_user(10_000);
    let recipient = Address::generate(&ctx.env);
    ctx.router().set_rule(&recipient, &3_333); // 33.33% of 101 -> 33.6633

    let split = ctx.router().route(&sender, &recipient, &101);

    assert_eq!(split.saved, 33); // truncated in the recipient's favour
    assert_eq!(split.payout, 68);
    assert_eq!(split.payout + split.saved, 101);
    assert_eq!(ctx.token().balance(&ctx.router), 0);
}

#[test]
fn each_recipient_has_an_independent_rule() {
    let ctx = setup();
    let sender = ctx.funded_user(10_000);
    let saver = Address::generate(&ctx.env);
    let spender = Address::generate(&ctx.env);

    ctx.router().set_rule(&saver, &5_000);

    ctx.router().route(&sender, &saver, &200);
    ctx.router().route(&sender, &spender, &200);

    assert_eq!(ctx.vault().balance_of(&saver), 100);
    assert_eq!(ctx.vault().balance_of(&spender), 0);
    assert_eq!(ctx.token().balance(&spender), 200);
}

#[test]
fn stats_accumulate_across_transfers() {
    let ctx = setup();
    let sender = ctx.funded_user(10_000);
    let recipient = Address::generate(&ctx.env);
    ctx.router().set_rule(&recipient, &2_500);

    ctx.router().route(&sender, &recipient, &400);
    ctx.router().route(&sender, &recipient, &800);

    let stats = ctx.router().get_stats(&recipient);
    assert_eq!(stats.total_received, 1_200);
    assert_eq!(stats.total_saved, 300);
    assert_eq!(stats.transfers, 2);
}

#[test]
fn savings_from_multiple_remittances_compound_with_yield() {
    let ctx = setup();
    let sender = ctx.funded_user(10_000);
    let recipient = Address::generate(&ctx.env);
    let admin = ctx.vault().config().admin;
    token::StellarAssetClient::new(&ctx.env, &ctx.token).mint(&admin, &10_000);

    ctx.router().set_rule(&recipient, &5_000);
    ctx.router().route(&sender, &recipient, &200); // saves 100
    ctx.vault().accrue_yield(&100); // share price doubles
    ctx.router().route(&sender, &recipient, &200); // saves another 100

    // 100 grown to 200, plus the new 100 deposit.
    assert_eq!(ctx.vault().balance_of(&recipient), 300);
}

#[test]
fn recipient_can_turn_saving_back_off() {
    let ctx = setup();
    let sender = ctx.funded_user(10_000);
    let recipient = Address::generate(&ctx.env);

    ctx.router().set_rule(&recipient, &5_000);
    ctx.router().route(&sender, &recipient, &100);
    assert_eq!(ctx.vault().balance_of(&recipient), 50);

    ctx.router().set_rule(&recipient, &0);
    assert!(!ctx.router().get_rule(&recipient).enabled);
    ctx.router().route(&sender, &recipient, &100);

    // Nothing new was saved.
    assert_eq!(ctx.vault().balance_of(&recipient), 50);
}

#[test]
fn a_split_above_one_hundred_percent_is_rejected() {
    let ctx = setup();
    let recipient = Address::generate(&ctx.env);

    assert_eq!(
        ctx.router().try_set_rule(&recipient, &10_001).unwrap_err(),
        err(Error::InvalidSplit)
    );
}

#[test]
fn sending_to_yourself_is_rejected() {
    let ctx = setup();
    let sender = ctx.funded_user(1_000);

    assert_eq!(
        ctx.router().try_route(&sender, &sender, &100).unwrap_err(),
        err(Error::SelfTransfer)
    );
}

#[test]
fn non_positive_amounts_are_rejected() {
    let ctx = setup();
    let sender = ctx.funded_user(1_000);
    let recipient = Address::generate(&ctx.env);

    assert_eq!(
        ctx.router().try_route(&sender, &recipient, &0).unwrap_err(),
        err(Error::InvalidAmount)
    );
    assert_eq!(
        ctx.router().try_route(&sender, &recipient, &-1).unwrap_err(),
        err(Error::InvalidAmount)
    );
}

#[test]
fn recipient_can_withdraw_savings_after_routing() {
    let ctx = setup();
    let sender = ctx.funded_user(10_000);
    let recipient = Address::generate(&ctx.env);
    ctx.router().set_rule(&recipient, &4_000);

    ctx.router().route(&sender, &recipient, &1_000); // 600 paid out, 400 saved
    ctx.vault().withdraw(&recipient, &400);

    assert_eq!(ctx.token().balance(&recipient), 1_000);
    assert_eq!(ctx.vault().balance_of(&recipient), 0);
}

#[test]
fn initialize_is_one_shot() {
    let ctx = setup();
    let admin = Address::generate(&ctx.env);

    assert_eq!(
        ctx.router().try_initialize(&admin, &ctx.vault, &ctx.token).unwrap_err(),
        err(Error::AlreadyInitialized)
    );
}
