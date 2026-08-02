/**
 * HaniLearn-QZ offline question engine.
 *
 * Pure, deterministic, zero-credit parser. It is deliberately rich: it
 * understands numbering styles, inline/tabular options, tick marks, answer
 * keys, passages, section headers, marks allocation, theory marking schemes
 * and fill-in-the-blank. The AI parser now only *reviews* what this produces.
 */

export type EngineOption = { text: string; is_correct: boolean };
export type EngineQuestion = {
  text: string;
  type: "mcq" | "tf" | "short" | "essay";
  options: EngineOption[];
  explanation?: string | null;
  sample_answer?: string | null;
  subsection?: string | null;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  points?: number | null;
  ai_confidence: number;
  needs_review: boolean;
  review_reason?: string | null;
  raw_import_text?: string | null;
};

const TICK = /[\u2713\u2714\u2705\u2611\u2612\u2716\u274C]/; // ✓ ✔ ✅ ☑ ☒ ✖ ❌
const GOOD_TICK = /[\u2713\u2714\u2705\u2611]/;

/** Inline label vocabulary. These may appear at the start of a line OR mid-line
 * ("Answer: B. Reason: water expands when it freezes."). */
const ANSWER_WORDS = "answer|answers|ans|correct\\s*answer|correct\\s*option|correct|key|solution|soln";
const EXPL_WORDS = "explanation|explanations|explain|reason|reasoning|rationale|rational|justification|why|because|note|notes|hint|remark|remarks|comment";
const SCHEME_WORDS = "marking\\s*scheme|mark\\s*scheme|model\\s*answer|sample\\s*answer|expected\\s*answer|suggested\\s*answer|rubric|answer\\s*guide";
const LABEL_SRC = `(?:^|[\\s.;:)\\]}"'\u2013\u2014-])((?:${SCHEME_WORDS}|${ANSWER_WORDS}|${EXPL_WORDS}))\\s*(?:[:\\-\u2013\u2014=]|\\bis\\b)\\s+`;

const PASSAGE_LABEL = /^(?:passage|extract|comprehension|read\s+the\s+following[^\n]*)\s*[:\-–]?\s*/i;
const SECTION_LABEL = /^(?:section|part|paper|topic|subject|chapter|unit|module)\b[^\n]{0,60}$/i;
const QUESTION_START = /^\s*(?:(?:q(?:uestion)?\s*)?(\d{1,3})[.)\-:\]]|\((\d{1,3})\)|(?:q|Q)(\d{1,3})\b)\s+/;
const OPTION_START = /^\s*(?:\(([A-Ha-h])\)|([A-Ha-h])\s*[.)\-:=]|\(([ivxIVX]{1,4})\)|([ivx]{1,4})[.)]|([•*\u2022\u25CF\u25AA\u2043\-])\s)\s*/;
const INLINE_OPTIONS = /(?:^|\s)(?:\(?([A-Ha-h])\)|([A-Ha-h])[.)])\s+/g;
const MARKS = /[\[(]\s*(\d{1,3})\s*(?:marks?|mks?|pts?|points?)\s*[\])]/i;
const DIFF_HINT = /[\[(]\s*(easy|medium|moderate|hard|difficult)\s*[\])]/i;

type LabelKind = "text" | "answer" | "explanation" | "scheme";

function classifyLabel(word: string): LabelKind {
  const w = word.toLowerCase().replace(/\s+/g, " ");
  if (new RegExp(`^(?:${SCHEME_WORDS})$`, "i").test(w)) return "scheme";
  if (new RegExp(`^(?:${ANSWER_WORDS})$`, "i").test(w)) return "answer";
  return "explanation";
}

/** Split a single line into labelled pieces, honouring mid-line labels. */
function splitLabeled(line: string): { kind: LabelKind; value: string }[] {
  const parts = line.split(new RegExp(LABEL_SRC, "gi"));
  const out: { kind: LabelKind; value: string }[] = [];
  if (parts[0] && parts[0].trim()) out.push({ kind: "text", value: parts[0].trim() });
  for (let i = 1; i < parts.length; i += 2) {
    const word = parts[i];
    if (!word) continue;
    out.push({ kind: classifyLabel(word), value: (parts[i + 1] ?? "").trim() });
  }
  if (!out.length && line.trim()) out.push({ kind: "text", value: line.trim() });
  return out;
}


