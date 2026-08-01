import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { assertAiAllowed, logAiUsage, checkAiAccess, billAiUsage } from "./authz.server";


const ParsedQuestionSchema = z.object({
  text: z.string().default(""),
  type: z.enum(["mcq", "tf", "short", "essay"]).catch("mcq"),
  options: z.array(z.object({ text: z.string().default(""), is_correct: z.boolean().default(false) })).default([]),
  explanation: z.string().optional().nullable(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional().catch("medium"),
  tags: z.array(z.string()).optional().default([]),
  subsection: z.string().max(120).optional().nullable(),
  ai_confidence: z.coerce.number().optional(),
  needs_review: z.boolean().optional(),
  review_reason: z.string().optional().nullable(),
  raw_import_text: z.string().optional().nullable(),
  sample_answer: z.string().optional().nullable(),
});

const ParsedSchema = z.object({
  questions: z.array(ParsedQuestionSchema).default([]),
  needs_review_count: z.coerce.number().optional(),
  failed_count: z.coerce.number().optional(),
  overall_confidence: z.coerce.number().optional(),
  parsing_time_ms: z.coerce.number().optional(),
});

const SYSTEM_PROMPT = `You are HaniLearn-QZ's quiz import engine. Extract real questions from messy educational text and return ONLY compact JSON.

Understand mixed formats in one document:
- MCQ: numbered, lettered, bullets, tables, answer keys at the end, asterisks on correct options, 2-6 options.
- True/False: T/F, True or False, Yes/No statements.
- Short answer and fill-in-the-blank.
- Essay/theory prompts with model answers when provided.
- Reading comprehension: if a passage is followed by sub-questions, prepend the passage verbatim to each related question, separated by a blank line.
- Sections may restart numbering; flatten into source order.

Rules:
- Do not invent answers. If the answer is missing, keep the question and set needs_review=true.
- Strip answer lines from question text after extracting them.
- Preserve math and exam wording.
- For tf, output exactly True and False options.
- For short, put the accepted answer as the only correct option.
- For essay, options=[] and sample_answer only if present.
- Flag duplicates, unclear fragments, missing correct answers, and malformed options.
- ALWAYS generate an "explanation" field (1–3 sentences) teaching WHY the correct answer is right — even if the source did not provide one. Keep it factual, concise, and exam-appropriate. For essay/short answers, summarise the expected reasoning.
- Detect subsections: when the source uses section headers ("Section A", "Part 1: Algebra", "Reading Comprehension", "Passage 2", chapter titles, or clearly separated topic blocks), tag each question with the nearest heading in the "subsection" field. Use short human labels (max ~40 chars). If no heading applies, leave it null.

Return this exact JSON object, with no markdown:
{"questions":[{"text":"...","type":"mcq|tf|short|essay","options":[{"text":"...","is_correct":true}],"explanation":"...","difficulty":"easy|medium|hard","tags":["..."],"subsection":"Section A","ai_confidence":0,"needs_review":false,"review_reason":"","raw_import_text":"...","sample_answer":"..."}],"needs_review_count":0,"failed_count":0,"overall_confidence":0}`;


const ParseInput = z.object({
  text: z.string().min(10).max(60000),
  settings: z.object({
    strictness: z.enum(["loose", "normal", "strict"]).default("normal"),
    auto_detect_type: z.boolean().default(true),
    confidence_threshold: z.number().int().min(30).max(95).default(80),
    default_question_type: z.enum(["mcq", "tf", "short", "essay"]).default("mcq"),
    ask_confirmation: z.boolean().default(true),
  }).optional(),
  format_hint: z.string().max(40).optional(),
});

type ParseSettings = NonNullable<z.infer<typeof ParseInput>["settings"]>;

/**
 * Offline-first import. The deterministic engine does the bulk of the work and
 * the AI is only asked to repair the questions the engine was unsure about.
 * This is where the credit savings come from.
 */
export const parseQuestionsFromText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ParseInput.parse(d))
  .handler(async ({ data, context }) => {
    await checkAiAccess(context.supabase, context.userId, "ai_parser");
    const started = Date.now();
    const settings = data.settings ?? defaultSettings();
    const { advancedParse } = await import("./parse-engine");
    const offline = advancedParse(data.text, {
      defaultType: settings.default_question_type,
      threshold: settings.confidence_threshold,
    });

    const key = process.env['LOVABLE_API_KEY'];
    if (!key) {
      if (!offline.questions.length) throw new Error("AI is not configured yet and the offline parser found no questions.");
      return { ...normalizeParsed(offline as any, data.text, settings.confidence_threshold, Date.now() - started, "Parsed offline — review before publishing."), offline: true };
    }
    const gateway = createLovableAiGatewayProvider(key);
    const model = "google/gemini-3-flash-preview";

    // Nothing offline? Fall back to a full AI extraction.
    if (!offline.questions.length) {
      const prompt = buildPrompt(data.text, settings, data.format_hint);
      try {
        const full = await generateText({
          model: gateway(model), system: SYSTEM_PROMPT, prompt, temperature: 0, maxOutputTokens: 16000,
        });
        await billAiUsage(context.userId, "ai_parser", {
          model,
          input_tokens: (full as any).usage?.inputTokens ?? 0,
          output_tokens: (full as any).usage?.outputTokens ?? 0,
        });
        return normalizeParsed(safeParseAiJson(full.text), data.text, settings.confidence_threshold, Date.now() - started);
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (isBillingOrRateError(msg)) throw mapAiError(msg);
        throw new Error("Could not read this text. Add clearer numbering, options (A., B.) or 'Answer:' lines and try again.");
      }
    }

    // Only the weak ones go to AI.
    const weak = offline.questions
      .map((q, i) => ({ q, i }))
      .filter(({ q }) => q.needs_review || !q.explanation);

    if (!weak.length) {
      return {
        ...normalizeParsed(offline as any, data.text, settings.confidence_threshold, Date.now() - started),
        offline: true,
        ai_reviewed: 0,
      };
    }

    const payload = weak.slice(0, 60).map(({ q, i }) => ({
      id: i,
      text: q.text.slice(0, 1500),
      type: q.type,
      options: q.options,
      issue: q.review_reason,
      raw: (q.raw_import_text ?? "").slice(0, 1200),
    }));

    try {
      const review = await generateText({
        model: gateway(model),
        system: `You repair questions that an offline parser was unsure about. For each item: fix the question text, ensure the option list is right, mark exactly one correct option (or the accepted answer for short, [] for essay), and ALWAYS write a 1-3 sentence "explanation" teaching why the answer is right. Never invent an answer that contradicts the raw text; if the answer truly is not present, keep needs_review true and say why.
Return ONLY JSON: {"questions":[{"id":0,"text":"...","type":"mcq|tf|short|essay","options":[{"text":"...","is_correct":true}],"explanation":"...","sample_answer":"...","difficulty":"easy|medium|hard","ai_confidence":0,"needs_review":false,"review_reason":""}]}`,
        prompt: JSON.stringify({ strictness: settings.strictness, items: payload }),
        temperature: 0,
        maxOutputTokens: 8000,
      });
      await billAiUsage(context.userId, "ai_parser", {
        model,
        input_tokens: (review as any).usage?.inputTokens ?? 0,
        output_tokens: (review as any).usage?.outputTokens ?? 0,
        meta: { mode: "review", reviewed: payload.length },
      });

      const repaired = safeParseAiJson(review.text);
      const byId = new Map<number, any>();
      (repaired.questions ?? []).forEach((r: any, idx: number) => {
        const id = typeof r.id === "number" ? r.id : payload[idx]?.id;
        if (typeof id === "number") byId.set(id, r);
      });

      const merged = offline.questions.map((q, i) => {
        const fix = byId.get(i);
        if (!fix) return q;
        const options = Array.isArray(fix.options) && fix.options.length ? fix.options : q.options;
        const hasCorrect = options.some((o: any) => o.is_correct);
        return {
          ...q,
          text: fix.text?.trim() ? fix.text : q.text,
          type: fix.type ?? q.type,
          options,
          explanation: fix.explanation ?? q.explanation,
          sample_answer: fix.sample_answer ?? q.sample_answer,
          difficulty: fix.difficulty ?? q.difficulty,
          needs_review: fix.needs_review ?? !hasCorrect,
          review_reason: fix.needs_review ? (fix.review_reason ?? q.review_reason) : null,
          ai_confidence: typeof fix.ai_confidence === "number" && fix.ai_confidence > 0
            ? (fix.ai_confidence <= 1 ? fix.ai_confidence * 100 : fix.ai_confidence)
            : Math.max(q.ai_confidence, hasCorrect ? 80 : q.ai_confidence),
        };
      });

      return {
        ...normalizeParsed({ questions: merged } as any, data.text, settings.confidence_threshold, Date.now() - started),
        offline: false,
        ai_reviewed: payload.length,
      };
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (isBillingOrRateError(msg)) throw mapAiError(msg);
      return {
        ...normalizeParsed(offline as any, data.text, settings.confidence_threshold, Date.now() - started, "AI review unavailable — offline results shown, please check each question."),
        offline: true,
        ai_reviewed: 0,
      };
    }
  });

