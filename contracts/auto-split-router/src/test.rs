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

// --------------------------------------------------------------------- goals

fn name(env: &Env, text: &str) -> String {
    String::from_str(env, text)
}

#[test]
fn a_goal_takes_its_slice_of_each_transfer() {
    let ctx = setup();
    let sender = ctx.funded_user(10_000);
    let recipient = Address::generate(&ctx.env);

    let id = ctx
        .router()
        .add_goal(&recipient, &name(&ctx.env, "Phone"), &0, &0, &3_000);
    assert_eq!(id, 1);

    let split = ctx.router().route(&sender, &recipient, &1_000);
    assert_eq!(split, Split { payout: 700, saved: 300 });
    assert_eq!(ctx.vault().balance_of(&recipient), 300);
    assert_eq!(ctx.router().get_goals(&recipient).get(0).unwrap().saved, 300);
}

#[test]
fn a_targeted_goal_stops_at_its_target() {
    let ctx = setup();
    let sender = ctx.funded_user(10_000);
    let recipient = Address::generate(&ctx.env);
    // 50% of every transfer, capped at 100 total.
    ctx.router()
        .add_goal(&recipient, &name(&ctx.env, "New shoes"), &100, &0, &5_000);

    let first = ctx.router().route(&sender, &recipient, &300); // wants 150, room 100
    assert_eq!(first, Split { payout: 200, saved: 100 });
    assert_eq!(
        ctx.router().get_goals(&recipient).get(0).unwrap().status,
        GoalStatus::Reached
    );

    // Next transfer ignores the full goal entirely.
    let second = ctx.router().route(&sender, &recipient, &300);
    assert_eq!(second, Split { payout: 300, saved: 0 });
}

#[test]
fn a_full_goal_cascades_its_slice_to_the_next() {
    let ctx = setup();
    let sender = ctx.funded_user(10_000);
    let recipient = Address::generate(&ctx.env);
    // Priority 1: phone, 50%, capped at 30. Priority 2: open-ended savings, 30%.
    ctx.router()
        .add_goal(&recipient, &name(&ctx.env, "Phone"), &30, &0, &5_000);
    ctx.router()
        .add_goal(&recipient, &name(&ctx.env, "Savings"), &0, &0, &3_000);

    // 100 in: phone base 50 -> takes 30, carries 20. savings base 30 + 20 = 50.
    let split = ctx.router().route(&sender, &recipient, &100);
    assert_eq!(split, Split { payout: 20, saved: 80 });

    let goals = ctx.router().get_goals(&recipient);
    assert_eq!(goals.get(0).unwrap().saved, 30);
    assert_eq!(goals.get(1).unwrap().saved, 50);
}

#[test]
fn priority_order_changes_where_the_money_lands() {
    let ctx = setup();
    let sender = ctx.funded_user(10_000);

    let a = Address::generate(&ctx.env);
    ctx.router().add_goal(&a, &name(&ctx.env, "Phone"), &30, &0, &5_000);
    ctx.router().add_goal(&a, &name(&ctx.env, "Savings"), &0, &0, &3_000);

    let b = Address::generate(&ctx.env);
    let g1 = ctx.router().add_goal(&b, &name(&ctx.env, "Phone"), &30, &0, &5_000);
    let g2 = ctx
        .router()
        .add_goal(&b, &name(&ctx.env, "Savings"), &0, &0, &3_000);
    // Put open-ended savings first.
    ctx.router()
        .reorder_goals(&b, &Vec::from_array(&ctx.env, [g2, g1]));

    let split_a = ctx.router().route(&sender, &a, &100);
    let split_b = ctx.router().route(&sender, &b, &100);

    assert_eq!(split_a, Split { payout: 20, saved: 80 });
    // b: savings base 30 -> takes 30. phone base 50 -> takes 30, carry 20 lost.
    assert_eq!(split_b, Split { payout: 40, saved: 60 });
}

#[test]
fn allocations_across_goals_cannot_exceed_one_hundred_percent() {
    let ctx = setup();
    let recipient = Address::generate(&ctx.env);
    ctx.router()
        .add_goal(&recipient, &name(&ctx.env, "A"), &0, &0, &6_000);

    assert_eq!(
        ctx.router()
            .try_add_goal(&recipient, &name(&ctx.env, "B"), &0, &0, &5_000)
            .unwrap_err(),
        err(Error::InvalidSplit)
    );
}

#[test]
fn archiving_a_goal_frees_its_allocation() {
    let ctx = setup();
    let recipient = Address::generate(&ctx.env);
    let a = ctx
        .router()
        .add_goal(&recipient, &name(&ctx.env, "A"), &0, &0, &6_000);

    assert_eq!(
        ctx.router()
            .try_add_goal(&recipient, &name(&ctx.env, "B"), &0, &0, &5_000)
            .unwrap_err(),
        err(Error::InvalidSplit)
    );

    ctx.router().archive_goal(&recipient, &a);
    let b = ctx
        .router()
        .add_goal(&recipient, &name(&ctx.env, "B"), &0, &0, &5_000);
    assert_eq!(b, 2);
    assert_eq!(ctx.router().get_rule(&recipient).save_bps, 5_000);
}

#[test]
fn raising_the_target_reactivates_a_reached_goal() {
    let ctx = setup();
    let sender = ctx.funded_user(10_000);
    let recipient = Address::generate(&ctx.env);
    let id = ctx
        .router()
        .add_goal(&recipient, &name(&ctx.env, "Bike"), &50, &0, &10_000);

    ctx.router().route(&sender, &recipient, &50); // reaches target exactly
    assert_eq!(
        ctx.router().get_goals(&recipient).get(0).unwrap().status,
        GoalStatus::Reached
    );

    ctx.router()
        .update_goal(&recipient, &id, &name(&ctx.env, "Bike"), &120, &0, &10_000);
    assert_eq!(
        ctx.router().get_goals(&recipient).get(0).unwrap().status,
        GoalStatus::Active
    );

    let split = ctx.router().route(&sender, &recipient, &50);
    assert_eq!(split, Split { payout: 0, saved: 50 });
}

