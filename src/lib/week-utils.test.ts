import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addWeeks, getWeekDates, getWeekKey } from "./week-utils";

describe("week-utils", () => {
  it("keys every day of a week by its Monday", () => {
    assert.equal(getWeekKey(new Date("2026-10-04T23:59:00")), "2026-09-28");
    assert.equal(getWeekKey(new Date("2026-09-28T00:00:00")), "2026-09-28");
  });

  it("moves whole weeks, across months and years", () => {
    assert.equal(addWeeks("2026-09-28", 1), "2026-10-05");
    assert.equal(addWeeks("2026-12-28", 1), "2027-01-04");
    assert.equal(addWeeks("2026-10-05", -2), "2026-09-21");
  });

  it("lists the seven days from Monday", () => {
    assert.deepEqual(
      getWeekDates("2026-09-28").map((d) => d.getDate()),
      [28, 29, 30, 1, 2, 3, 4],
    );
  });
});
