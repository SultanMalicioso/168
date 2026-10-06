import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  compactHistoryDays,
  computeDay,
  computeStats,
  refreshFrozen,
  type DaySnapshot,
} from "./history-store";
import type { Activity, Goal } from "./time-store";
import type { TimerData } from "./timer-store";

const NOW = new Date("2026-10-04T12:00:00").getTime();
const goals: Goal[] = [
  { id: "g", name: "Salud", color: "green", targetHours: 5, active: true, createdAt: 0 },
];
const act = (id: string, hoursPerDay: number): Activity => ({
  id,
  name: id,
  hoursPerDay,
  daysPerWeek: 7,
  color: "oklch(0.7 0.18 50)",
  category: "otro",
  permanent: true,
  goalIds: id === "gym" ? ["g"] : [],
});
const activities = [act("gym", 1), act("read", 0.5), act("work", 8)];

const keys = [
  "2024-03-04",
  "2024-03-05",
  "2024-03-06",
  "2025-01-10",
  "2026-09-28",
  "2026-09-29",
  "2026-10-01",
];
const timers: TimerData = {
  active: null,
  sessions: [],
  completions: {
    "2024-03-04": ["gym", "read", "work"],
    "2024-03-05": ["gym"],
    "2024-03-06": ["gym", "read", "work"],
    "2025-01-10": ["work", "read"],
    "2026-09-28": ["gym", "read", "work"],
    "2026-09-29": ["read"],
    "2026-10-01": ["gym", "read", "work"],
  },
  settings: { sound: true, notifications: true, askTasks: true },
  progressMode: "planned",
};

const frozen: Record<string, DaySnapshot> = Object.fromEntries(
  keys.map((k) => [k, computeDay(k, activities, goals, [], timers, "ignore", NOW)]),
);
const read = (days: Record<string, DaySnapshot>) =>
  keys.map((k) => refreshFrozen(days[k], activities, goals, timers, "ignore"));

describe("compactHistoryDays", () => {
  const compacted = compactHistoryDays(frozen, NOW);

  it("slims only days older than a year", () => {
    assert.equal(compacted["2024-03-04"].compact, true);
    assert.equal(compacted["2025-01-10"].compact, true);
    assert.equal(compacted["2024-03-04"].activities[0].color, undefined);
    assert.deepEqual(compacted["2024-03-04"].goals, []);
    assert.equal(compacted["2026-09-28"], frozen["2026-09-28"]);
  });

  it("keeps the calendar and the statistics identical", () => {
    const before = read(frozen);
    const after = read(compacted);
    assert.deepEqual(computeStats(after, NOW), computeStats(before, NOW));
    assert.deepEqual(
      after.map((d) => [d.dateKey, d.status, d.pct, d.total, d.done, d.realHours]),
      before.map((d) => [d.dateKey, d.status, d.pct, d.total, d.done, d.realHours]),
    );
    assert.deepEqual(
      after.map((d) => d.goals),
      before.map((d) => d.goals),
    );
  });

  it("returns the same object when there is nothing to compact", () => {
    assert.equal(compactHistoryDays(compacted, NOW), compacted);
  });
});
