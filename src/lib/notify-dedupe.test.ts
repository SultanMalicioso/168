import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withoutFinishedTimerDuplicate, type PlannedEvent } from "./notify-plan";

const event = (key: string): PlannedEvent => ({
  key,
  at: 0,
  graceMs: 0,
  input: { kind: "activity", title: key, body: "" },
});

describe("withoutFinishedTimerDuplicate", () => {
  it("drops only the completion of the finished activity on that day", () => {
    const events = [
      event("done:gym:2026-10-04"),
      event("done:gym:2026-10-03"),
      event("done:read:2026-10-04"),
      event("act:gym:2026-10-04"),
    ];
    assert.deepEqual(
      withoutFinishedTimerDuplicate(events, { activityId: "gym", dateKey: "2026-10-04" }).map(
        (e) => e.key,
      ),
      ["done:gym:2026-10-03", "done:read:2026-10-04", "act:gym:2026-10-04"],
    );
  });
});
