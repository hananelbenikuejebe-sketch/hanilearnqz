// Monnify integration — server only.
// Docs: https://developers.monnify.com/
import { createHmac, timingSafeEqual } from "crypto";

function base() {
  const b = (process.env.Base_URL || "https://sandbox.monnify.com").replace(/\/+$/, "");
  return b;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

export async function monnifyLogin(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;
  const apiKey = process.env.API_Key;
  const secret = process.env.Secret_Key;
  if (!apiKey || !secret) throw new Error("Monnify credentials not configured");
  const basic = Buffer.from(`${apiKey}:${secret}`).toString("base64");
  const res = await fetch(`${base()}/api/v1/auth/login`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
  });
  const json: any = await res.json();
  if (!res.ok || !json?.responseBody?.accessToken) {
    throw new Error("Monnify auth failed: " + (json?.responseMessage ?? res.status));
  }
  const token = json.responseBody.accessToken as string;
  const expiresIn = Number(json.responseBody.expiresIn ?? 3600) * 1000;
  cachedToken = { value: token, expiresAt: Date.now() + expiresIn };
  return token;
}

export interface InitTxInput {
  amount: number; // Naira (whole)
  reference: string;
  narration: string;
  customerName: string;
  customerEmail: string;
  redirectUrl: string;
}

export async function initTransaction(input: InitTxInput) {
  const token = await monnifyLogin();
  const contract = process.env.Contract_Code;
  if (!contract) throw new Error("Monnify contract code missing");
  const res = await fetch(`${base()}/api/v1/merchant/transactions/init-transaction`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: input.amount,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      paymentReference: input.reference,
      paymentDescription: input.narration,
      currencyCode: "NGN",
      contractCode: contract,
      redirectUrl: input.redirectUrl,
      paymentMethods: ["CARD", "ACCOUNT_TRANSFER", "USSD"],
    }),
  });
  const json: any = await res.json();
  if (!res.ok || !json?.responseBody?.checkoutUrl) {
    throw new Error("Monnify init failed: " + (json?.responseMessage ?? res.status));
  }
  return {
    checkoutUrl: json.responseBody.checkoutUrl as string,
    transactionReference: json.responseBody.transactionReference as string,
  };
}

export async function verifyTransaction(paymentReference: string) {
  const token = await monnifyLogin();
  const res = await fetch(
    `${base()}/api/v2/merchant/transactions/query?paymentReference=${encodeURIComponent(paymentReference)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const json: any = await res.json();
  if (!res.ok) throw new Error("Monnify verify failed: " + (json?.responseMessage ?? res.status));
  return json?.responseBody ?? null;
}

/** Monnify sends SHA-512 HMAC of the raw body using your secret key in `monnify-signature`. */
export function verifyWebhookSignature(rawBody: string, signatureHex: string | null): boolean {
  const secret = process.env.Secret_Key;
  if (!secret || !signatureHex) return false;
  const expected = createHmac("sha512", secret).update(rawBody, "utf8").digest("hex");
  try {
    const a = Buffer.from(signatureHex, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
