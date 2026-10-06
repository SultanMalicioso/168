import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { retryDelay } from "./sync-retry";

describe("retryDelay", () => {
  it("backs off 2 s, 5 s, 15 s and then stays at 60 s", () => {
    assert.deepEqual(
      [0, 1, 2, 3, 4, 10].map(retryDelay),
      [2_000, 5_000, 15_000, 60_000, 60_000, 60_000],
    );
  });

  it("treats odd input as the first retry", () => {
    assert.equal(retryDelay(-1), 2_000);
    assert.equal(retryDelay(Number.NaN), 2_000);
  });
});
