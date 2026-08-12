/**
 * Minimal, dependency-free Web Push sender (RFC 8291 aes128gcm + RFC 8292 VAPID),
 * built on WebCrypto so it runs unmodified on Cloudflare Workers (workerd) and Node.
 * Deliberately avoids the `web-push` npm package, which relies on Node-only APIs.
 */

const subtle = globalThis.crypto.subtle;

function b64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

/** WebCrypto in this TS config wants a plain ArrayBuffer, so hand it a tight copy. */
function ab(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

/** Rebuild a P-256 private CryptoKey from a raw VAPID "d" (base64url scalar) + its public point. */
async function importVapidPrivateKey(privateKeyB64url: string, publicKeyB64url: string) {
  const pub = b64urlToBytes(publicKeyB64url); // 65 bytes uncompressed point: 0x04 | x(32) | y(32)
  const x = bytesToB64url(pub.subarray(1, 33));
  const y = bytesToB64url(pub.subarray(33, 65));
  const jwk: JsonWebKey = { kty: "EC", crv: "P-256", d: privateKeyB64url, x, y, ext: true };
  return subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

async function buildVapidJwt(endpoint: string, subject: string, publicKey: string, privateKey: string) {
  const url = new URL(endpoint);
  const aud = `${url.protocol}//${url.host}`;
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const claims = { aud, exp: now + 12 * 3600, sub: subject };
  const encPart = (o: unknown) => bytesToB64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${encPart(header)}.${encPart(claims)}`;
  const key = await importVapidPrivateKey(privateKey, publicKey);
  const sigDer = await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, ab(new TextEncoder().encode(unsigned)));
  // WebCrypto ECDSA signatures are raw (r||s), already JWS-compatible.
  return `${unsigned}.${bytesToB64url(new Uint8Array(sigDer))}`;
}

/** RFC 8291 aes128gcm payload encryption. */
async function encryptPayload(payload: Uint8Array, p256dhB64url: string, authB64url: string) {
  const clientPublicKeyBytes = b64urlToBytes(p256dhB64url);
  const authSecret = b64urlToBytes(authB64url);

  const clientPublicKey = await subtle.importKey(
    "raw", ab(clientPublicKeyBytes), { name: "ECDH", namedCurve: "P-256" }, false, [],
  );

  const serverKeyPair = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const serverPublicKeyRaw = new Uint8Array(await subtle.exportKey("raw", serverKeyPair.publicKey));

  const sharedSecretBits = await subtle.deriveBits(
    { name: "ECDH", public: clientPublicKey }, serverKeyPair.privateKey, 256,
  );
  const sharedSecret = new Uint8Array(sharedSecretBits);

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));

  const hkdf = async (ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, len: number) => {
    const key = await subtle.importKey("raw", ab(ikm), "HKDF", false, ["deriveBits"]);
    const bits = await subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: ab(salt), info: ab(info) }, key, len * 8,
    );
    return new Uint8Array(bits);
  };

  const authInfo = concatBytes(
    new TextEncoder().encode("WebPush: info\0"),
    clientPublicKeyBytes,
    serverPublicKeyRaw,
  );
  const prk = await hkdf(sharedSecret, authSecret, authInfo, 32);

  const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
  const cek = await hkdf(prk, salt, cekInfo, 16);
  const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");
  const nonce = await hkdf(prk, salt, nonceInfo, 12);

  // Padding delimiter 0x02 (no extra padding) then encrypt with AES-128-GCM.
  const plaintext = concatBytes(payload, new Uint8Array([2]));
  const aesKey = await subtle.importKey("raw", ab(cek), "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, ab(plaintext)),
  );

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  const idlen = new Uint8Array([serverPublicKeyRaw.length]);
  const header = concatBytes(salt, rs, idlen, serverPublicKeyRaw);
  return concatBytes(header, ciphertext);
}

export type PushSubscriptionLike = { endpoint: string; p256dh?: string | null; auth?: string | null };
export type PushSendResult = { ok: boolean; status?: number; expired?: boolean; error?: string };

/** Sends a single Web Push message. Returns `expired: true` on 404/410 so callers can prune the subscription. */
export async function sendWebPush(
  sub: PushSubscriptionLike,
  payload: Record<string, unknown>,
  vapid: { publicKey: string; privateKey: string; subject: string },
): Promise<PushSendResult> {
  try {
    if (!sub.endpoint) return { ok: false, error: "missing endpoint" };
    const body = sub.p256dh && sub.auth
      ? await encryptPayload(new TextEncoder().encode(JSON.stringify(payload)), sub.p256dh, sub.auth)
      : new Uint8Array(0);
    const jwt = await buildVapidJwt(sub.endpoint, vapid.subject, vapid.publicKey, vapid.privateKey);
    const headers: Record<string, string> = {
      TTL: "86400",
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
    };
    if (body.length) {
      headers["Content-Encoding"] = "aes128gcm";
      headers["Content-Type"] = "application/octet-stream";
    }
    const res = await fetch(sub.endpoint, { method: "POST", headers, body: body.length ? ab(body) : undefined });
    if (res.status === 404 || res.status === 410) {
      console.warn(`[sendWebPush] subscription gone (status ${res.status}) for ${new URL(sub.endpoint).host} — pruning`);
      return { ok: false, status: res.status, expired: true };
    }
    if (!res.ok) {
      // Non-201/2xx from the push service (FCM/Mozilla/etc): surface it instead of
      // silently swallowing — most delivery failures are diagnosable from this alone
      // (401/403 = bad VAPID, 400 = malformed payload, 413 = payload too large).
      const bodyText = await res.text().catch(() => "");
      console.error(`[sendWebPush] push service rejected message: status=${res.status} host=${new URL(sub.endpoint).host} body=${bodyText.slice(0, 300)}`);
    } else {
      console.info(`[sendWebPush] delivered: status=${res.status} host=${new URL(sub.endpoint).host}`);
    }
    return { ok: res.ok, status: res.status };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

function getVapid() {
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  const subject = process.env["VAPID_SUBJECT"] || "mailto:support@hanilearnqz.com";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

/**
 * Sends a push notification to every stored subscription for the given users
 * and deletes any subscription the push service reports as gone (404/410).
 * Best-effort — never throws.
 */
export async function pushToUsers(
  userIds: string[],
  notif: { title: string; body?: string; link?: string; image_url?: string; kind?: string },
): Promise<{ attempted: number; sent: number; pruned: number; statuses: number[]; configured: boolean }> {
  const vapid = getVapid();
  if (!vapid) {
    console.error("[pushToUsers] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set — push is disabled server-wide.");
    return { attempted: 0, sent: 0, pruned: 0, statuses: [], configured: false };
  }
  if (!userIds.length) return { attempted: 0, sent: 0, pruned: 0, statuses: [], configured: true };
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const uniq = Array.from(new Set(userIds));
    const { data: subs } = await db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", uniq);
    const rows: any[] = subs ?? [];
    let sent = 0;
    const statuses: number[] = [];
    const toPrune: string[] = [];
    await Promise.all(rows.map(async (s) => {
      const result = await sendWebPush(s, {
        title: notif.title,
        body: notif.body,
        link: notif.link || "/notifications",
        image_url: notif.image_url,
        tag: notif.kind,
      }, vapid);
      if (typeof result.status === "number") statuses.push(result.status);
      if (result.ok) sent++;
      if (result.expired) toPrune.push(s.id);
      await db.from("push_delivery_log").insert({
        user_id: s.user_id,
        endpoint_host: new URL(s.endpoint).host,
        status: result.status ?? null,
        ok: result.ok,
        expired: result.expired ?? false,
        error: result.error ?? null,
        payload: { title: notif.title, body: notif.body, link: notif.link, image_url: notif.image_url, kind: notif.kind },
      });
    }));
    if (toPrune.length) await db.from("push_subscriptions").delete().in("id", toPrune);
    console.info(`[pushToUsers] attempted=${rows.length} sent=${sent} pruned=${toPrune.length} statuses=${JSON.stringify(statuses)}`);
    return { attempted: rows.length, sent, pruned: toPrune.length, statuses, configured: true };
  } catch (e) {
    console.error("[pushToUsers] failed", e);
    return { attempted: 0, sent: 0, pruned: 0, statuses: [], configured: true };
  }
}