// Lightweight pre-parse validator — runs before any AI or heuristic parse.
export const validateParseInput = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ text: z.string().max(60000) }).parse(d))
  .handler(async ({ data }) => validateInputText(data.text));

// Deterministic non-AI parser. Free (no credits), rule-based, free-tier limited.
export const parseQuestionsHeuristic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ParseInput.parse(d))
  .handler(async ({ data, context }) => {
    const started = Date.now();
    const settings = data.settings ?? defaultSettings();
    const validation = validateInputText(data.text);
    const { advancedParse } = await import("./parse-engine");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const [{ data: platform }, { data: perms }] = await Promise.all([
      db.from("payment_settings").select("free_tier_enabled, free_offline_parse_limit").eq("id", "default").maybeSingle(),
      db.from("creator_permissions").select("max_quizzes, can_publish").eq("user_id", context.userId).maybeSingle(),
    ]);
    const isPaid = !!perms?.can_publish;
    const limit = !isPaid && platform?.free_tier_enabled !== false
      ? Number(platform?.free_offline_parse_limit ?? 20)
      : undefined;

    const engine = advancedParse(data.text, {
      defaultType: settings.default_question_type,
      threshold: settings.confidence_threshold,
      maxQuestions: limit,
    });
    const normalized = normalizeParsed(
      engine as any,
      data.text,
      settings.confidence_threshold,
      Date.now() - started,
    );
    return {
      ...normalized,
      offline: true,
      validation,
      limited: limit !== undefined && engine.questions.length >= limit
        ? `Free tier: only the first ${limit} questions were imported. Upgrade to creator access for unlimited imports.`
        : null,
    };
  });

