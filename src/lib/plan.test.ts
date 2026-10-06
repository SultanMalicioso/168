import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FEATURES,
  devToolsEnabled,
  getDevPlanOverride,
  planAllows,
  resolvePlan,
  type Feature,
  type Plan,
} from "./plan";

const NOW = Date.parse("2026-10-03T12:00:00Z");

describe("resolvePlan", () => {
  it("defaults to Free without a valid Pro row", () => {
    assert.equal(resolvePlan(null, NOW), "free");
    assert.equal(resolvePlan(undefined, NOW), "free");
    assert.equal(resolvePlan({ plan: "free", expires_at: null }, NOW), "free");
    assert.equal(resolvePlan({ plan: "gold", expires_at: null }, NOW), "free");
  });

  it("Pro without expiry or with a future expiry is Pro", () => {
    assert.equal(resolvePlan({ plan: "pro", expires_at: null }, NOW), "pro");
    assert.equal(resolvePlan({ plan: "pro", expires_at: "2026-11-01T00:00:00Z" }, NOW), "pro");
  });

  it("an expired Pro falls back to Free", () => {
    assert.equal(resolvePlan({ plan: "pro", expires_at: "2026-10-01T00:00:00Z" }, NOW), "free");
  });
});

describe("planAllows", () => {
  const features = Object.keys(FEATURES) as Feature[];
  const requiredPlan = (f: Feature): Plan => FEATURES[f].plan;

  it("Pro includes every feature", () => {
    for (const f of features) assert.equal(planAllows("pro", f), true, f);
  });

  it("Free only includes features declared as free", () => {
    for (const f of features) assert.equal(planAllows("free", f), requiredPlan(f) === "free", f);
  });

  it("advanced stats and goals are Pro", () => {
    assert.equal(planAllows("free", "stats.advanced"), false);
    assert.equal(planAllows("free", "goals.advanced"), false);
  });

  it("the full calendar history is Pro", () => {
    assert.equal(requiredPlan("calendar.history"), "pro");
    assert.equal(planAllows("free", "calendar.history"), false);
    assert.equal(planAllows("pro", "calendar.history"), true);
    assert.equal(FEATURES["calendar.history"].title, "Calendario completo");
  });
});

describe("dev override", () => {
  it("is disabled outside development builds", () => {
    assert.equal(devToolsEnabled(), false);
    assert.equal(getDevPlanOverride(), null);
  });
});
