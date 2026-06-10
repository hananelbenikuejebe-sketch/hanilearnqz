import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEFAULTS = {
  app_name: "HaniLearn-QZ",
  categories: ["JAMB", "WAEC", "NECO", "GCE", "Post-UTME", "Custom"],
  subject_tags: ["Mathematics", "Physics", "Chemistry", "Biology", "English Language", "Literature", "Government", "Economics", "History", "Geography", "CRS", "IRS", "Islamic Studies"],
  parsing_settings: {
    strictness: "normal",
    auto_detect_type: true,
    confidence_threshold: 80,
    default_question_type: "mcq",
    ask_confirmation: true,
  },
};

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw error;
  if (!data) throw new Error("Forbidden: admin only");
}

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("app_settings").select("*");
    const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
    return {
      app_name: map.app_name ?? DEFAULTS.app_name,
      categories: map.categories ?? DEFAULTS.categories,
      subject_tags: map.subject_tags ?? DEFAULTS.subject_tags,
      parsing_settings: map.parsing_settings ?? DEFAULTS.parsing_settings,
    };
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      app_name: z.string().min(1).max(60).optional(),
      categories: z.array(z.string().min(1).max(50)).max(50).optional(),
      subject_tags: z.array(z.string().min(1).max(50)).max(100).optional(),
      parsing_settings: z.object({
        strictness: z.enum(["loose", "normal", "strict"]),
        auto_detect_type: z.boolean(),
        confidence_threshold: z.number().int().min(30).max(95),
        default_question_type: z.enum(["mcq", "tf", "short", "essay"]),
        ask_confirmation: z.boolean(),
      }).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const entries = Object.entries(data).filter(([, v]) => v !== undefined);
    for (const [key, value] of entries) {
      await context.supabase.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() });
    }
    return { ok: true };
  });
