import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hourlyActivity } from "./time-stats";
import type { TimerSession } from "./timer-store";

const at = (s: string) => new Date(s).getTime();
const session = (
  id: string,
  activityId: string,
  start: string,
  end: string,
  durationMs = at(end) - at(start),
): TimerSession => ({
  id,
  activityId,
  dateKey: start.slice(0, 10),
  startedAt: at(start),
  endedAt: at(end),
  durationMs,
  plannedMs: 0,
  completed: false,
});

describe("hourlyActivity", () => {
  // 2026-09-28 is a Monday.
  const weeks = ["2026-09-28"];

  it("splits a session across the hours it covers", () => {
    const r = hourlyActivity(
      [session("a", "x", "2026-09-29T09:30:00", "2026-09-29T11:00:00")],
      weeks,
      null,
    );
    assert.equal(r.cells[1][9], 0.5);
    assert.equal(r.cells[1][10], 1);
    assert.equal(r.total, 1.5);
  });

  it("spreads paused time evenly and respects the activity filter", () => {
    const paused = session("a", "x", "2026-09-28T08:00:00", "2026-09-28T10:00:00", 3_600_000);
    const other = session("b", "y", "2026-09-28T08:00:00", "2026-09-28T09:00:00");
    const r = hourlyActivity([paused, other], weeks, new Set(["x"]));
    assert.equal(r.cells[0][8], 0.5);
    assert.equal(r.cells[0][9], 0.5);
    assert.equal(r.total, 1);
  });

  it("ignores sessions outside the weeks", () => {
    const r = hourlyActivity(
      [session("a", "x", "2026-09-21T09:00:00", "2026-09-21T10:00:00")],
      weeks,
      null,
    );
    assert.equal(r.total, 0);
  });
});
