import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { changedSince } from "./sync-poll";

describe("changedSince", () => {
  const keys = ["a", "b", "c"];
  const at = "2026-10-04T12:00:00.123456+00:00";

  it("returns only synced keys whose timestamp changed or is unknown", () => {
    const stamps = [
      { key: "a", updated_at: at },
      { key: "b", updated_at: "2026-10-04T12:05:00+00:00" },
      { key: "c", updated_at: at },
      { key: "other", updated_at: at },
    ];
    const known = { a: Date.parse(at), b: Date.parse(at) };
    assert.deepEqual(changedSince(stamps, known, keys), ["b", "c"]);
  });

  it("is empty when nothing changed", () => {
    assert.deepEqual(changedSince([{ key: "a", updated_at: at }], { a: Date.parse(at) }, keys), []);
  });
});
