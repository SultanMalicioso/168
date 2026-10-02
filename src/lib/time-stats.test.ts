import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { weeklyHours, type Activity } from "./time-store";
import type { TimerData } from "./timer-store";
import { activitiesInWeek, averageOfWeeks, computeWeekStats, weekKeysEndingAt } from "./time-stats";

// Friday 2 Oct 2026; current week starts Monday 28 Sep.
const NOW = new Date("2026-10-02T12:00:00").getTime();
const THIS = "2026-09-28";
const PREV = "2026-09-21";
const H = 3_600_000;

const act = (id: string, extra: Partial<Activity> = {}): Activity => ({
  id,
  name: id,
  hoursPerDay: 2,
  daysPerWeek: 5,
  color: "red",
  category: "estudio",
  permanent: true,
  ...extra,
});

const session = (activityId: string, date: string, hours: number) => ({
  id: `${activityId}-${date}-${hours}`,
  activityId,
  dateKey: date,
  startedAt: new Date(`${date}T10:00:00`).getTime(),
  endedAt: new Date(`${date}T10:00:00`).getTime() + hours * H,
  durationMs: hours * H,
  plannedMs: 2 * H,
  completed: false,
});

const timers = (sessions: ReturnType<typeof session>[], completions = {}): TimerData =>
  ({ active: null, sessions, completions, settings: {} }) as unknown as TimerData;

describe("activitiesInWeek", () => {
  it("permanent everywhere, temporary only in its week, legacy in the current week", () => {
    const list = [
      act("perm"),
      act("tmp", { permanent: false, weekStart: PREV }),
      act("legacy", { permanent: false, weekStart: undefined }),
    ];
    assert.deepEqual(
      activitiesInWeek(list, PREV, THIS).map((a) => a.id),
      ["perm", "tmp"],
    );
    assert.deepEqual(
      activitiesInWeek(list, THIS, THIS).map((a) => a.id),
      ["perm", "legacy"],
    );
  });
});

describe("computeWeekStats", () => {
  const study = act("study", { name: "Estudio", hoursPerDay: 3, daysPerWeek: 5 });
  const gym = act("gym", { name: "Gimnasio", category: "deporte", hoursPerDay: 1, daysPerWeek: 5 });
  const data = timers([
    session("study", "2026-09-29", 2.5), // this week
    session("study", "2026-09-30", 1),
    session("study", "2026-09-22", 4), // previous week
    session("gym", "2026-09-22", 1),
  ]);

  it("planned uses weeklyHours and real comes from this week's sessions only", () => {
    const w = computeWeekStats([study, gym], data, THIS, NOW);
    assert.equal(w.planned, weeklyHours(study) + weeklyHours(gym));
    assert.equal(w.planned, 20);
    assert.equal(w.real, 3.5);
    assert.deepEqual(
      w.categories.map((c) => [c.label, c.planned, c.real]),
      [
        ["Estudio", 15, 3.5],
        ["Deporte", 5, 0],
      ],
    );
  });

  it("switching week shows that week's data without mixing", () => {
    const w = computeWeekStats([study, gym], data, PREV, NOW);
    assert.equal(w.real, 5);
    assert.equal(w.activities.find((a) => a.id === "gym")!.real, 1);
  });

  it("a week without tracked time has zero real hours", () => {
    const w = computeWeekStats([study, gym], data, "2026-09-14", NOW);
    assert.equal(w.real, 0);
    assert.equal(w.planned, 20);
  });

  it("manual activities count planned hours only on completed days", () => {
    const read = act("read", { completion: "manual", hoursPerDay: 1, daysPerWeek: 7 });
    const t = timers([], {
      "2026-09-29": ["read"],
      "2026-09-30": ["read"],
      "2026-09-22": ["read"],
    });
    assert.equal(computeWeekStats([read], t, THIS, NOW).real, 2);
    assert.equal(computeWeekStats([read], t, PREV, NOW).real, 1);
  });

  it("filters by category and by activity", () => {
    assert.equal(computeWeekStats([study, gym], data, PREV, NOW, { category: "deporte" }).real, 1);
    assert.equal(computeWeekStats([study, gym], data, PREV, NOW, { activityId: "study" }).real, 4);
  });

  it("each session is counted once, in a single activity and category", () => {
    const w = computeWeekStats([study, gym], data, PREV, NOW);
    const byActivity = w.activities.reduce((s, a) => s + a.real, 0);
    const byCategory = w.categories.reduce((s, c) => s + c.real, 0);
    assert.equal(byActivity, w.real);
    assert.equal(byCategory, w.real);
  });
});

describe("history helpers", () => {
  it("weekKeysEndingAt lists consecutive Mondays oldest first", () => {
    assert.deepEqual(weekKeysEndingAt(THIS, 3), ["2026-09-14", PREV, THIS]);
  });

  it("the average skips weeks without tracked time and is null with none", () => {
    const s = act("s");
    const data = timers([session("s", "2026-09-22", 4), session("s", "2026-09-08", 2)]);
    const weeks = ["2026-09-07", "2026-09-14", PREV].map((k) =>
      computeWeekStats([s], data, k, NOW),
    );
    const avg = averageOfWeeks(weeks)!;
    assert.equal(avg.weeks, 2);
    assert.equal(avg.real, 3);
    assert.equal(avg.byCategory.get("estudio"), 3);
    assert.equal(averageOfWeeks([computeWeekStats([s], timers([]), PREV, NOW)]), null);
  });
});

describe("compactSessions", () => {
  it("merges sessions older than a year per activity and day, keeping totals", async () => {
    const { compactSessions, doneHoursForDay } = await import("./timer-store");
    const now = new Date("2026-10-02T12:00:00").getTime();
    const old = [
      session("s", "2025-01-10", 1),
      { ...session("s", "2025-01-10", 2), id: "x2" },
      session("s", "2025-01-11", 1),
      session("s", "2026-09-29", 3),
    ];
    const out = compactSessions(old, now);
    assert.equal(out.length, 3);
    assert.equal(out[0].id, "agg:s:2025-01-10");
    const t = timers(out);
    assert.equal(doneHoursForDay(t, "s", "2025-01-10", now), 3);
    assert.equal(doneHoursForDay(t, "s", "2026-09-29", now), 3);
    assert.equal(compactSessions(out, now), out);
  });
});
