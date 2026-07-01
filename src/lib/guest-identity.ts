// Deterministic, memorable guest identity derived from device + browser signals.
// Persists to localStorage so returning guests keep the same handle.
const ADJECTIVES = [
  "Swift", "Quiet", "Bright", "Bold", "Clever", "Curious", "Daring", "Gentle",
  "Happy", "Jolly", "Keen", "Lively", "Mellow", "Noble", "Proud", "Quick",
  "Silent", "Sunny", "Wise", "Zesty", "Cosmic", "Crimson", "Golden", "Silver",
];
const ANIMALS = [
  "Owl", "Fox", "Falcon", "Otter", "Panda", "Tiger", "Wolf", "Hawk",
  "Lynx", "Raven", "Bear", "Eagle", "Deer", "Heron", "Koala", "Puma",
  "Seal", "Swan", "Yak", "Zebra", "Badger", "Crane", "Dolphin", "Ibis",
];

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function collectFingerprint(): string {
  if (typeof window === "undefined") return "server";
  const nav = window.navigator;
  const scr = window.screen;
  return [
    nav.userAgent,
    nav.language,
    nav.languages?.join(",") ?? "",
    nav.hardwareConcurrency ?? "",
    (nav as any).deviceMemory ?? "",
    scr.width, scr.height, scr.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    new Date().getTimezoneOffset(),
  ].join("|");
}

const LS_KEY = "hanilearn.guest.identity.v1";

export async function getOrCreateGuestIdentity(): Promise<{ handle: string; fingerprint: string }> {
  if (typeof window === "undefined") return { handle: "Guest", fingerprint: "server" };
  try {
    const cached = localStorage.getItem(LS_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed?.handle && parsed?.fingerprint) return parsed;
    }
  } catch { /* ignore */ }
  const raw = collectFingerprint();
  const hex = await sha256Hex(raw);
  const a = parseInt(hex.slice(0, 4), 16) % ADJECTIVES.length;
  const b = parseInt(hex.slice(4, 8), 16) % ANIMALS.length;
  const suffix = parseInt(hex.slice(8, 12), 16) % 9000 + 1000; // 4-digit number
  const handle = `${ADJECTIVES[a]}${ANIMALS[b]}-${suffix}`;
  const value = { handle, fingerprint: hex.slice(0, 32) };
  try { localStorage.setItem(LS_KEY, JSON.stringify(value)); } catch { /* ignore */ }
  return value;
}
