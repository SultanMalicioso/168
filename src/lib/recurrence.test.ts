import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nextOccurrence, rollRecurring } from "./recurrence";
import type { Store, Task } from "./time-store";

const at = (d: string) => new Date(`${d}T10:00:00`);

describe("nextOccurrence", () => {
  it("never brings an overdue daily task back for the day it was completed", () => {
    assert.equal(nextOccurrence("2026-10-01", "daily", "2026-10-04", "2026-10-04"), "2026-10-05");
  });

  it("goes to the next day for a task due and completed today", () => {
    assert.equal(nextOccurrence("2026-10-04", "daily", "2026-10-04", "2026-10-04"), "2026-10-05");
  });

  it("keeps the rhythm when completed ahead of time", () => {
    assert.equal(nextOccurrence("2026-10-06", "daily", "2026-10-04", "2026-10-04"), "2026-10-07");
    assert.equal(nextOccurrence("2026-10-10", "weekly", "2026-10-04", "2026-10-04"), "2026-10-17");
  });

  it("keeps the weekday of weekly tasks and skips the completion day", () => {
    // Due Sunday 27/09, completed Sunday 04/10: the next Sunday is 11/10.
    assert.equal(nextOccurrence("2026-09-27", "weekly", "2026-10-04", "2026-10-04"), "2026-10-11");
  });

  it("never lands before today when processed late", () => {
    assert.equal(nextOccurrence("2026-09-28", "daily", "2026-09-28", "2026-10-04"), "2026-10-04");
  });

  it("skips weekends for weekday tasks", () => {
    // Completed Friday 02/10 → Monday 05/10.
    assert.equal(
      nextOccurrence("2026-10-02", "weekdays", "2026-10-02", "2026-10-02"),
      "2026-10-05",
    );
  });
});

describe("rollRecurring", () => {
  it("creates tomorrow's copy of an overdue daily task completed today", () => {
    const task = {
      id: "t",
      name: "Leer",
      status: "completed",
      dueDate: "2026-10-01",
      repeat: "daily",
      completedAt: at("2026-10-04").getTime(),
      createdAt: 0,
    } as unknown as Task;
    const store = { activities: [], tasks: [task] } as unknown as Store;
    const next = rollRecurring(store, at("2026-10-04")).tasks.find((x) => x.status === "pending");
    assert.equal(next?.dueDate, "2026-10-05");
    assert.equal(next?.id, "t~2026-10-05");
  });
});