export type EngineOptions = {
  defaultType?: "mcq" | "tf" | "short" | "essay";
  threshold?: number;
  maxQuestions?: number;
};

export function advancedParse(rawInput: string, opts: EngineOptions = {}) {
  const started = Date.now();
  const fallbackType = opts.defaultType ?? "mcq";
  const raw = normalize(rawInput);
  const answerKey = extractAnswerKey(raw);
  const segments = segmentDocument(raw.body);

  const questions: EngineQuestion[] = [];
  for (const seg of segments) {
    const q = buildQuestion(seg, fallbackType);
    if (!q) continue;
    // Answer key backfill (e.g. "ANSWERS: 1. A 2. C").
    const keyed = answerKey.get(seg.number ?? -1);
    if (keyed && q.options.length && !q.options.some((o) => o.is_correct)) {
      applyAnswerToken(q, keyed);
    }
    questions.push(q);
    if (opts.maxQuestions && questions.length >= opts.maxQuestions) break;
  }

  const scored = questions.map((q) => score(q, opts.threshold ?? 80));
  const overall = scored.length
    ? Math.round(scored.reduce((s, q) => s + q.ai_confidence, 0) / scored.length)
    : 0;

  return {
    questions: scored,
    needs_review_count: scored.filter((q) => q.needs_review).length,
    failed_count: scored.filter((q) => q.ai_confidence < 30).length,
    overall_confidence: overall,
    parsing_time_ms: Date.now() - started,
  };
}

/* ------------------------------- normalising ------------------------------ */

function normalize(input: string) {
  let text = String(input ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\t+/g, "  ")
    .replace(/[ ]{3,}/g, "  ")
    .replace(/^\s*page\s*\d+\s*(?:of\s*\d+)?\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { body: text };
}

/** Trailing answer keys: "ANSWERS" / "ANSWER KEY" blocks, or "1-A, 2-B" lines.
 *
 * The block form must be a header on its OWN line ("ANSWERS:" then the pairs
 * below) and must actually contain numbered pairs — otherwise an ordinary
 * per-question "Answer: B" line would be mistaken for the key block and the
 * rest of the paper would be discarded. */
function extractAnswerKey(raw: { body: string }) {
  const map = new Map<number, string>();
  const keyBlock = raw.body.match(
    /\n[ \t]*(?:answers?|answer\s*key|solutions?|marking\s*scheme)[ \t]*[:\-]?[ \t]*\n([\s\S]{0,4000})$/i,
  );
  const pairRe = /(\d{1,3})\s*[.)\-:]?\s*([A-Ha-h]|true|false|t|f)\b/gi;
  const scanTargets: string[] = [];
  const blockBody = keyBlock?.[1] ?? "";
  const blockLooksLikeKey = !!blockBody && (blockBody.match(pairRe)?.length ?? 0) >= 3;
  if (blockLooksLikeKey) scanTargets.push(blockBody);
  // Also scan compact one-liners anywhere: "1. A  2. B  3. D"
  const compact = raw.body.match(/(?:^|\n)\s*(?:\d{1,3}\s*[.)\-]\s*[A-Ha-h]\b[\s,;]*){3,}/g);
  if (compact) scanTargets.push(compact.join("\n"));

  for (const chunk of scanTargets) {
    const re = new RegExp(pairRe.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(chunk))) {
      const n = Number(m[1]);
      if (!map.has(n)) map.set(n, m[2]);
    }
  }
  if (keyBlock && blockLooksLikeKey) raw.body = raw.body.slice(0, raw.body.length - keyBlock[0].length);
  return map;
}


type Segment = {
  number: number | null;
  lines: string[];
  subsection: string | null;
  passage: string | null;
};

