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
const ANSWER_LABEL = /^(?:answer|ans|correct(?:\s*(?:answer|option))?|key|solution)\s*[:\-–=]\s*/i;
const EXPL_LABEL = /^(?:explanation|reason|rationale|because|why|note|hint)\s*[:\-–=]\s*/i;
const SCHEME_LABEL = /^(?:marking\s*scheme|model\s*answer|sample\s*answer|expected\s*answer|rubric|guide)\s*[:\-–=]\s*/i;
const PASSAGE_LABEL = /^(?:passage|extract|comprehension|read\s+the\s+following[^\n]*)\s*[:\-–]?\s*/i;
const SECTION_LABEL = /^(?:section|part|paper|topic|subject|chapter|unit|module)\b[^\n]{0,60}$/i;
const QUESTION_START = /^\s*(?:(?:q(?:uestion)?\s*)?(\d{1,3})[.)\-:\]]|\((\d{1,3})\)|(?:q|Q)(\d{1,3})\b)\s+/;
const OPTION_START = /^\s*(?:\(([A-Ha-h])\)|([A-Ha-h])[.)\-:]|\(([ivxIVX]{1,4})\)|([ivx]{1,4})[.)]|([•*\u2022\u25CF\-])\s)\s*/;
const INLINE_OPTIONS = /(?:^|\s)(?:\(?([A-Ha-h])\)|([A-Ha-h])[.)])\s+/g;
const MARKS = /[\[(]\s*(\d{1,3})\s*(?:marks?|mks?|pts?|points?)\s*[\])]/i;
const DIFF_HINT = /[\[(]\s*(easy|medium|moderate|hard|difficult)\s*[\])]/i;

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

/** Trailing answer keys: "ANSWERS" / "ANSWER KEY" blocks, or "1-A, 2-B" lines. */
function extractAnswerKey(raw: { body: string }) {
  const map = new Map<number, string>();
  const keyBlock = raw.body.match(/\n\s*(?:answers?|answer\s*key|solutions?)\s*[:\-]?\s*\n?([\s\S]{0,4000})$/i);
  const scanTargets: string[] = [];
  if (keyBlock) scanTargets.push(keyBlock[1]);
  // Also scan compact one-liners anywhere: "1. A  2. B  3. D"
  const compact = raw.body.match(/(?:^|\n)\s*(?:\d{1,3}\s*[.)\-]\s*[A-Ha-h]\b[\s,;]*){3,}/g);
  if (compact) scanTargets.push(compact.join("\n"));

  for (const chunk of scanTargets) {
    const re = /(\d{1,3})\s*[.)\-:]?\s*([A-Ha-h]|true|false|t|f)\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(chunk))) {
      const n = Number(m[1]);
      if (!map.has(n)) map.set(n, m[2]);
    }
  }
  if (keyBlock) raw.body = raw.body.slice(0, raw.body.length - keyBlock[0].length);
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
  let explanation: string | null = null;
  let sampleAnswer: string | null = null;
  let points: number | null = null;
  let difficulty: EngineQuestion["difficulty"] = "medium";
  const optionLines: string[] = [];
  const textLines: string[] = [];
  let forcedEssay = false;

  const lines = seg.lines.map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    if (ANSWER_LABEL.test(line)) {
      answerToken = line.replace(ANSWER_LABEL, "").trim();
      continue;
    }
    if (SCHEME_LABEL.test(line)) {
      sampleAnswer = [line.replace(SCHEME_LABEL, "").trim(), ...lines.slice(i + 1)].join("\n").trim();
      forcedEssay = true;
      break;
    }
    if (EXPL_LABEL.test(line)) {
      explanation = line.replace(EXPL_LABEL, "").trim();
      continue;
    }
    if (OPTION_START.test(line) && line.replace(OPTION_START, "").trim().length > 0) {
      optionLines.push(line);
      continue;
    }
    textLines.push(line);
  }

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
