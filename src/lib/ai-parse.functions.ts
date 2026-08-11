import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiChat, isAiConfigured } from "./ai-provider.server";
import { logAiUsage, checkAiAccess, billAiUsage, reserveAiCredit } from "./authz.server";

/**
 * All heavy parser/generator/marker work goes through the merged AI router
 * (OpenRouter first, Lovable AI as fallback) so paid-for features run on the
 * cheap provider while platform-critical checks stay on Lovable AI.
 */
async function heavyText(args: { system: string; prompt: string; temperature?: number; maxOutputTokens?: number; json?: boolean }) {
  const r = await aiChat("heavy", [
    { role: "system", content: args.system },
    { role: "user", content: args.prompt },
  ], { temperature: args.temperature ?? 0, max_tokens: args.maxOutputTokens, json: args.json });
  return { text: r.text, provider: r.provider, model: r.model, usage: { inputTokens: r.input_tokens, outputTokens: r.output_tokens }, fellBack: r.fellBack };
}


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
  points: z.coerce.number().optional().nullable(),
  generated: z.boolean().optional(),
  change_note: z.string().max(200).optional().nullable(),
  id: z.coerce.number().optional(),
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
  /** Opt-in: let AI repair questions the offline engine flagged. Burns credit. */
  ai_oversight: z.boolean().default(true),
  /** Opt-in: let AI *rewrite/complete* broken questions and supply missing
   * answers it can derive. Reported back per question so the creator sees it. */
  ai_generative: z.boolean().default(false),
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

    if (!isAiConfigured()) {
      if (!offline.questions.length) throw new Error("AI is not configured yet and the offline parser found no questions.");
      return { ...normalizeParsed(offline as any, data.text, settings.confidence_threshold, Date.now() - started, "Parsed offline — review before publishing."), offline: true };
    }

    // Nothing offline? Fall back to a full AI extraction.
    if (!offline.questions.length) {
      const prompt = buildPrompt(data.text, settings, data.format_hint);
      try {
        const full = await heavyText({ system: SYSTEM_PROMPT, prompt, temperature: 0, maxOutputTokens: 16000 });
        await billAiUsage(context.userId, "ai_parser", {
          model: full.model, provider: full.provider,
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

    // Oversight is opt-in — when it's off, the offline result is the result.
    if (!data.ai_oversight) {
      return {
        ...normalizeParsed(offline as any, data.text, settings.confidence_threshold, Date.now() - started),
        offline: true,
        ai_reviewed: 0,
        ai_fixed: 0,
      };
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
        ai_fixed: 0,
      };
    }

    // Batch in small groups so one long response can never truncate the whole run.
    const BATCH = 12;
    const batches: { q: any; i: number }[][] = [];
    for (let i = 0; i < weak.length && batches.length * BATCH < 120; i += BATCH) {
      batches.push(weak.slice(i, i + BATCH));
    }

    const system = data.ai_generative
      ? `You are a question-repair and completion engine for an exam app. Each item was extracted by a rule-based parser that was unsure about it.
For every item:
- Rebuild "text" as a clean, self-contained question from "raw" (keep the original wording and any passage).
- Build the full option list for mcq (2-6 options) and mark exactly ONE correct option.
- If the source does not state the answer, you MAY determine the correct answer yourself from subject knowledge, and set "generated":true.
- If you had to write or complete options or an answer, set "generated":true and explain what you changed in "change_note" (max 90 chars).
- ALWAYS write "explanation": 1-3 sentences teaching why the answer is right.
- type: mcq | tf | short | essay. tf → exactly True and False options. short → the accepted answer as the single correct option. essay → options: [] and a "sample_answer".
- Only set needs_review true if the item is genuinely unusable.`
      : `You are a question-repair engine for an exam app. Each item was extracted by a rule-based parser that was unsure about it.
For every item:
- Rebuild "text" as a clean, self-contained question from "raw" (keep the original wording and any passage).
- Fix the option list and mark the correct option ONLY when "raw" states or clearly implies it. NEVER invent an answer that is not in the source — if it is absent, keep needs_review true and say so in review_reason.
- ALWAYS write "explanation": 1-3 sentences teaching why the answer is right.
- type: mcq | tf | short | essay. tf → exactly True and False options. short → the accepted answer as the single correct option. essay → options: [] and a "sample_answer".`;

    const schemaLine = `Return ONLY minified JSON, no markdown: {"questions":[{"id":0,"text":"...","type":"mcq","options":[{"text":"...","is_correct":true}],"explanation":"...","sample_answer":"","difficulty":"medium","ai_confidence":0,"needs_review":false,"review_reason":"","generated":false,"change_note":""}]}`;

    const byId = new Map<number, any>();
    let reviewed = 0;
    let batchFailures = 0;

    for (const batch of batches) {
      const payload = batch.map(({ q, i }) => ({
        id: i,
        text: q.text.slice(0, 1500),
        type: q.type,
        options: q.options,
        issue: q.review_reason,
        raw: (q.raw_import_text ?? "").slice(0, 1800),
      }));
      try {
        const review = await heavyText({
          system: `${system}\n${schemaLine}`,
          prompt: JSON.stringify({ strictness: settings.strictness, items: payload }),
          temperature: 0,
          maxOutputTokens: 6000,
        });
        await billAiUsage(context.userId, data.ai_generative ? "ai_review" : "ai_parser", {
          model: review.model, provider: review.provider,
          input_tokens: (review as any).usage?.inputTokens ?? 0,
          output_tokens: (review as any).usage?.outputTokens ?? 0,
          meta: { mode: data.ai_generative ? "generative-review" : "review", reviewed: payload.length },
        });
        const repaired = safeParseAiJson(review.text);
        (repaired.questions ?? []).forEach((r: any, idx: number) => {
          const id = typeof r.id === "number" ? r.id : payload[idx]?.id;
          if (typeof id === "number" && String(r.text ?? "").trim().length > 3) byId.set(id, r);
        });
        reviewed += payload.length;
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (isBillingOrRateError(msg)) throw mapAiError(msg);
        batchFailures++;
      }
    }

    if (!byId.size) {
      return {
        ...normalizeParsed(offline as any, data.text, settings.confidence_threshold, Date.now() - started,
          "AI oversight could not be applied — offline results shown, please check each question."),
        offline: true,
        ai_reviewed: 0,
        ai_fixed: 0,
      };
    }

    let fixedCount = 0;
    const merged = offline.questions.map((q, i) => {
      const fix = byId.get(i);
      if (!fix) return q;
      const rawOptions = Array.isArray(fix.options) ? fix.options.filter((o: any) => String(o?.text ?? "").trim()) : [];
      const options = rawOptions.length ? rawOptions : q.options;
      const hasCorrect = options.some((o: any) => o.is_correct);
      const wasGenerated = fix.generated === true;
      // In non-generative mode, never let AI assert an answer the source lacks.
      const keepOptions = !data.ai_generative && wasGenerated ? q.options : options;
      const changed = fix.text?.trim() !== q.text || rawOptions.length > 0 || !!fix.explanation;
      if (changed) fixedCount++;
      const notes = [
        wasGenerated && data.ai_generative ? `AI completed this question${fix.change_note ? `: ${fix.change_note}` : ""}` : null,
        fix.needs_review ? (fix.review_reason ?? q.review_reason) : null,
      ].filter(Boolean).join("; ") || null;
      return {
        ...q,
        text: fix.text?.trim() ? fix.text : q.text,
        type: fix.type ?? q.type,
        options: keepOptions,
        explanation: fix.explanation ?? q.explanation,
        sample_answer: fix.sample_answer || q.sample_answer,
        difficulty: fix.difficulty ?? q.difficulty,
        ai_generated: wasGenerated && data.ai_generative,
        needs_review: fix.needs_review === true || !keepOptions.some((o: any) => o.is_correct) && q.type === "mcq"
          ? true
          : wasGenerated && data.ai_generative,
        review_reason: notes,
        ai_confidence: typeof fix.ai_confidence === "number" && fix.ai_confidence > 0
          ? (fix.ai_confidence <= 1 ? fix.ai_confidence * 100 : fix.ai_confidence)
          : Math.max(q.ai_confidence, hasCorrect ? 80 : q.ai_confidence),
      };
    });

    return {
      ...normalizeParsed({ questions: merged } as any, data.text, settings.confidence_threshold, Date.now() - started,
        batchFailures ? "Some batches could not be reviewed by AI — check the flagged questions." : undefined),
      offline: false,
      ai_reviewed: reviewed,
      ai_fixed: fixedCount,
      ai_generative: data.ai_generative,
    };
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
    const { getEffectivePerms } = await import("./authz.server");
    const eff = await getEffectivePerms(context.supabase, context.userId);
    void db;
    const limit = eff.offline_parse_limit && eff.offline_parse_limit > 0 ? eff.offline_parse_limit : undefined;

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
    if (!isAiConfigured()) throw new Error("AI is not configured. Grade manually.");
    const reservation = await reserveAiCredit(context.userId, "ai_essay");
    if (!reservation.ok) throw new Error("You have no AI credit left. Top up before using AI marking.");
    const result = await heavyText({
      system: "You are a strict but fair exam marker. Grade the student answer against the model answer (if provided) and the question. Return ONLY JSON: {\"score\":0-<max>,\"percent\":0-100,\"feedback\":\"...\",\"strengths\":[\"...\"],\"weaknesses\":[\"...\"]}. Be concise.",
      prompt: `Question: ${data.question}\nModel answer: ${data.sample_answer ?? "(not provided — grade on question intent)"}\nStudent answer: ${data.student_answer}\nMax points: ${data.max_points}`,

      temperature: 0,
      maxOutputTokens: 800,
    });
    const text = result.text;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await logAiUsage(supabaseAdmin as any, context.userId, {
      model: result.model, provider: result.provider,
      input_tokens: (result as any).usage?.inputTokens ?? 0,
      output_tokens: (result as any).usage?.outputTokens ?? 0,
      credits_cost: reservation.cost,
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

/* ------------------------- AI question generator -------------------------- */

const GenerateInput = z.object({
  topic: z.string().trim().min(3).max(300),
  source: z.string().max(20000).optional(),
  count: z.number().int().min(1).max(40).default(10),
  type: z.enum(["mcq", "tf", "short", "essay", "mixed"]).default("mcq"),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]).default("medium"),
  subject: z.string().max(80).optional(),
  exam: z.string().max(80).optional(),
  with_explanations: z.boolean().default(true),
});

/**
 * In-app question generator. The model writes questions in the app's plain
 * import format, then the deterministic engine parses them exactly like a
 * pasted document — so generated and imported questions behave identically.
 */
export const generateQuestionsAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GenerateInput.parse(d))
  .handler(async ({ data, context }) => {
    await checkAiAccess(context.supabase, context.userId, "ai_generate");
    if (!isAiConfigured()) throw new Error("AI is not configured yet.");
    const reservation = await reserveAiCredit(context.userId, "ai_generate");
    if (!reservation.ok) throw new Error("You have no AI credit left. Top up before generating questions.");
    const started = Date.now();

    const system = `You write exam questions for a Nigerian study app. Output PLAIN TEXT in exactly this import format, nothing else — no markdown, no preamble, no numbering gaps:

1. <question text>
A) <option>
B) <option>
C) <option>
D) <option>
Answer: <letter>
Explanation: <1-2 sentences on why it is right>

Rules:
- True/False items: write the statement, then "A) True" and "B) False".
- Short answer items: write the question then "Answer: <the accepted answer>".
- Essay/theory items: write the prompt, then "Marking scheme: <what a full-mark answer must contain>".
- Never repeat a question. Never leave an Answer line out. Keep each option on its own line.
- Group items under headers like "Section A: <topic>" when you cover more than one topic.`;

    const prompt = [
      `Write ${data.count} ${data.type === "mixed" ? "mixed-type" : data.type} question(s).`,
      `Topic: ${data.topic}`,
      data.subject ? `Subject: ${data.subject}` : null,
      data.exam ? `Exam style: ${data.exam}` : null,
      `Difficulty: ${data.difficulty}`,
      data.with_explanations ? "Include an Explanation line for every question." : "Explanations optional.",
      data.source ? `Base the questions ONLY on this source material:\n${data.source.slice(0, 16000)}` : null,
    ].filter(Boolean).join("\n");

    let text = "";
    try {
      const res = await heavyText({ system, prompt, temperature: 0.4, maxOutputTokens: 8000 });
      text = res.text ?? "";
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await logAiUsage(supabaseAdmin as any, context.userId, {
        model: res.model, provider: res.provider,
        input_tokens: (res as any).usage?.inputTokens ?? 0,
        output_tokens: (res as any).usage?.outputTokens ?? 0,
        credits_cost: reservation.cost,
        meta: { count: data.count, topic: data.topic.slice(0, 80), provider: res.provider },
      });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (isBillingOrRateError(msg)) throw mapAiError(msg);
      throw new Error("The generator could not produce questions. Try a narrower topic or fewer questions.");
    }

    if (!text.trim()) throw new Error("The generator returned nothing. Try again.");

    const { advancedParse } = await import("./parse-engine");
    const engine = advancedParse(text, { defaultType: data.type === "mixed" ? "mcq" : data.type });
    const normalized = normalizeParsed(engine as any, text, 70, Date.now() - started);
    return {
      ...normalized,
      questions: normalized.questions.map((q: any) => ({ ...q, ai_generated: true })),
      generated_text: text,
      requested: data.count,
    };
  });
