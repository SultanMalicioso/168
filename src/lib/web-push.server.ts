/* ------------------------------------------------------------------ *
 * Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) on Web Crypto only,
 * so it runs inside the edge runtime that serves this app.
 * ------------------------------------------------------------------ */

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

const encoder = new TextEncoder();
const enc = (v: string): Bytes => encoder.encode(v) as Bytes;

type Bytes = Uint8Array<ArrayBuffer>;

function b64urlToBytes(value: string): Bytes {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: Bytes): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Bytes[]): Bytes {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function hmac(key: Bytes, data: Bytes): Promise<Bytes> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data)) as Bytes;
}

/** HKDF with a single output block (enough for every web push secret). */
async function hkdf(
  salt: Bytes,
  ikm: Bytes,
  info: Bytes,
  length: number,
): Promise<Bytes> {
  const prk = await hmac(salt, ikm);
  const okm = await hmac(prk, concat(info, new Uint8Array([1])));
  return okm.slice(0, length) as Bytes;
}

/* ---------------- VAPID ---------------- */

async function vapidToken(audience: string, vapid: VapidKeys): Promise<string> {
  const pub = b64urlToBytes(vapid.publicKey);
  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: bytesToB64url(pub.slice(1, 33)),
      y: bytesToB64url(pub.slice(33, 65)),
      d: vapid.privateKey,
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const header = bytesToB64url(enc(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64url(
    enc(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: vapid.subject,
      }),
    ),
  );

  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      enc(`${header}.${payload}`),
    ),
  ) as Bytes;

  return `${header}.${payload}.${bytesToB64url(signature)}`;
}

/* ---------------- payload encryption ---------------- */

async function encryptPayload(
  sub: PushSubscriptionRecord,
  plaintext: Bytes,
): Promise<Bytes> {
  const uaPublic = b64urlToBytes(sub.p256dh);
  const authSecret = b64urlToBytes(sub.auth);

  const localKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const localPublic = new Uint8Array(
    await crypto.subtle.exportKey("raw", localKeys.publicKey),
  ) as Bytes;

  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, localKeys.privateKey, 256),
  ) as Bytes;

  const ikm = await hkdf(
    authSecret,
    shared,
    concat(enc("WebPush: info\0"), uaPublic, localPublic),
    32,
  );

  const salt = crypto.getRandomValues(new Uint8Array(16)) as Bytes;
  const cek = await hkdf(salt, ikm, enc("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const record = concat(plaintext, new Uint8Array([2])); // 0x02 = last record delimiter
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, record),
  ) as Bytes;

  const header = new Uint8Array(21) as Bytes;
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096); // record size
  header[20] = localPublic.length;

  return concat(header, localPublic, ciphertext);
}

/* ---------------- send ---------------- */

export interface PushSendResult {
  ok: boolean;
  status: number;
  /** true when the endpoint is gone and the subscription should be dropped. */
  expired: boolean;
  body?: string;
}

export async function sendWebPush(
  sub: PushSubscriptionRecord,
  payload: unknown,
  vapid: VapidKeys,
  options: { ttl?: number; urgency?: "very-low" | "low" | "normal" | "high" } = {},
): Promise<PushSendResult> {
  const body = await encryptPayload(sub, enc(JSON.stringify(payload)));
  const audience = new URL(sub.endpoint).origin;
  const token = await vapidToken(audience, vapid);

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      TTL: String(options.ttl ?? 3600),
      Urgency: options.urgency ?? "normal",
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      Authorization: `vapid t=${token}, k=${vapid.publicKey}`,
    },
    body: body as unknown as BodyInit,
  });

  return {
    ok: res.ok,
    status: res.status,
    expired: res.status === 404 || res.status === 410,
    body: res.ok ? undefined : await res.text().catch(() => undefined),
  };
}

export function readVapid(): VapidKeys | null {
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  const subject = process.env["VAPID_SUBJECT"] ?? "mailto:notificaciones@lovable.app";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}
