import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const ParsedQuestionSchema = z.object({
  text: z.string().default(""),
  type: z.enum(["mcq", "tf", "short", "essay"]).catch("mcq"),
  options: z.array(z.object({ text: z.string().default(""), is_correct: z.boolean().default(false) })).default([]),
  explanation: z.string().optional().nullable(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional().catch("medium"),
  tags: z.array(z.string()).optional().default([]),
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

Return this exact JSON object, with no markdown:
{"questions":[{"text":"...","type":"mcq|tf|short|essay","options":[{"text":"...","is_correct":true}],"explanation":"...","difficulty":"easy|medium|hard","tags":["..."],"ai_confidence":0,"needs_review":false,"review_reason":"","raw_import_text":"...","sample_answer":"..."}],"needs_review_count":0,"failed_count":0,"overall_confidence":0}`;

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

export const parseQuestionsFromText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ParseInput.parse(d))
  .handler(async ({ data }) => {
    const started = Date.now();
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured yet.");
    const gateway = createLovableAiGatewayProvider(key);
    const settings = data.settings ?? defaultSettings();
    const prompt = buildPrompt(data.text, settings, data.format_hint);

    try {
      const first = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system: SYSTEM_PROMPT,
        prompt,
        temperature: 0,
        maxOutputTokens: 16000,
      });
      const parsed = safeParseAiJson(first.text);
      return normalizeParsed(parsed, data.text, settings.confidence_threshold, Date.now() - started);
    } catch (firstError: any) {
      const firstMsg = String(firstError?.message ?? firstError);
      if (isBillingOrRateError(firstMsg)) throw mapAiError(firstMsg);
      try {
        const repaired = await generateText({
          model: gateway("google/gemini-3-flash-preview"),
          system: "Repair the following quiz extraction into valid JSON matching the requested schema. Return only JSON. If extraction is impossible, return {\"questions\":[],\"needs_review_count\":0,\"failed_count\":0,\"overall_confidence\":0}.",
          prompt: `${prompt}\n\nPrevious parser error: ${firstMsg}`,
          temperature: 0,
          maxOutputTokens: 16000,
        });
        const parsed = safeParseAiJson(repaired.text);
        return normalizeParsed(parsed, data.text, settings.confidence_threshold, Date.now() - started);
      } catch (secondError: any) {
        const msg = String(secondError?.message ?? firstMsg);
        if (isBillingOrRateError(msg)) throw mapAiError(msg);
        const heuristic = heuristicParse(data.text, settings.default_question_type);
        if (heuristic.questions.length) {
          return normalizeParsed(heuristic, data.text, settings.confidence_threshold, Date.now() - started, "Recovered without full AI structure; please review imported questions.");
        }
        throw new Error("AI parser could not read this text. Try a smaller paste or add clearer numbering/answer labels.");
      }
    }
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

function buildPrompt(text: string, settings: ReturnType<typeof defaultSettings>, hint?: string) {
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
  const seen = new Map<string, number>();
  const questions = (parsed.questions ?? []).map((q, index) => {
    const type = q.type ?? "mcq";
    const text = cleanQuestionText(q.text) || "Unclear question";
    let options = normalizeOptions(type, q.options ?? [], q.sample_answer ?? undefined);
    const correctCount = options.filter((o) => o.is_correct).length;
    const optionIssue = type === "mcq" ? options.length < 2 : type === "tf" ? options.length !== 2 : false;
    let confidence = Math.round(q.ai_confidence ?? scoreQuestion(text, type, options, correctCount, optionIssue));
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
  return {
    questions,
    needs_review_count: questions.filter((q) => q.needs_review).length,
    failed_count: questions.filter((q) => (q.ai_confidence ?? 0) < 30).length,
    overall_confidence: clamp(parsed.overall_confidence ?? overall),
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