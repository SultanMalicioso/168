import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDuration, goalProgress, type Activity, type Goal } from "./time-store";

const goal = (targetHours: number): Goal => ({
  id: "g",
  name: "Gimnasio",
  color: "red",
  targetHours,
  active: true,
  createdAt: 0,
});
const act = (id: string, hoursPerDay: number, daysPerWeek: number, goalIds = ["g"]): Activity => ({
  id,
  name: id,
  hoursPerDay,
  daysPerWeek,
  color: "red",
  category: "otro",
  goalIds,
});

describe("goalProgress", () => {
  it("separates planned from actually done hours", () => {
    const acts = [act("a", 2, 1), act("b", 1, 3), act("other", 5, 5, [])];
    const done: Record<string, number> = { a: 4 / 3, b: 2 };
    const r = goalProgress(goal(5), acts, (a) => done[a.id] ?? 0);
    assert.equal(r.planned, 5);
    assert.equal(formatDuration(r.done), "3 h 20 min");
    assert.equal(r.linked.length, 2);
    assert.equal(Math.round(r.pct), 67);
    assert.equal(formatDuration(r.remaining), "1 h 40 min");
    assert.equal(formatDuration(Math.abs(r.diff)), "1 h 40 min");
    assert.ok(r.diff < 0);
  });

  it("keeps the real percentage above 100 and never goes negative on remaining", () => {
    const r = goalProgress(goal(5), [act("a", 6, 1)], () => 6);
    assert.equal(r.pct, 120);
    assert.equal(r.remaining, 0);
  });

  it("80 % example: 4 h done of 5 h", () => {
    assert.equal(goalProgress(goal(5), [act("a", 4, 1)], () => 4).pct, 80);
  });

  it("a goal without target or linked activities is safe", () => {
    const r = goalProgress(goal(0), [], () => 0);
    assert.deepEqual([r.planned, r.done, r.pct, r.remaining, r.diff], [0, 0, 0, 0, 0]);
  });
});

describe("formatDuration", () => {
  it("is friendly", () => {
    assert.equal(formatDuration(5), "5 h");
    assert.equal(formatDuration(4.5), "4 h 30 min");
    assert.equal(formatDuration(0.75), "45 min");
    assert.equal(formatDuration(4.237481), "4 h 14 min");
  });
});