function segmentDocument(body: string) {
  const lines = body.split("\n");
  const segments: Segment[] = [];
  let current: Segment | null = null;
  let subsection: string | null = null;
  let passage: string | null = null;
  let passageBuffer: string[] | null = null;

  const push = () => {
    if (current && current.lines.some((l) => l.trim())) segments.push(current);
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/g, "");
    const trimmed = line.trim();

    if (passageBuffer) {
      // A passage runs until a question start or a blank line followed by numbering.
      if (QUESTION_START.test(line) || SECTION_LABEL.test(trimmed)) {
        passage = passageBuffer.join("\n").trim() || null;
        passageBuffer = null;
      } else {
        passageBuffer.push(trimmed);
        continue;
      }
    }

    if (!trimmed) {
      if (current) current.lines.push("");
      continue;
    }

    if (PASSAGE_LABEL.test(trimmed) && trimmed.length < 400) {
      push();
      passageBuffer = [trimmed.replace(PASSAGE_LABEL, "").trim()].filter(Boolean);
      continue;
    }

    if (isHeader(trimmed)) {
      push();
      subsection = cleanHeader(trimmed);
      passage = null;
      continue;
    }

    const qm = trimmed.match(QUESTION_START);
    if (qm) {
      push();
      const num = Number(qm[1] ?? qm[2] ?? qm[3]) || null;
      current = { number: num, lines: [trimmed], subsection, passage };
      continue;
    }

    if (!current) current = { number: null, lines: [trimmed], subsection, passage };
    else current.lines.push(trimmed);
  }
  push();

  // If the doc had no numbering at all, fall back to blank-line blocks.
  if (segments.length <= 1 && body.includes("\n\n")) {
    const blocks = body.split(/\n\s*\n/).map((b) => b.trim()).filter((b) => b.length > 12);
    if (blocks.length > 1) {
      return blocks.map((b) => ({ number: null, lines: b.split("\n"), subsection: null, passage: null }));
    }
  }
  return segments;
}

function isHeader(line: string) {
  if (line.length > 80) return false;
  if (QUESTION_START.test(line)) return false;
  if (SECTION_LABEL.test(line)) return true;
  const isUpper = line === line.toUpperCase() && /[A-Z]{3,}/.test(line) && !/[?]/.test(line);
  const isMarkdown = /^#{1,4}\s+/.test(line);
  const isBracketed = /^[\[<(].{2,60}[\])>]$/.test(line);
  return isUpper || isMarkdown || isBracketed;
}