function validateInputText(text: string) {
  const issues: { level: "error" | "warn"; message: string }[] = [];
  const trimmed = text.trim();
  if (trimmed.length < 20) issues.push({ level: "error", message: "Text is too short to contain a question." });
  const hasNumbering = /(^|\n)\s*(?:\d+|Q\d+)[.)\-:]\s+/i.test(trimmed);
  const hasQuestionMark = /\?/.test(trimmed);
  const hasAnswerMarker = /(^|\n)\s*(?:answer|ans|correct)\s*[:\-]/i.test(trimmed);
  if (!hasNumbering && !hasQuestionMark) issues.push({ level: "warn", message: "No question numbering (1., 2., Q1) or '?' detected. Add numbering for best results." });
  if (!hasAnswerMarker && !/\bTrue\s*\/\s*False\b/i.test(trimmed)) issues.push({ level: "warn", message: "No 'Answer:' lines detected. Missing answers will be flagged for review." });
  if (trimmed.length > 50000) issues.push({ level: "warn", message: "Very large paste — will be chunked; parsing may take a minute." });
  const est = (trimmed.match(/(^|\n)\s*(?:\d+|Q\d+)[.)\-:]\s+/gi) ?? []).length || Math.max(1, Math.round(trimmed.split(/\n\s*\n/).length));
  return { ok: !issues.some((i) => i.level === "error"), issues, estimated_questions: est };
}

