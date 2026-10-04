/**
 * Keys (from `keys`) whose cloud timestamp differs from the one this device
 * last stored (`known`, epoch ms per key): only those need downloading.
 */
export function changedSince(
  stamps: { key: string; updated_at: string }[],
  known: Record<string, number>,
  keys: readonly string[],
): string[] {
  return stamps
    .filter((r) => keys.includes(r.key) && Date.parse(r.updated_at) !== known[r.key])
    .map((r) => r.key);
}