function cleanHeader(line: string) {
  return line.replace(/^#{1,4}\s+/, "").replace(/^[\[<(]|[\])>]$/g, "").replace(/[:\-\s]+$/, "").slice(0, 60).trim();
}

/* ------------------------------ question build ---------------------------- */

function buildQuestion(seg: Segment, fallbackType: EngineQuestion["type"]): EngineQuestion | null {
  const rawBlock = seg.lines.join("\n").trim();
  if (!rawBlock) return null;

  let answerToken: string | null = null;
  const explParts: string[] = [];
  const schemeParts: string[] = [];
  let points: number | null = null;
  let difficulty: EngineQuestion["difficulty"] = "medium";
  const optionLines: string[] = [];
  const textLines: string[] = [];
  let forcedEssay = false;
  // Continuation tracking: an unlabelled line right after "Explanation:" belongs
  // to the explanation, not to the question stem.
  let flow: LabelKind = "text";

  const lines = seg.lines.map((l) => l.trim());
  for (const line of lines) {
    if (!line) { flow = "text"; continue; }

    const isOption = OPTION_START.test(line) && line.replace(OPTION_START, "").trim().length > 0;
    const pieces = splitLabeled(line);
    const hasLabel = pieces.some((p) => p.kind !== "text");

    // A real option line ("C) Paris ✓") wins over label detection.
    if (isOption && !hasLabel) {
      optionLines.push(line);
      flow = "text";
      continue;
    }
    // "C) Paris — Reason: it is the capital" → option plus explanation.
    if (isOption && hasLabel) {
      const head = pieces[0]?.kind === "text" ? pieces[0].value : "";
      if (head) optionLines.push(head);
    }

    if (!hasLabel) {
      const value = pieces[0]?.value ?? line;
      if (flow === "explanation") explParts.push(value);
      else if (flow === "scheme") schemeParts.push(value);
      else if (flow === "answer" && !answerToken) answerToken = value;
      else textLines.push(value);
      continue;
    }

    for (const piece of pieces) {
      if (piece.kind === "text") {
        if (!isOption && piece.value) textLines.push(piece.value);
        continue;
      }
      if (piece.kind === "answer") {
        // "Answer: B. Because it freezes" → keep only the token before punctuation.
        if (!answerToken && piece.value) answerToken = piece.value;
        flow = "answer";
      } else if (piece.kind === "scheme") {
        if (piece.value) schemeParts.push(piece.value);
        forcedEssay = true;
        flow = "scheme";
      } else {
        if (piece.value) explParts.push(piece.value);
        flow = "explanation";
      }
    }
  }

  const explanation = explParts.join(" ").replace(/\s{2,}/g, " ").trim() || null;
  const sampleAnswer = schemeParts.join("\n").trim() || null;


  let questionText = textLines.join("\n").replace(QUESTION_START, "").trim();

  const marks = rawBlock.match(MARKS);
  if (marks) {
    points = Number(marks[1]);
    questionText = questionText.replace(MARKS, "").trim();
  }
  const diff = rawBlock.match(DIFF_HINT);
  if (diff) {
    const d = diff[1].toLowerCase();
    difficulty = d === "easy" ? "easy" : d.startsWith("hard") || d.startsWith("diff") ? "hard" : "medium";
    questionText = questionText.replace(DIFF_HINT, "").trim();
  }

  // Inline options on one line: "A. Lagos B. Abuja C. Kano"
  if (!optionLines.length) {
    const inline = splitInlineOptions(questionText);
    if (inline) {
      questionText = inline.stem;
      optionLines.push(...inline.options);
    }
  }

  let options: EngineOption[] = optionLines.map((line) => {
    const stripped = line.replace(OPTION_START, "");
    const marked = GOOD_TICK.test(line) || /\*\*.+\*\*/.test(stripped) || /\(\s*correct\s*\)/i.test(stripped) || /^\s*\*/.test(line);
    return { text: cleanText(stripped), is_correct: marked };
  }).filter((o) => o.text);

  const looksTf = !options.length && /\b(?:true\s*(?:\/|or)\s*false|t\s*\/\s*f)\b/i.test(rawBlock);
  const isBlank = /_{3,}|\.{4,}/.test(questionText);
  const essayWords = /\b(?:discuss|explain briefly|explain in detail|describe|essay|elaborate|justify|evaluate|compare and contrast|write (?:short notes|an essay)|state and explain)\b/i;
  const declaredEssay = forcedEssay || /\((?:theory|essay|structural)\)/i.test(rawBlock);

  let type: EngineQuestion["type"];
  if (options.length >= 2) type = "mcq";
  else if (looksTf) type = "tf";
  else if (declaredEssay || (essayWords.test(questionText) && !options.length)) type = "essay";
  else if (isBlank || answerToken) type = "short";
  else fallbackType === "mcq" && options.length < 2 ? (type = "short") : (type = fallbackType);

  if (type === "tf") {
    const t = /^(?:true|t|yes)\b/i.test(answerToken ?? "");
    const f = /^(?:false|f|no)\b/i.test(answerToken ?? "");
    options = [{ text: "True", is_correct: t }, { text: "False", is_correct: f }];
  } else if (type === "essay") {
    options = [];
  } else if (type === "short") {
    const ans = answerToken ?? "";
    options = ans ? [{ text: cleanText(ans), is_correct: true }] : [];
  }

  const q: EngineQuestion = {
    text: withPassage(questionText, seg.passage),
    type,
    options,
    explanation: explanation ?? null,
    sample_answer: type === "essay" ? sampleAnswer ?? explanation ?? null : null,
    subsection: seg.subsection,
    difficulty,
    tags: [],
    points,
    ai_confidence: 0,
    needs_review: false,
    review_reason: null,
    raw_import_text: rawBlock.slice(0, 4000),
  };

  if (answerToken && type === "mcq" && !q.options.some((o) => o.is_correct)) applyAnswerToken(q, answerToken);
  if (!q.text || q.text.length < 4) return null;
  return q;
}

function withPassage(text: string, passage: string | null) {
  if (!passage) return text;
  return `${passage}\n\n${text}`.trim();
}

function splitInlineOptions(stem: string) {
  const singleLine = stem.replace(/\n/g, " ");
  const matches = [...singleLine.matchAll(INLINE_OPTIONS)];
  const letters = matches.map((m) => (m[1] ?? m[2] ?? "").toUpperCase());
  // Need at least A and B in sequence to be confident.
  if (letters.length < 2 || letters[0] !== "A" || letters[1] !== "B") return null;
  const first = matches[0].index ?? 0;
  const question = singleLine.slice(0, first).trim();
  if (question.length < 5) return null;
  const options: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = (matches[i].index ?? 0);
    const end = i + 1 < matches.length ? matches[i + 1].index ?? singleLine.length : singleLine.length;
    options.push(singleLine.slice(start, end).trim());
  }
  return { stem: question, options };
}