// AI-graded short/essay marker — small, targeted, cheap.
export const gradeOpenAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    question: z.string().min(1).max(4000),
    sample_answer: z.string().max(4000).optional().nullable(),
    student_answer: z.string().max(8000),
    max_points: z.number().min(0).max(1000).default(10),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await checkAiAccess(context.supabase, context.userId, "ai_essay");
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured. Grade manually.");
    const gateway = createLovableAiGatewayProvider(key);
    const result = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system: "You are a strict but fair exam marker. Grade the student answer against the model answer (if provided) and the question. Return ONLY JSON: {\"score\":0-<max>,\"percent\":0-100,\"feedback\":\"...\",\"strengths\":[\"...\"],\"weaknesses\":[\"...\"]}. Be concise.",
      prompt: `Question: ${data.question}\nModel answer: ${data.sample_answer ?? "(not provided — grade on question intent)"}\nStudent answer: ${data.student_answer}\nMax points: ${data.max_points}`,

      temperature: 0,
      maxOutputTokens: 800,
    });
    const text = result.text;
    await billAiUsage(context.userId, "ai_essay", {
      model: "google/gemini-3-flash-preview",
      input_tokens: (result as any).usage?.inputTokens ?? 0,
      output_tokens: (result as any).usage?.outputTokens ?? 0,
    });
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
    const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
    if (start === -1 || end < start) throw new Error("Grader returned no result.");
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    const score = Math.max(0, Math.min(data.max_points, Number(parsed.score) || 0));
    const percent = Math.max(0, Math.min(100, Number(parsed.percent) || Math.round((score / (data.max_points || 1)) * 100)));
    return { score, percent, feedback: String(parsed.feedback ?? ""), strengths: parsed.strengths ?? [], weaknesses: parsed.weaknesses ?? [] };
  });

function defaultSettings() {
  return {
    strictness: "normal" as const,
    auto_detect_type: true,
    confidence_threshold: 80,
    default_question_type: "mcq" as const,
    ask_confirmation: true,
  };
}

function buildPrompt(text: string, settings: ParseSettings, hint?: string) {
  return `Admin settings:\n- strictness: ${settings.strictness}\n- auto_detect_type: ${settings.auto_detect_type}\n- confidence_threshold: ${settings.confidence_threshold}\n- default_question_type: ${settings.default_question_type}\n- format_hint: ${hint ?? "mixed educational text"}\n\nRaw content:\n${text}`;
}

function safeParseAiJson(raw: string) {
  const candidates = jsonCandidates(raw);
  for (const candidate of candidates) {
    try {
      return ParsedSchema.parse(JSON.parse(candidate));
    } catch {
      continue;
    }
  }
  throw new Error("No valid parser JSON was returned");
}

function jsonCandidates(raw: string) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  const candidates = [cleaned];
  const objStart = cleaned.indexOf("{");
  const objEnd = cleaned.lastIndexOf("}");
  if (objStart !== -1 && objEnd > objStart) candidates.push(cleaned.slice(objStart, objEnd + 1));
  const arrStart = cleaned.indexOf("[");
  const arrEnd = cleaned.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd > arrStart) candidates.push(`{"questions":${cleaned.slice(arrStart, arrEnd + 1)}}`);
  return [...new Set(candidates.map((c) => c.replace(/,\s*([}\]])/g, "$1")))];
}

