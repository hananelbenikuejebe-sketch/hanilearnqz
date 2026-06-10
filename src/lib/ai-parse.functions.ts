import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const ParsedSchema = z.object({
  questions: z.array(z.object({
    text: z.string(),
    type: z.enum(["mcq", "tf", "short", "essay"]),
    options: z.array(z.object({ text: z.string(), is_correct: z.boolean() })),
    explanation: z.string().optional(),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    tags: z.array(z.string()).optional(),
    ai_confidence: z.number().min(0).max(100).optional(),
    needs_review: z.boolean().optional(),
    review_reason: z.string().optional(),
    raw_import_text: z.string().optional(),
    sample_answer: z.string().optional(),
  })),
  needs_review_count: z.number().optional(),
  failed_count: z.number().optional(),
  overall_confidence: z.number().min(0).max(100).optional(),
  parsing_time_ms: z.number().optional(),
});

const SYSTEM_PROMPT = `You convert pasted educational text into structured quiz questions.

Recognize ALL of these formats:
- Multiple choice: "1. What is X? A) opt1 B) opt2 C) opt3 D) opt4  Answer: B"
- True/False: "Statement. (True/False)  Answer: True"
- Short answer / fill-in: "Q: What year ...? Answer: 1960"
- Essay/theory: "Discuss the causes of ..." (no options, type='essay')
- Comprehension passages: include the passage in the question text for each follow-up question
- Many options (5+, 6+, "All of the above", "None of the above") — preserve all options

For each question return JSON: { text, type, options[], explanation?, difficulty?, tags?, ai_confidence, needs_review, review_reason?, raw_import_text?, sample_answer? }
- type 'mcq' for multiple choice (2+ options, one or more is_correct=true)
- type 'tf' for True/False (exactly 2 options: True/False with one is_correct)
- type 'short' for short answer (options: a single is_correct=true option containing the answer text)
- type 'essay' for open-ended (options: [])
- Detect answer keys like "Answer: B", "Correct: C", "Ans: True", marked option, or end-of-list answer keys.
- If unsure, default type according to the user's settings and mark no option correct (admin will fix).
- Trim leading "A)", "1.", etc. from option text.
- Preserve passages verbatim in 'text'.

Confidence scoring:
- Start at 50, add: clear question +15, options extracted +15, correct answer marked +15, clear type +5.
- Subtract: missing text -20, wrong option count -10, unclear answer -20, duplicate -10, very long/unclear options -5, formatting issue -5.
- 95-100 = looks good; 80-94 = review recommended; 60-79 = needs review; 30-59 = major issues; 0-29 = can't parse.
- Do not guess correct answers. If no clear answer marker, set needs_review=true and review_reason='Could not identify correct answer'.
- Detect likely duplicate questions and flag them with needs_review=true.
- Return overall_confidence as the average question confidence, needs_review_count, failed_count, and parsing_time_ms if known.`;

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
    if (!key) throw new Error("LOVABLE_API_KEY missing");
    const gateway = createLovableAiGatewayProvider(key);
    const settings = data.settings ?? {
      strictness: "normal" as const,
      auto_detect_type: true,
      confidence_threshold: 80,
      default_question_type: "mcq" as const,
      ask_confirmation: true,
    };
    try {
      const result = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system: SYSTEM_PROMPT,
        prompt: `Parse this into quiz questions.

Admin settings:
- strictness: ${settings.strictness}
- auto_detect_type: ${settings.auto_detect_type}
- confidence_threshold: ${settings.confidence_threshold}
- default_question_type: ${settings.default_question_type}
- format_hint: ${data.format_hint ?? "custom"}

Raw content:
${data.text}`,
        experimental_output: Output.object({ schema: ParsedSchema }),
      });
      const parsed = ((result as any).experimental_output ?? (result as any).output) as z.infer<typeof ParsedSchema>;
      const normalized = normalizeParsed(parsed, data.text, settings.confidence_threshold, Date.now() - started);
      return normalized;
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("429")) throw new Error("AI rate limit reached. Please try again in a moment.");
      if (msg.includes("402")) throw new Error("AI credits exhausted. Add credits in your workspace.");
      throw new Error(`AI parse failed: ${msg}`);
    }
  });

function normalizeParsed(parsed: z.infer<typeof ParsedSchema>, raw: string, threshold: number, parsingTime: number) {
  const seen = new Map<string, number>();
  const questions = (parsed.questions ?? []).map((q, index) => {
    const text = q.text?.trim() || "Unclear question";
    const options = (q.options ?? []).filter((o) => o.text?.trim()).map((o) => ({ text: o.text.trim(), is_correct: !!o.is_correct }));
    const correctCount = options.filter((o) => o.is_correct).length;
    const expectedOptionIssue = q.type === "mcq" ? options.length !== 4 : q.type === "tf" ? options.length !== 2 : false;
    let confidence = Math.round(q.ai_confidence ?? scoreQuestion(text, q.type, options, correctCount, expectedOptionIssue));
    const signature = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120);
    const duplicateOf = seen.get(signature);
    if (duplicateOf !== undefined && signature.length > 20) confidence = Math.max(0, confidence - 10);
    if (!seen.has(signature)) seen.set(signature, index + 1);
    const reasons = [
      q.review_reason,
      !q.text?.trim() ? "Missing question text" : null,
      expectedOptionIssue ? q.type === "mcq" ? "Expected exactly 4 options" : "Expected True/False options" : null,
      (q.type === "mcq" || q.type === "tf" || q.type === "short") && correctCount === 0 ? "Could not identify correct answer" : null,
      duplicateOf !== undefined && signature.length > 20 ? `Possible duplicate of Question ${duplicateOf}` : null,
    ].filter(Boolean).join("; ");
    return {
      ...q,
      text,
      options,
      ai_confidence: Math.max(0, Math.min(100, confidence)),
      needs_review: !!q.needs_review || confidence < threshold || !!reasons,
      review_reason: reasons || null,
      difficulty: q.difficulty ?? "medium",
      tags: q.tags ?? [],
      raw_import_text: q.raw_import_text ?? raw.slice(0, 12000),
      sample_answer: q.sample_answer ?? (q.type === "essay" ? q.explanation ?? "" : undefined),
    };
  });
  const overall = questions.length
    ? Math.round(questions.reduce((sum, q) => sum + (q.ai_confidence ?? 0), 0) / questions.length)
    : 0;
  return {
    questions,
    needs_review_count: questions.filter((q) => q.needs_review).length,
    failed_count: questions.filter((q) => (q.ai_confidence ?? 0) < 30).length,
    overall_confidence: parsed.overall_confidence ?? overall,
    parsing_time_ms: parsed.parsing_time_ms ?? parsingTime,
  };
}

function scoreQuestion(text: string, type: string, options: { text: string; is_correct: boolean }[], correctCount: number, optionIssue: boolean) {
  let score = 50;
  if (text.length > 10) score += 15; else score -= 20;
  if (!optionIssue && (type === "mcq" || type === "tf" ? options.length > 0 : true)) score += 15; else if (optionIssue) score -= 10;
  if (correctCount > 0 || type === "essay") score += 15; else score -= 20;
  if (["mcq", "tf", "short", "essay"].includes(type)) score += 5;
  if (options.some((o) => o.text.length > 500)) score -= 5;
  return Math.max(0, Math.min(100, score));
}
