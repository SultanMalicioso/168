import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeDay, refreshFrozen } from "./history-store";
import type { Activity } from "./time-store";
import type { TimerData } from "./timer-store";

// 2026-09-28 is a Monday (dayIndex 0).
const DAY = "2026-09-28";
const NOW = new Date("2026-10-04T12:00:00").getTime();

const act = (id: string, dayIndices: number[]): Activity => ({
  id,
  name: id,
  hoursPerDay: 1,
  daysPerWeek: dayIndices.length,
  dayIndices,
  color: "red",
  category: "otro",
  permanent: true,
});

const timers = (done: string[]): TimerData => ({
  active: null,
  sessions: [],
  completions: { [DAY]: done },
  settings: { sound: true, notifications: true, askTasks: true },
  progressMode: "planned",
});

describe("refreshFrozen", () => {
  it("keeps a past day's records when the activity's days change", () => {
    const gym = act("gym", [0, 2]);
    const read = act("read", [0]);
    const t = timers(["gym"]);
    const frozen = computeDay(DAY, [gym, read], [], [], t, "ignore", NOW);
    assert.equal(frozen.total, 2);
    assert.equal(frozen.pct, 50);

    // Monday is no longer a gym or reading day.
    const edited = [act("gym", [2, 4]), act("read", [3])];
    const after = refreshFrozen(frozen, edited, [], t, "ignore");
    assert.deepEqual(
      after.activities.map((a) => [a.id, a.done]),
      [
        ["gym", true],
        ["read", false],
      ],
    );
    assert.equal(after.total, 2);
    assert.equal(after.done, 1);
    assert.equal(after.pct, 50);
    assert.equal(after.status, "incomplete");
  });

  it("drops orphan demo records and deleted activities that were never done", () => {
    const frozen = computeDay(
      DAY,
      [act("seed-1", [0]), act("gone", [0]), act("gone-done", [0]), act("kept", [0])],
      [],
      [],
      timers(["seed-1", "gone-done"]),
      "ignore",
      NOW,
    );
    const after = refreshFrozen(
      frozen,
      [act("kept", [3])],
      [],
      timers(["seed-1", "gone-done"]),
      "ignore",
    );
    assert.deepEqual(
      after.activities.map((a) => a.id),
      ["gone-done", "kept"],
    );
    assert.equal(after.pct, 50);
  });
});
