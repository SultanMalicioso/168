import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DAY_TIERS, tierFor } from "./history-store";

describe("tierFor", () => {
  it("maps each completion range to its level", () => {
    assert.equal(tierFor(0), DAY_TIERS.zero);
    assert.equal(tierFor(1), DAY_TIERS.low);
    assert.equal(tierFor(49.9), DAY_TIERS.low);
    assert.equal(tierFor(50), DAY_TIERS.high);
    assert.equal(tierFor(74.9), DAY_TIERS.high);
    assert.equal(tierFor(75), DAY_TIERS.great);
    assert.equal(tierFor(99.9), DAY_TIERS.great);
    assert.equal(tierFor(100), DAY_TIERS.full);
  });
});
