import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isMissingTable,
  joinWaitlist,
  leaveWaitlist,
  parseWaitlistInput,
  waitlistStatus,
  type WaitlistDb,
} from "./pro-waitlist";
import { resolvePlan } from "./plan";

type Err = { code?: string; message?: string } | null;

/** Fake Supabase client: records every table and call, answers with `reply`. */
function fakeDb(reply: { error?: Err; data?: unknown } = {}) {
  const tables: string[] = [];
  const calls: { op: string; args: unknown[] }[] = [];
  const result = { data: reply.data ?? null, error: reply.error ?? null };
  const db = {
    from(table: string) {
      tables.push(table);
      return {
        insert(row: unknown) {
          calls.push({ op: "insert", args: [row] });
          return Promise.resolve(result);
        },
        delete() {
          return {
            eq(col: string, val: string) {
              calls.push({ op: "delete", args: [col, val] });
              return Promise.resolve(result);
            },
          };
        },
        select(cols: string) {
          return {
            eq(col: string, val: string) {
              return {
                maybeSingle() {
                  calls.push({ op: "select", args: [cols, col, val] });
                  return Promise.resolve(result);
                },
              };
            },
          };
        },
      };
    },
  };
  return { db: db as unknown as WaitlistDb, tables, calls };
}

const session = { userId: "u-1", email: "persona@ejemplo.com" };
const missing = { code: "PGRST205", message: "Could not find the table 'public.pro_waitlist'" };

describe("joinWaitlist", () => {
  it("only touches pro_waitlist and takes id and email from the session", async () => {
    const f = fakeDb();
    assert.equal(await joinWaitlist(f.db, session, "calendar.history"), "joined");
    assert.deepEqual(f.tables, ["pro_waitlist"]);
    assert.deepEqual(f.calls, [
      {
        op: "insert",
        args: [{ user_id: "u-1", email: "persona@ejemplo.com", source: "calendar.history" }],
      },
    ]);
  });

  it("treats an existing row as success", async () => {
    const f = fakeDb({ error: { code: "23505", message: "duplicate key" } });
    assert.equal(await joinWaitlist(f.db, session, null), "joined");
  });

  it("answers 'unavailable' while the table doesn't exist", async () => {
    assert.equal(await joinWaitlist(fakeDb({ error: missing }).db, session, null), "unavailable");
    const old = { code: "42P01", message: 'relation "public.pro_waitlist" does not exist' };
    assert.equal(await joinWaitlist(fakeDb({ error: old }).db, session, null), "unavailable");
  });

  it("fails with a Spanish message and no internal details", async () => {
    const f = fakeDb({ error: { code: "XX000", message: "internal: secret detail" } });
    await assert.rejects(joinWaitlist(f.db, session, null), (e: Error) => {
      assert.match(e.message, /^No pudimos/);
      assert.doesNotMatch(e.message, /secret|internal/);
      return true;
    });
  });

  it("requires an email in the session", async () => {
    await assert.rejects(joinWaitlist(fakeDb().db, { userId: "u-1", email: null }, null));
    await assert.rejects(
      joinWaitlist(fakeDb().db, { userId: "u-1", email: `${"a".repeat(320)}@x.com` }, null),
    );
  });

  it("never changes the plan: the user stays Free", async () => {
    const f = fakeDb();
    await joinWaitlist(f.db, session, null);
    assert.ok(!f.tables.includes("user_entitlements"));
    assert.equal(resolvePlan(null), "free");
  });
});

describe("leaveWaitlist", () => {
  it("deletes only the user's own row", async () => {
    const f = fakeDb();
    assert.equal(await leaveWaitlist(f.db, "u-1"), "not_joined");
    assert.deepEqual(f.tables, ["pro_waitlist"]);
    assert.deepEqual(f.calls, [{ op: "delete", args: ["user_id", "u-1"] }]);
  });

  it("answers 'unavailable' while the table doesn't exist", async () => {
    assert.equal(await leaveWaitlist(fakeDb({ error: missing }).db, "u-1"), "unavailable");
  });
});

describe("waitlistStatus", () => {
  it("reports whether the user is on the list", async () => {
    assert.equal(await waitlistStatus(fakeDb({ data: { user_id: "u-1" } }).db, "u-1"), "joined");
    assert.equal(await waitlistStatus(fakeDb({ data: null }).db, "u-1"), "not_joined");
    assert.equal(await waitlistStatus(fakeDb({ error: missing }).db, "u-1"), "unavailable");
  });
});

describe("parseWaitlistInput", () => {
  it("accepts no source or a known feature key, nothing else", () => {
    assert.deepEqual(parseWaitlistInput(undefined), { source: null });
    assert.deepEqual(parseWaitlistInput({}), { source: null });
    assert.deepEqual(parseWaitlistInput({ source: "stats.advanced" }), {
      source: "stats.advanced",
    });
    assert.throws(() => parseWaitlistInput({ source: "admin" }));
    assert.throws(() => parseWaitlistInput({ source: 3 }));
    assert.throws(() => parseWaitlistInput("calendar.history"));
  });

  it("ignores any user id or email sent by the client", () => {
    const parsed = parseWaitlistInput({ user_id: "otro", email: "x@y.z", source: null });
    assert.deepEqual(parsed, { source: null });
  });
});

describe("isMissingTable", () => {
  it("recognizes PostgREST and Postgres 'no such table' errors only", () => {
    assert.equal(isMissingTable(missing), true);
    assert.equal(isMissingTable({ code: "42P01" }), true);
    assert.equal(isMissingTable({ code: "23505" }), false);
    assert.equal(isMissingTable(null), false);
  });
});
