import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  backControl,
  calendarAccess,
  canOpenDay,
  currentWeekKeys,
  forwardControl,
  normalizeCalendar,
  viewControl,
} from "./calendar-access";

const at = (iso: string) => new Date(`${iso}T12:00:00`);

describe("calendarAccess", () => {
  it("is pending while the plan is unknown, then limited or full", () => {
    assert.equal(calendarAccess({ loading: true, allowed: false }), "pending");
    assert.equal(calendarAccess({ loading: true, allowed: true }), "pending");
    assert.equal(calendarAccess({ loading: false, allowed: false }), "limited");
    assert.equal(calendarAccess({ loading: false, allowed: true }), "full");
  });
});

describe("Free (limited)", () => {
  it("only enables the week view; month and year are locked", () => {
    assert.equal(viewControl("week", "limited"), "enabled");
    assert.equal(viewControl("month", "limited"), "locked");
    assert.equal(viewControl("year", "limited"), "locked");
  });

  it("can't go back (it asks for Pro) nor forward", () => {
    assert.equal(backControl("limited"), "locked");
    assert.equal(forwardControl("limited"), "disabled");
  });

  it("only opens days of the current week", () => {
    const now = at("2026-10-07"); // Wednesday
    assert.equal(canOpenDay("2026-10-05", "limited", now), true);
    assert.equal(canOpenDay("2026-10-11", "limited", now), true);
    assert.equal(canOpenDay("2026-10-04", "limited", now), false);
    assert.equal(canOpenDay("2026-10-12", "limited", now), false);
  });
});

describe("Pro (full)", () => {
  it("enables every view and both arrows", () => {
    for (const v of ["week", "month", "year"] as const)
      assert.equal(viewControl(v, "full"), "enabled");
    assert.equal(backControl("full"), "enabled");
    assert.equal(forwardControl("full"), "enabled");
    assert.equal(canOpenDay("2020-01-01", "full", at("2026-10-07")), true);
  });

  it("keeps any view and cursor", () => {
    const state = { view: "year" as const, cursor: at("2024-03-10") };
    assert.equal(normalizeCalendar(state, "full", at("2026-10-07")), state);
  });
});

describe("while the plan loads (pending)", () => {
  it("disables month, year and navigation without showing locks", () => {
    assert.equal(viewControl("week", "pending"), "enabled");
    assert.equal(viewControl("month", "pending"), "disabled");
    assert.equal(viewControl("year", "pending"), "disabled");
    assert.equal(backControl("pending"), "disabled");
    assert.equal(forwardControl("pending"), "disabled");
  });
});

describe("normalizeCalendar", () => {
  const now = at("2026-10-07");

  it("sends a Free user back to this week's week view", () => {
    for (const state of [
      { view: "month" as const, cursor: now },
      { view: "year" as const, cursor: at("2025-01-01") },
      { view: "week" as const, cursor: at("2026-09-29") },
      { view: "week" as const, cursor: at("2026-10-14") },
    ]) {
      const next = normalizeCalendar(state, "limited", now);
      assert.equal(next.view, "week");
      assert.deepEqual(currentWeekKeys(next.cursor), currentWeekKeys(now));
    }
  });

  it("returns the same object when there is nothing to change", () => {
    const state = { view: "week" as const, cursor: at("2026-10-11") };
    assert.equal(normalizeCalendar(state, "limited", now), state);
  });
});

describe("currentWeekKeys", () => {
  it("runs Monday to Sunday", () => {
    assert.deepEqual(currentWeekKeys(at("2026-10-05")), { from: "2026-10-05", to: "2026-10-11" });
    assert.deepEqual(currentWeekKeys(at("2026-10-11")), { from: "2026-10-05", to: "2026-10-11" });
  });
});
