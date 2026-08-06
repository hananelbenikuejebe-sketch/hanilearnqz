/**
 * Deterministic grading helpers.
 *
 * The golden rule: the correct answer is whatever the creator set in the quiz
 * settings (`options.is_correct`, falling back to `sample_answer`). Grading must
 * never depend on option order, shuffling, or on the raw value the client sent.
 */

export const DEFAULT_OBJECTIVE_POINTS = 1;
export const DEFAULT_OPEN_POINTS = 10;

export type Verdict = {
  status: "correct" | "wrong" | "ungradable";
  selected_ids: string[];
  correct_ids: string[];
  reason?: string;
};

export function pointsFor(q: any): number {
  const p = Number(q?.points);
  if (Number.isFinite(p) && p > 0) return p;
  return q?.type === "short" || q?.type === "essay" ? DEFAULT_OPEN_POINTS : DEFAULT_OBJECTIVE_POINTS;
}

export const isOpen = (q: any) => q?.type === "short" || q?.type === "essay";
export const isObjective = (q: any) => q?.type === "mcq" || q?.type === "tf";

/** Normalise text for tolerant comparison: case, punctuation and spacing insensitive. */
export function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/** Leading option label, e.g. "A", "b)", "(c)", "d." */
function letterIndex(raw: string): number | null {
  const m = String(raw ?? "").trim().match(/^\(?([a-z])[).\s]?$/i);
  if (!m) return null;
  return m[1].toLowerCase().charCodeAt(0) - 97;
}

function toArray(ans: unknown): string[] {
  if (Array.isArray(ans)) return ans.map((a) => String(a)).filter((a) => a.length > 0);
  if (ans === null || ans === undefined) return [];
  const s = String(ans);
  return s.trim() ? [s] : [];
}

/**
 * Resolve whatever the client submitted into real option ids.
 * Accepts option ids, option text, or an option letter so a stale/legacy client
 * payload can never be scored as wrong for the wrong reason.
 */
export function resolveSelectedOptionIds(q: any, ans: unknown): string[] {
  const options: any[] = (q?.options ?? []).slice().sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
  const byId = new Map(options.map((o) => [String(o.id), o]));
  const byText = new Map(options.map((o) => [norm(o.text), o]));
  const out: string[] = [];
  for (const raw of toArray(ans)) {
    const direct = byId.get(String(raw).trim());
    if (direct) { out.push(String(direct.id)); continue; }
    const byTextHit = byText.get(norm(raw));
    if (byTextHit) { out.push(String(byTextHit.id)); continue; }
    const li = letterIndex(raw);
    if (li !== null && options[li]) { out.push(String(options[li].id)); continue; }
  }
  return Array.from(new Set(out));
}

/** Correct option ids, falling back to matching `sample_answer` against option text. */
export function correctOptionIds(q: any): string[] {
  const options: any[] = q?.options ?? [];
  const flagged = options.filter((o: any) => o.is_correct).map((o: any) => String(o.id));
  if (flagged.length) return flagged;
  const key = q?.sample_answer ?? q?.answer ?? null;
  if (key) {
    const k = norm(key);
    const hit = options.find((o: any) => norm(o.text) === k);
    if (hit) return [String(hit.id)];
    const li = letterIndex(String(key));
    const sorted = options.slice().sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
    if (li !== null && sorted[li]) return [String(sorted[li].id)];
  }
  return [];
}

/**
 * Grade a single-answer or multi-answer objective question.
 *
 * - No answer key at all -> `ungradable` (excluded from the score instead of
 *   silently marked wrong, which is the bug students were hitting).
 * - Several options flagged correct but the player is single-select -> picking
 *   any flagged option counts.
 */
export function gradeObjective(q: any, ans: unknown): Verdict {
  const correct_ids = correctOptionIds(q);
  const selected_ids = resolveSelectedOptionIds(q, ans);

  if (correct_ids.length === 0) {
    return {
      status: "ungradable",
      selected_ids,
      correct_ids,
      reason: "The creator did not set a correct answer for this question, so it was excluded from your score.",
    };
  }
  if (selected_ids.length === 0) {
    return { status: "wrong", selected_ids, correct_ids, reason: "No answer submitted." };
  }
  const correctSet = new Set(correct_ids);
  const allSelectedAreCorrect = selected_ids.every((id) => correctSet.has(id));
  const exactMatch = allSelectedAreCorrect && selected_ids.length === correct_ids.length;
  const singleSelectHit = allSelectedAreCorrect && selected_ids.length === 1 && correct_ids.length > 1;
  return {
    status: exactMatch || singleSelectHit ? "correct" : "wrong",
    selected_ids,
    correct_ids,
  };
}

/**
 * Deterministic pass at an open-ended answer, so short answers with a real
 * answer key never burn AI credit (and never get marked wrong by the model).
 * Returns null when only AI can judge it.
 */
export function gradeShortDeterministically(q: any, answer: string): { score: number; feedback: string } | null {
  const max = pointsFor(q);
  const student = norm(answer);
  if (!student) return { score: 0, feedback: "No answer submitted." };

  const flagged = (q?.options ?? []).filter((o: any) => o.is_correct).map((o: any) => String(o.text));
  const accepted: string[] = flagged.length ? flagged : [];
  const key = q?.sample_answer ? String(q.sample_answer).trim() : "";
  // Only treat the model answer as an exact key when it is a short one-liner.
  if (!accepted.length && q?.type === "short" && key && key.length <= 80 && !key.includes("\n")) {
    accepted.push(...key.split(/\s*(?:\/|,|;|\bor\b)\s*/i).filter(Boolean));
  }
  if (!accepted.length) return null;

  const hit = accepted.some((a) => {
    const n = norm(a);
    return n.length > 0 && (n === student || (n.length >= 4 && (student.includes(n) || n.includes(student))));
  });
  if (hit) return { score: max, feedback: `Correct — matches the expected answer${key ? ` (${key})` : ""}.` };
  return { score: 0, feedback: key ? `Incorrect. Expected: ${key}` : `Incorrect. Expected: ${accepted.join(" / ")}` };
}

/** Run promises with bounded concurrency so a long quiz does not stall the request. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length) as R[];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export function withTimeout<T>(p: Promise<T>, ms: number, label = "AI marker"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
