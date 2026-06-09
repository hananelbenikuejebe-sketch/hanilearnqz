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
  })),
});

const SYSTEM_PROMPT = `You convert pasted educational text into structured quiz questions.

Recognize ALL of these formats:
- Multiple choice: "1. What is X? A) opt1 B) opt2 C) opt3 D) opt4  Answer: B"
- True/False: "Statement. (True/False)  Answer: True"
- Short answer / fill-in: "Q: What year ...? Answer: 1960"
- Essay/theory: "Discuss the causes of ..." (no options, type='essay')
- Comprehension passages: include the passage in the question text for each follow-up question
- Many options (5+, 6+, "All of the above", "None of the above") — preserve all options

For each question return JSON: { text, type, options[], explanation?, difficulty? }
- type 'mcq' for multiple choice (2+ options, one or more is_correct=true)
- type 'tf' for True/False (exactly 2 options: True/False with one is_correct)
- type 'short' for short answer (options: a single is_correct=true option containing the answer text)
- type 'essay' for open-ended (options: [])
- Detect answer keys like "Answer: B", "Correct: C", "Ans: True", marked option, or end-of-list answer keys.
- If unsure, default type 'mcq' and mark no option correct (admin will fix).
- Trim leading "A)", "1.", etc. from option text.
- Preserve passages verbatim in 'text'.`;

export const parseQuestionsFromText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ text: z.string().min(10).max(60000) }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY missing");
    const gateway = createLovableAiGatewayProvider(key);
    try {
      const result = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system: SYSTEM_PROMPT,
        prompt: `Parse this into quiz questions:\n\n${data.text}`,
        experimental_output: Output.object({ schema: ParsedSchema }),
      });
      const parsed = (result as any).experimental_output ?? (result as any).output;
      return parsed as z.infer<typeof ParsedSchema>;
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("429")) throw new Error("AI rate limit reached. Please try again in a moment.");
      if (msg.includes("402")) throw new Error("AI credits exhausted. Add credits in your workspace.");
      throw new Error(`AI parse failed: ${msg}`);
    }
  });