function normalizeParsed(parsed: z.infer<typeof ParsedSchema>, raw: string, threshold: number, parsingTime: number, forcedReason?: string) {
  // Detect fractional 0.0–1.0 confidence scale (Gemini often returns fractions) and rescale.
  const rawConfs = (parsed.questions ?? []).map((q) => q.ai_confidence).filter((n) => typeof n === "number") as number[];
  const maxConf = rawConfs.length ? Math.max(...rawConfs) : 0;
  const scale = rawConfs.length && maxConf > 0 && maxConf <= 1 ? 100 : 1;

  const seen = new Map<string, number>();
  const questions = (parsed.questions ?? []).map((q, index) => {
    const type = q.type ?? "mcq";
    const text = cleanQuestionText(q.text) || "Unclear question";
    const options = normalizeOptions(type, q.options ?? [], q.sample_answer ?? undefined);
    const correctCount = options.filter((o) => o.is_correct).length;
    const optionIssue = type === "mcq" ? options.length < 2 : type === "tf" ? options.length !== 2 : false;
    const modelConf = typeof q.ai_confidence === "number" ? q.ai_confidence * scale : null;
    const structural = scoreQuestion(text, type, options, correctCount, optionIssue);
    // Trust structural score when model reports abnormally low but question is sound.
    let confidence = Math.round(modelConf ?? structural);
    if (modelConf !== null && confidence < 40 && !optionIssue && (correctCount > 0 || type === "essay") && text.length > 10) {
      confidence = Math.max(confidence, structural);
    }
    const signature = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 140);
    const duplicateOf = seen.get(signature);
    if (duplicateOf !== undefined && signature.length > 20) confidence = Math.max(0, confidence - 10);
    if (!seen.has(signature)) seen.set(signature, index + 1);
    const reasons = [
      forcedReason,
      q.review_reason,
      !q.text?.trim() ? "Missing question text" : null,
      optionIssue ? (type === "mcq" ? "Expected at least 2 options" : "Expected True/False options") : null,
      (type === "mcq" || type === "tf" || type === "short") && correctCount === 0 ? "Could not identify correct answer" : null,
      duplicateOf !== undefined && signature.length > 20 ? `Possible duplicate of Question ${duplicateOf}` : null,
    ].filter(Boolean).join("; ");
    return {
      ...q,
      type,
      text,
      options,
      ai_confidence: clamp(confidence),
      needs_review: !!q.needs_review || confidence < threshold || !!reasons,
      review_reason: reasons || null,
      difficulty: q.difficulty ?? "medium",
      tags: q.tags ?? [],
      raw_import_text: q.raw_import_text ?? raw.slice(0, 12000),
      sample_answer: q.sample_answer ?? (type === "essay" ? q.explanation ?? "" : undefined),
    };
  }).filter((q) => q.text.length > 3);
  const overall = questions.length ? Math.round(questions.reduce((sum, q) => sum + (q.ai_confidence ?? 0), 0) / questions.length) : 0;
  const modelOverall = typeof parsed.overall_confidence === "number"
    ? (parsed.overall_confidence <= 1 ? parsed.overall_confidence * 100 : parsed.overall_confidence)
    : overall;
  return {
    questions,
    needs_review_count: questions.filter((q) => q.needs_review).length,
    failed_count: questions.filter((q) => (q.ai_confidence ?? 0) < 30).length,
    overall_confidence: clamp(modelOverall),
    parsing_time_ms: parsed.parsing_time_ms ?? parsingTime,
  };
}

function cleanQuestionText(text: string) {
  return String(text ?? "")
    .replace(/^\s*(?:q(?:uestion)?\s*)?\d+[.)\-:]\s*/i, "")
    .replace(/\n?\s*(?:answer|ans|correct)\s*[:\-].*$/ims, "")
    .trim();
}

