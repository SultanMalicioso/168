import { FEATURES, type Feature } from "@/lib/plan";

/* ------------------------------------------------------------------ *
 * Pro waitlist: signed-in users can ask to be told when Pro launches.
 * Joining never unlocks anything: this module only touches the
 * `pro_waitlist` table, never `user_entitlements`, so the plan stays as
 * it is. The server functions in pro-waitlist.functions.ts call these
 * with the user's own Supabase client (RLS applies) and the verified
 * session, never with ids or emails sent by the browser.
 * ------------------------------------------------------------------ */

/** unavailable: the table doesn't exist yet (its SQL hasn't been run). */
export type WaitlistStatus = "joined" | "not_joined" | "unavailable";

export interface WaitlistSession {
  userId: string;
  email: string | null;
}

interface DbError {
  code?: string;
  message?: string;
}

interface WaitlistRow {
  user_id: string;
  email: string;
  source: Feature | null;
}

/**
 * The few calls this module makes. `pro_waitlist` isn't in the generated
 * Supabase types until its SQL runs, so callers cast their client to this.
 */
export interface WaitlistDb {
  from(table: "pro_waitlist"): {
    insert(row: WaitlistRow): PromiseLike<{ error: DbError | null }>;
    delete(): {
      eq(column: "user_id", value: string): PromiseLike<{ error: DbError | null }>;
    };
    select(columns: "user_id"): {
      eq(
        column: "user_id",
        value: string,
      ): {
        maybeSingle(): PromiseLike<{ data: unknown; error: DbError | null }>;
      };
    };
  };
}

const MAX_EMAIL = 320;

/** "No such table" from PostgREST (schema cache) or Postgres itself. */
export function isMissingTable(error: DbError | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    /could not find the table|relation .* does not exist/i.test(error.message ?? "")
  );
}

const isFeature = (v: unknown): v is Feature =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(FEATURES, v);

/** The only input accepted from the browser: which Pro feature led here. */
export function parseWaitlistInput(input: unknown): { source: Feature | null } {
  if (input === undefined || input === null) return { source: null };
  if (typeof input !== "object" || Array.isArray(input)) throw new Error("Datos inválidos");
  const source = (input as { source?: unknown }).source;
  if (source === undefined || source === null) return { source: null };
  if (!isFeature(source)) throw new Error("Datos inválidos");
  return { source };
}

function fail(what: string, error: DbError): never {
  console.error(`pro waitlist [${what}]: ${error.code ?? ""} ${error.message ?? ""}`);
  throw new Error(
    what === "join"
      ? "No pudimos anotarte. Probá de nuevo."
      : what === "leave"
        ? "No pudimos sacarte de la lista. Probá de nuevo."
        : "No pudimos ver si estás anotado. Probá de nuevo.",
  );
}

export async function joinWaitlist(
  db: WaitlistDb,
  session: WaitlistSession,
  source: Feature | null,
): Promise<WaitlistStatus> {
  const email = session.email?.trim();
  if (!email || email.length > MAX_EMAIL) {
    throw new Error("Tu cuenta no tiene un email válido para avisarte.");
  }
  const { error } = await db
    .from("pro_waitlist")
    .insert({ user_id: session.userId, email, source });
  if (!error || error.code === "23505") return "joined";
  if (isMissingTable(error)) return "unavailable";
  return fail("join", error);
}

export async function leaveWaitlist(db: WaitlistDb, userId: string): Promise<WaitlistStatus> {
  const { error } = await db.from("pro_waitlist").delete().eq("user_id", userId);
  if (!error) return "not_joined";
  if (isMissingTable(error)) return "unavailable";
  return fail("leave", error);
}

export async function waitlistStatus(db: WaitlistDb, userId: string): Promise<WaitlistStatus> {
  const { data, error } = await db
    .from("pro_waitlist")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return "unavailable";
    return fail("status", error);
  }
  return data ? "joined" : "not_joined";
}
