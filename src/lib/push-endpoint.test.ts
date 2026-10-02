import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAllowedPushEndpoint } from "./push-endpoint";

describe("isAllowedPushEndpoint", () => {
  it("accepts the real browser push services", () => {
    for (const url of [
      "https://fcm.googleapis.com/fcm/send/abc:def",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QK2abc",
      "https://api.push.apple.com/3/device/abc",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ]) {
      assert.equal(isAllowedPushEndpoint(url), true, url);
    }
  });

  it("rejects anything else, including look-alikes", () => {
    for (const url of [
      "https://evil.example.com/x",
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com.evil.com/x",
      "https://evilfcm.googleapis.com/x",
      "https://user:pass@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
      "https://a.b.push.apple.com/x",
      "https://push.apple.com.evil.com/x",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/x",
      "not a url",
      "https://fcm.googleapis.com/" + "a".repeat(1000),
    ]) {
      assert.equal(isAllowedPushEndpoint(url), false, url);
    }
  });
});
