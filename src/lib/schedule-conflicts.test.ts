import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  describeConflict,
  findScheduleConflicts,
  parseTime,
  type SchedulableActivity,
} from "./schedule-conflicts";

// Friday 2 Oct 2026; its week starts Monday 28 Sep.
const NOW = new Date("2026-10-02T12:00:00");
const THIS_WEEK = "2026-09-28";
const NEXT_WEEK = "2026-10-05";

let n = 0;
const act = (
  startTime: string | undefined,
  hours: number,
  days: number[],
  extra: Partial<SchedulableActivity> = {},
): SchedulableActivity => ({
  id: `a${++n}`,
  name: `A${n}`,
  startTime,
  hoursPerDay: hours,
  dayIndices: days,
  daysPerWeek: days.length,
  permanent: false,
  weekStart: THIS_WEEK,
  ...extra,
});

const MON = 0,
  WED = 2,
  SUN = 6;
const conflicts = (c: SchedulableActivity, others: SchedulableActivity[]) =>
  findScheduleConflicts(c, others, NOW);

describe("overlap rules", () => {
  it("partial overlap: 10:00–11:00 vs 10:30–11:30", () => {
    const r = conflicts(act("10:30", 1, [MON]), [act("10:00", 1, [MON], { name: "Clase" })]);
    assert.equal(r.length, 1);
    assert.equal(describeConflict(r[0]), "Clase, el lunes de 10:30 a 11:00");
  });

  it("back-to-back is not a conflict: 10:00–11:00 vs 09:00–10:00", () => {
    assert.deepEqual(conflicts(act("09:00", 1, [MON]), [act("10:00", 1, [MON])]), []);
    assert.deepEqual(conflicts(act("11:00", 1, [MON]), [act("10:00", 1, [MON])]), []);
  });

  it("contained interval: 10:00–12:00 vs 10:30–10:45", () => {
    const r = conflicts(act("10:30", 0.25, [MON]), [act("10:00", 2, [MON], { name: "Trabajo" })]);
    assert.equal(describeConflict(r[0]), "Trabajo, el lunes de 10:30 a 10:45");
  });

  it("recurring days: Mon+Wed 15–16 vs Wed 15:30–16:30 only conflicts on Wednesday", () => {
    const gym = act("15:00", 1, [MON, WED], { name: "Gimnasio" });
    const r = conflicts(act("15:30", 1, [WED]), [gym]);
    assert.equal(r.length, 1);
    assert.equal(describeConflict(r[0]), "Gimnasio, el miércoles de 15:30 a 16:00");
  });

  it("different days never conflict", () => {
    assert.deepEqual(conflicts(act("10:00", 1, [MON]), [act("10:00", 1, [WED])]), []);
  });

  it("lists every conflict, sorted by day and time", () => {
    const r = conflicts(act("10:00", 2, [MON, WED]), [
      act("11:00", 1, [WED], { name: "B" }),
      act("10:30", 1, [MON, WED], { name: "A" }),
    ]);
    assert.deepEqual(r.map(describeConflict), [
      "A, el lunes de 10:30 a 11:30",
      "A, el miércoles de 10:30 a 11:30",
      "B, el miércoles de 11:00 a 12:00",
    ]);
  });
});

describe("activities without a schedule", () => {
  it("no start time on either side means no conflict", () => {
    assert.deepEqual(conflicts(act(undefined, 8, [MON]), [act("10:00", 1, [MON])]), []);
    assert.deepEqual(conflicts(act("10:00", 1, [MON]), [act(undefined, 8, [MON])]), []);
  });

  it("zero duration or no days means no conflict", () => {
    assert.deepEqual(conflicts(act("10:00", 0, [MON]), [act("10:00", 1, [MON])]), []);
    assert.deepEqual(conflicts(act("10:00", 1, []), [act("10:00", 1, [MON])]), []);
  });

  it("parseTime rejects malformed values", () => {
    assert.equal(parseTime("24:00"), null);
    assert.equal(parseTime("10:60"), null);
    assert.equal(parseTime("abc"), null);
    assert.equal(parseTime("07:05"), 425);
  });
});

describe("editing", () => {
  it("an activity never conflicts with its own saved version", () => {
    const saved = act("10:00", 1, [MON]);
    assert.deepEqual(conflicts({ ...saved, startTime: "10:30" }, [saved]), []);
  });
});

