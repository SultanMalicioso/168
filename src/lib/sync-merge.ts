/* ------------------------------------------------------------------ *
 * Three-way merge of synced JSON documents.
 * `base` is the last version both sides agreed on (the last cloud value
 * this device saw); `local` and `remote` are the two edited copies.
 * - Objects merge key by key.
 * - Arrays of objects with an `id` merge item by item (add, edit, delete).
 * - Arrays of primitives merge as sets (additions and removals of both).
 * - Anything else: the side that changed wins; if both did, local wins.
 * ------------------------------------------------------------------ */

type Json = unknown;

const isObj = (v: Json): v is Record<string, Json> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const same = (a: Json, b: Json) => JSON.stringify(a) === JSON.stringify(b);

const isIdArray = (v: Json): v is { id: string }[] =>
  Array.isArray(v) && v.every((x) => isObj(x) && typeof (x as { id?: unknown }).id === "string");

const isPrimitiveArray = (v: Json): v is (string | number | boolean | null)[] =>
  Array.isArray(v) && v.every((x) => x === null || typeof x !== "object");

export function merge3(base: Json, local: Json, remote: Json): Json {
  if (same(local, remote)) return local;
  if (same(base, local)) return remote;
  if (same(base, remote)) return local;

  if (isObj(local) && isObj(remote)) {
    const b = isObj(base) ? base : {};
    const out: Record<string, Json> = {};
    for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
      const inL = key in local;
      const inR = key in remote;
      const inB = key in b;
      if (inL && inR) out[key] = merge3(b[key], local[key], remote[key]);
      else if (inL) {
        // Removed remotely: keep only if local changed it (or it is new).
        if (!inB || !same(b[key], local[key])) out[key] = local[key];
      } else if (inR) {
        if (!inB || !same(b[key], remote[key])) out[key] = remote[key];
      }
    }
    return out;
  }

  if (isIdArray(local) && isIdArray(remote)) {
    const b = isIdArray(base) ? base : [];
    const byId = (arr: { id: string }[]) => new Map(arr.map((x) => [x.id, x]));
    const B = byId(b);
    const L = byId(local);
    const R = byId(remote);
    const out: Json[] = [];
    const resolve = (id: string) => {
      const inL = L.has(id);
      const inR = R.has(id);
      if (inL && inR) return merge3(B.get(id), L.get(id), R.get(id));
      if (inL) return !B.has(id) || !same(B.get(id), L.get(id)) ? L.get(id) : undefined;
      return !B.has(id) || !same(B.get(id), R.get(id)) ? R.get(id) : undefined;
    };
    for (const x of local) {
      const v = resolve(x.id);
      if (v !== undefined) out.push(v);
    }
    for (const x of remote) {
      if (L.has(x.id)) continue;
      const v = resolve(x.id);
      if (v !== undefined) out.push(v);
    }
    return out;
  }

  if (isPrimitiveArray(local) && isPrimitiveArray(remote)) {
    const b = new Set(isPrimitiveArray(base) ? base : []);
    const l = new Set(local);
    const r = new Set(remote);
    const removed = new Set([...b].filter((x) => !l.has(x) || !r.has(x)));
    const out = [...local, ...remote.filter((x) => !l.has(x))];
    return Array.from(new Set(out)).filter((x) => !removed.has(x));
  }

  return local;
}
