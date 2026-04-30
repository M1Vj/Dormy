import { expect, test } from "@playwright/test";

import { getContributionCollectedAmount } from "../src/lib/contribution-ledger";

test.describe("contribution collected amount", () => {
  test("counts payments received by treasurer", () => {
    const collected = getContributionCollectedAmount("payment", -250);

    expect(collected).toBe(250);
  });

  test("does not count non-payment entries", () => {
    const chargeCollected = getContributionCollectedAmount("charge", 250);
    const adjustmentCollected = getContributionCollectedAmount("adjustment", -250);

    expect(chargeCollected).toBe(0);
    expect(adjustmentCollected).toBe(0);
  });

  test("excludes paid elsewhere rows from collected totals", () => {
    const collected = getContributionCollectedAmount("payment", -250, {
      paid_elsewhere: true,
    });

    expect(collected).toBe(0);
  });

  test("excludes declined rows from collected totals", () => {
    const collected = getContributionCollectedAmount("payment", -250, {
      optional_declined: true,
    });

    expect(collected).toBe(0);
  });

  test("excludes legacy status tags for paid elsewhere and declined", () => {
    const paidElsewhereCollected = getContributionCollectedAmount("payment", -250, {
      status: "paid_elsewhere",
    });
    const declinedCollected = getContributionCollectedAmount("payment", -250, {
      status: "declined",
    });

    expect(paidElsewhereCollected).toBe(0);
    expect(declinedCollected).toBe(0);
  });

  test("excludes legacy status tags regardless of case and whitespace", () => {
    const paidElsewhereCollected = getContributionCollectedAmount("payment", -250, {
      status: "  Paid_Elsewhere  ",
    });
    const declinedCollected = getContributionCollectedAmount("payment", -250, {
      status: "  DECLINED ",
    });

    expect(paidElsewhereCollected).toBe(0);
    expect(declinedCollected).toBe(0);
  });
});