#[test]
fn get_rule_reports_the_sum_of_active_goal_allocations() {
    let ctx = setup();
    let recipient = Address::generate(&ctx.env);
    ctx.router()
        .add_goal(&recipient, &name(&ctx.env, "A"), &0, &0, &2_000);
    ctx.router()
        .add_goal(&recipient, &name(&ctx.env, "B"), &0, &0, &1_500);

    let rule = ctx.router().get_rule(&recipient);
    assert_eq!(rule.save_bps, 3_500);
    assert!(rule.enabled);
}

#[test]
fn set_rule_creates_and_maintains_one_default_goal() {
    let ctx = setup();
    let sender = ctx.funded_user(10_000);
    let recipient = Address::generate(&ctx.env);

    ctx.router().set_rule(&recipient, &2_000);
    let goals = ctx.router().get_goals(&recipient);
    assert_eq!(goals.len(), 1);
    assert_eq!(goals.get(0).unwrap().name, name(&ctx.env, "Savings"));
    assert_eq!(goals.get(0).unwrap().allocation_bps, 2_000);

    let split = ctx.router().route(&sender, &recipient, &500);
    assert_eq!(split, Split { payout: 400, saved: 100 });

    // Bumping the rate updates the same goal rather than adding another.
    ctx.router().set_rule(&recipient, &5_000);
    let goals = ctx.router().get_goals(&recipient);
    assert_eq!(goals.len(), 1);
    assert_eq!(goals.get(0).unwrap().allocation_bps, 5_000);
}

#[test]
fn set_rule_zero_archives_the_default_goal() {
    let ctx = setup();
    let recipient = Address::generate(&ctx.env);
    ctx.router().set_rule(&recipient, &3_000);
    ctx.router().set_rule(&recipient, &0);

    assert!(!ctx.router().get_rule(&recipient).enabled);
    assert_eq!(
        ctx.router().get_goals(&recipient).get(0).unwrap().status,
        GoalStatus::Archived
    );
}

#[test]
fn quote_plan_breakdown_matches_the_saved_total() {
    let ctx = setup();
    let sender = ctx.funded_user(10_000);
    let recipient = Address::generate(&ctx.env);
    ctx.router()
        .add_goal(&recipient, &name(&ctx.env, "Phone"), &30, &0, &5_000);
    ctx.router()
        .add_goal(&recipient, &name(&ctx.env, "Savings"), &0, &0, &3_000);

    let plan = ctx.router().quote_plan(&recipient, &100);
    let quoted = ctx.router().quote(&recipient, &100);

    let mut sum = 0i128;
    for fill in plan.iter() {
        sum += fill.amount;
    }
    assert_eq!(sum, quoted.saved);

    ctx.router().route(&sender, &recipient, &100);
    let goals = ctx.router().get_goals(&recipient);
    assert_eq!(goals.get(0).unwrap().saved, plan.get(0).unwrap().amount);
    assert_eq!(goals.get(1).unwrap().saved, plan.get(1).unwrap().amount);
}

#[test]
fn goals_belong_to_one_recipient_only() {
    let ctx = setup();
    let sender = ctx.funded_user(10_000);
    let saver = Address::generate(&ctx.env);
    let other = Address::generate(&ctx.env);
    ctx.router()
        .add_goal(&saver, &name(&ctx.env, "Phone"), &0, &0, &4_000);

    ctx.router().route(&sender, &other, &200);
    assert_eq!(ctx.vault().balance_of(&other), 0);
    assert_eq!(ctx.token().balance(&other), 200);
    assert!(ctx.router().get_goals(&other).is_empty());
}

#[test]
fn too_many_goals_is_rejected() {
    let ctx = setup();
    let recipient = Address::generate(&ctx.env);
    for _ in 0..MAX_GOALS {
        ctx.router()
            .add_goal(&recipient, &name(&ctx.env, "g"), &0, &0, &0);
    }
    assert_eq!(
        ctx.router()
            .try_add_goal(&recipient, &name(&ctx.env, "one too many"), &0, &0, &0)
            .unwrap_err(),
        err(Error::TooManyGoals)
    );
}

#[test]
fn reorder_rejects_a_list_that_is_not_a_permutation() {
    let ctx = setup();
    let recipient = Address::generate(&ctx.env);
    let g1 = ctx
        .router()
        .add_goal(&recipient, &name(&ctx.env, "A"), &0, &0, &1_000);
    ctx.router()
        .add_goal(&recipient, &name(&ctx.env, "B"), &0, &0, &1_000);

    assert_eq!(
        ctx.router()
            .try_reorder_goals(&recipient, &Vec::from_array(&ctx.env, [g1, g1]))
            .unwrap_err(),
        err(Error::BadReorder)
    );
}

#[test]
fn an_empty_goal_name_is_rejected() {
    let ctx = setup();
    let recipient = Address::generate(&ctx.env);
    assert_eq!(
        ctx.router()
            .try_add_goal(&recipient, &name(&ctx.env, ""), &0, &0, &1_000)
            .unwrap_err(),
        err(Error::InvalidName)
    );
}

#[test]
fn touching_a_missing_goal_is_rejected() {
    let ctx = setup();
    let recipient = Address::generate(&ctx.env);
    assert_eq!(
        ctx.router().try_archive_goal(&recipient, &99).unwrap_err(),
        err(Error::GoalNotFound)
    );
}
