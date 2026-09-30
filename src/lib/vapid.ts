/* ------------------------------------------------------------------ *
 * VAPID key helpers shared by the browser and the server.
 * Keys are handled as Base64URL (RFC 4648 §5, no padding). The public
 * key must be an uncompressed P-256 point: 0x04 || X (32) || Y (32).
 * ------------------------------------------------------------------ */

export type Bytes = Uint8Array<ArrayBuffer>;

/**
 * Cleans a key copied into an env var or a dashboard: surrounding
 * quotes, a pasted `NAME=` prefix, whitespace/new lines, standard
 * Base64 characters and padding.
 */
export function normalizeBase64Url(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/\s+/g, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^VAPID_[A-Z_]*=/, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64UrlToBytes(value: string): Bytes {
  const clean = normalizeBase64Url(value);
  if (!/^[A-Za-z0-9_-]*$/.test(clean)) {
    throw new Error("La clave contiene caracteres que no son Base64URL");
  }
  const base64 = clean.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/* ---------------- P-256 (secp256r1) ---------------- */

const P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const A = P - 3n;
const B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
const GX = 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n;
const GY = 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n;

type Point = { x: bigint; y: bigint } | null;

const mod = (a: bigint, m = P) => {
  const r = a % m;
  return r >= 0n ? r : r + m;
};

function inv(a: bigint): bigint {
  let [oldR, r] = [mod(a), P];
  let [oldS, s] = [1n, 0n];
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  return mod(oldS);
}

function add(p: Point, q: Point): Point {
  if (!p) return q;
  if (!q) return p;
  if (p.x === q.x && mod(p.y + q.y) === 0n) return null;
  const l =
    p.x === q.x && p.y === q.y
      ? mod((3n * p.x * p.x + A) * inv(2n * p.y))
      : mod((q.y - p.y) * inv(q.x - p.x));
  const x = mod(l * l - p.x - q.x);
  return { x, y: mod(l * (p.x - x) - p.y) };
}

const toBig = (bytes: Uint8Array) => {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n;
};

const to32 = (n: bigint) => {
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
};

/** true when `bytes` is an uncompressed point that lies on P-256. */
export function isValidP256PublicKey(bytes: Uint8Array): boolean {
  if (bytes.length !== 65 || bytes[0] !== 0x04) return false;
  const x = toBig(bytes.subarray(1, 33));
  const y = toBig(bytes.subarray(33, 65));
  if (x >= P || y >= P) return false;
  return mod(y * y) === mod(x * x * x + A * x + B);
}

/**
 * Derives the uncompressed public key (Base64URL) from a Base64URL
 * VAPID private key, so the public key can never drift from the
 * private one that signs every push.
 */
export function publicKeyFromPrivate(privateKey: string): string {
  const d = toBig(base64UrlToBytes(privateKey));
  if (d <= 0n || d >= N) throw new Error("VAPID_PRIVATE_KEY no es una clave P-256 válida");

  let result: Point = null;
  let addend: Point = { x: GX, y: GY };
  for (let k = d; k > 0n; k >>= 1n) {
    if (k & 1n) result = add(result, addend);
    addend = add(addend, addend);
  }
  if (!result) throw new Error("VAPID_PRIVATE_KEY no es una clave P-256 válida");

  const out = new Uint8Array(65);
  out[0] = 0x04;
  out.set(to32(result.x), 1);
  out.set(to32(result.y), 33);
  return bytesToBase64Url(out);
}