function applyAnswerToken(q: EngineQuestion, token: string) {
  const t = token.trim();
  if (!q.options.length) return;
  if (q.type === "tf") {
    const isTrue = /^(?:true|t|yes)\b/i.test(t);
    q.options = [{ text: "True", is_correct: isTrue }, { text: "False", is_correct: !isTrue }];
    return;
  }
  const letters = t.toUpperCase().match(/\b([A-H])\b/g);
  if (letters?.length) {
    const idxs = new Set(letters.map((l) => l.charCodeAt(0) - 65));
    q.options = q.options.map((o, i) => ({ ...o, is_correct: idxs.has(i) }));
    if (q.options.some((o) => o.is_correct)) return;
  }
  // Match by option text.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const target = norm(t);
  if (target) {
    let matched = false;
    q.options = q.options.map((o) => {
      const hit = norm(o.text) === target || (target.length > 3 && norm(o.text).includes(target));
      if (hit) matched = true;
      return { ...o, is_correct: hit };
    });
    if (!matched) q.review_reason = "Answer given but could not be matched to an option";
  }
}

function cleanText(text: string) {
  return String(text ?? "")
    .replace(TICK, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\(\s*correct\s*\)/i, "")
    .replace(/^\s*\*+\s*/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function score(q: EngineQuestion, threshold: number) {
  const reasons: string[] = [];
  let conf = 55;
  if (q.text.length > 15) conf += 10;
  if (q.type === "mcq") {
    if (q.options.length >= 2) conf += 15; else reasons.push("Expected at least 2 options");
    if (q.options.some((o) => o.is_correct)) conf += 20; else reasons.push("Could not identify the correct answer");
    if (q.options.filter((o) => o.is_correct).length > 1) reasons.push("Multiple options marked correct");
  } else if (q.type === "tf") {
    if (q.options.some((o) => o.is_correct)) conf += 25; else reasons.push("True/False answer not detected");
  } else if (q.type === "short") {
    if (q.options.some((o) => o.is_correct)) conf += 20; else reasons.push("No accepted answer supplied");
  } else {
    conf += q.sample_answer ? 20 : 5;
    if (!q.sample_answer) reasons.push("Theory question has no marking scheme — AI marking will be used");
  }
  if (q.explanation) conf += 5;
  if (q.review_reason) reasons.push(q.review_reason);
  const ai_confidence = Math.max(0, Math.min(100, conf));
  return {
    ...q,
    ai_confidence,
    needs_review: ai_confidence < threshold || reasons.length > 0,
    review_reason: reasons.join("; ") || null,
  };
}