function normalizeOptions(type: string, options: { text: string; is_correct: boolean }[], sample?: string) {
  if (type === "essay") return [];
  if (type === "tf") {
    const trueHit = options.find((o) => /^true$/i.test(cleanOption(o.text)) || /^t$/i.test(cleanOption(o.text)));
    const falseHit = options.find((o) => /^false$/i.test(cleanOption(o.text)) || /^f$/i.test(cleanOption(o.text)));
    const trueCorrect = !!trueHit?.is_correct || options.some((o) => o.is_correct && /^true|t$/i.test(cleanOption(o.text)));
    const falseCorrect = !!falseHit?.is_correct || options.some((o) => o.is_correct && /^false|f$/i.test(cleanOption(o.text)));
    return [{ text: "True", is_correct: trueCorrect }, { text: "False", is_correct: falseCorrect }];
  }
  const out = options.map((o) => ({ text: cleanOption(o.text), is_correct: !!o.is_correct })).filter((o) => o.text);
  if (type === "short" && !out.length && sample?.trim()) return [{ text: sample.trim(), is_correct: true }];
  return out;
}

function cleanOption(text: string) {
  return String(text ?? "").replace(/^\s*(?:[A-Ha-h]|[ivx]+|\d+)[.)\-:]\s*/, "").replace(/^\s*[•*\-]\s*/, "").trim();
}

function scoreQuestion(text: string, type: string, options: { text: string; is_correct: boolean }[], correctCount: number, optionIssue: boolean) {
  let score = 50;
  if (text.length > 10) score += 15; else score -= 20;
  if (!optionIssue && (type === "mcq" || type === "tf" ? options.length > 0 : true)) score += 15; else if (optionIssue) score -= 10;
  if (correctCount > 0 || type === "essay") score += 15; else score -= 20;
  if (["mcq", "tf", "short", "essay"].includes(type)) score += 5;
  if (options.some((o) => o.text.length > 500)) score -= 5;
  return clamp(score);
}

function heuristicParse(raw: string, fallbackType: "mcq" | "tf" | "short" | "essay") {
  const blocks = raw.split(/\n(?=\s*(?:\d+|Q\d+)[.)\-:]\s+)/i).map((b) => b.trim()).filter(Boolean);
  const questions = blocks.map((block) => heuristicQuestion(block, fallbackType)).filter(Boolean) as z.infer<typeof ParsedQuestionSchema>[];
  return { questions, needs_review_count: questions.length, failed_count: 0, overall_confidence: questions.length ? 55 : 0 };
}

function heuristicQuestion(block: string, fallbackType: "mcq" | "tf" | "short" | "essay") {
  const lines = block.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const answerLine = lines.find((l) => /^(?:answer|ans|correct)\s*[:\-]/i.test(l));
  const answer = answerLine?.split(/[:\-]/).slice(1).join(":").trim();
  const optionLines = lines.filter((l) => /^\s*(?:[A-Ha-h][.)]|\([A-Ha-h]\)|[•*\-])\s+/.test(l));
  const textLines = lines.filter((l) => l !== answerLine && !optionLines.includes(l));
  const type = optionLines.length >= 2 ? "mcq" : /true\s*\/\s*false|\bt\s*\/\s*f\b/i.test(block) ? "tf" : answer ? "short" : fallbackType;
  const answerLetter = answer?.match(/[A-H]/i)?.[0]?.toUpperCase();
  const options = type === "tf"
    ? [{ text: "True", is_correct: /^true|t$/i.test(answer ?? "") }, { text: "False", is_correct: /^false|f$/i.test(answer ?? "") }]
    : type === "short"
      ? (answer ? [{ text: answer, is_correct: true }] : [])
      : optionLines.map((line, i) => ({ text: cleanOption(line), is_correct: answerLetter ? String.fromCharCode(65 + i) === answerLetter : /^\s*\*/.test(line) }));
  return {
    text: cleanQuestionText(textLines.join("\n")),
    type,
    options,
    difficulty: "medium" as const,
    tags: [],
    ai_confidence: answer || type === "essay" ? 62 : 45,
    needs_review: true,
    review_reason: "Fallback parser used; review before publishing",
    raw_import_text: block,
  };
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));
}

function isBillingOrRateError(msg: string) {
  return msg.includes("429") || msg.includes("402");
}

function mapAiError(msg: string) {
  if (msg.includes("429")) return new Error("AI rate limit reached. Please try again in a moment.");
  if (msg.includes("402")) return new Error("AI credits exhausted. Add credits to continue.");
  return new Error(msg);
}