describe("crossing midnight", () => {
  it("23:00 + 8h conflicts with next morning", () => {
    const r = conflicts(act("23:00", 8, [MON]), [act("06:00", 2, [1], { name: "Correr" })]);
    assert.equal(describeConflict(r[0]), "Correr, el martes de 06:00 a 07:00");
  });

  it("overlap that itself crosses midnight names both days", () => {
    const r = conflicts(act("22:00", 4, [MON]), [act("23:00", 2, [MON], { name: "Serie" })]);
    assert.equal(describeConflict(r[0]), "Serie, el lunes de 23:00 a 01:00 del martes");
  });

  it("ending exactly at midnight does not touch the next day", () => {
    assert.deepEqual(conflicts(act("22:00", 2, [MON]), [act("00:00", 1, [1])]), []);
  });

  it("permanent Sunday night spills into Monday of every week", () => {
    const sleep = act("23:00", 8, [SUN], { permanent: true, name: "Dormir" });
    const r = conflicts(act("06:00", 1, [MON], { permanent: true }), [sleep]);
    assert.equal(describeConflict(r[0]), "Dormir, el lunes de 06:00 a 07:00");
  });

  it("this week's Sunday night spills into next week's Monday", () => {
    const late = act("23:00", 3, [SUN], { name: "Viaje" });
    const r = conflicts(act("01:00", 1, [MON], { weekStart: NEXT_WEEK }), [late]);
    assert.equal(r.length, 1);
    assert.equal(r[0].weekKey, null);
    assert.equal(describeConflict(r[0]), "Viaje, el lunes de 01:00 a 02:00");
  });
});

describe("weeks", () => {
  it("activities of different weeks do not conflict", () => {
    const r = conflicts(act("10:00", 1, [MON], { weekStart: NEXT_WEEK }), [act("10:00", 1, [MON])]);
    assert.deepEqual(r, []);
  });

  it("same future week conflicts", () => {
    const r = conflicts(act("10:00", 1, [MON], { weekStart: NEXT_WEEK }), [
      act("10:30", 1, [MON], { weekStart: NEXT_WEEK }),
    ]);
    assert.equal(r.length, 1);
    assert.equal(r[0].weekKey, null);
  });

  it("weekStart on any day of the week is normalized to its Monday", () => {
    const r = conflicts(act("10:00", 1, [MON], { weekStart: "2026-10-07" }), [
      act("10:30", 1, [MON], { weekStart: NEXT_WEEK }),
    ]);
    assert.equal(r.length, 1);
  });

  it("a permanent activity conflicts with every week's schedule", () => {
    const perm = act("10:00", 1, [MON], { permanent: true, name: "Fijo" });
    assert.equal(conflicts(act("10:30", 1, [MON], { weekStart: NEXT_WEEK }), [perm]).length, 1);
    assert.equal(conflicts(act("10:30", 1, [MON]), [perm]).length, 1);
  });

  it("a new permanent activity names the week of a one-week conflict", () => {
    const once = act("10:00", 1, [MON], { weekStart: NEXT_WEEK, name: "Turno" });
    const r = conflicts(act("10:30", 1, [MON], { permanent: true }), [once]);
    assert.equal(r[0].weekKey, NEXT_WEEK);
    assert.equal(
      describeConflict(r[0]),
      "Turno, el lunes de 10:30 a 11:00 (semana del 5 de octubre)",
    );
  });

  it("a permanent activity ignores one-week activities from past weeks", () => {
    const old = act("10:00", 1, [MON], { weekStart: "2026-09-21" });
    assert.deepEqual(conflicts(act("10:00", 1, [MON], { permanent: true }), [old]), []);
  });

  it("legacy activities without weekStart belong to the current week", () => {
    const legacy = act("10:00", 1, [MON], { weekStart: undefined });
    assert.equal(conflicts(act("10:30", 1, [MON]), [legacy]).length, 1);
    assert.deepEqual(conflicts(act("10:30", 1, [MON], { weekStart: NEXT_WEEK }), [legacy]), []);
  });

  it("falls back to the first N days when dayIndices is missing", () => {
    const old = act("10:00", 1, [], { dayIndices: undefined, daysPerWeek: 3, name: "Viejo" });
    const r = conflicts(act("10:30", 1, [WED]), [old]);
    assert.equal(describeConflict(r[0]), "Viejo, el miércoles de 10:30 a 11:00");
  });
});
