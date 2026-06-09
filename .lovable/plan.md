## HaniLearn-QZ — Build Plan

A PWA-installable quiz platform: one admin creates quizzes (with AI text parsing), students sign up with email/password and take quizzes. Built on TanStack Start + Lovable Cloud (Supabase) + Lovable AI Gateway.

### Tech & defaults

- TanStack Start (current template), Tailwind, shadcn/ui
- Lovable Cloud (Supabase) for auth, DB, storage
- Lovable AI Gateway (`google/gemini-3-flash-preview`) for question parsing
- PWA: installable only (manifest + icons), no offline sync in v1
- Roles via `user_roles` table + `has_role()` security-definer (admin/student); first signup auto-promoted to admin if no admin exists, or you bootstrap via SQL

### Brand

Navy `#1A2540`, gold `#D4A574`, light gray surfaces, Inter font, rounded-md, mobile-first.

---

### Data model (Lovable Cloud)

```text
profiles(id pk → auth.users, full_name, email, created_at)
user_roles(user_id, role app_role enum: 'admin'|'student', unique(user_id, role))
quizzes(id, title, description, category, duration_min, difficulty,
        instructions, is_published, randomize_questions, shuffle_options,
        show_answers_after, show_explanations, enforce_time, allow_retakes,
        max_attempts, start_at, end_at, created_by, created_at, updated_at)
questions(id, quiz_id, position, type 'mcq'|'tf'|'short'|'essay',
          text, explanation, difficulty, tags text[])
options(id, question_id, position, text, is_correct)
attempts(id, student_id, quiz_id, score_pct, correct_count, total,
         time_taken_sec, answers jsonb, started_at, submitted_at)
```

RLS:

- admins: full access to quizzes/questions/options/attempts/profiles
- students: read published quizzes + their own attempts; insert own attempts
- profiles auto-created via trigger on signup
- GRANTs to authenticated + service_role per public-schema rules

### Routes

Public:

- `/auth` — sign in / sign up (email+password; Google deferred)

Authenticated student (`/_authenticated/...`):

- `/` — available quizzes grid, search + category filter
- `/quiz/$quizId` — quiz player (timer, progress, keyboard 1-4, prev/next, question navigator sidebar, submit)
- `/quiz/$quizId/result/$attemptId` — score, breakdown, explanations, retake

Authenticated admin (`/_authenticated/admin/...`, gated by `has_role('admin')`):

- `/admin` — dashboard (counts, recent attempts)
- `/admin/quizzes` — table list (filter/sort, edit/delete/duplicate/results/analytics actions)
- `/admin/quizzes/new` — create quiz form
- `/admin/quizzes/$id/edit` — quiz settings + question editor (reorder, duplicate, type switch, MCQ options + correct, explanation, tags, difficulty) + AI import panel + preview tab
- `/admin/quizzes/$id/results` — attempts table, per-attempt detail, CSV export, stats (avg, pass rate, most-missed)
- `/admin/students` — list, manual add, CSV bulk import, progress
- `/admin/settings` — app name, default quiz settings, categories/tags, retake policy; "Tutor features coming soon" placeholder

### AI question import (Option B: paste raw text)

- Textarea in quiz editor → server fn `parseQuestionsFromText`
- Uses `generateText` + `Output.object` with Zod schema returning `{ questions: [{ text, type, options: [{text,is_correct}], explanation?, difficulty? }] }`
- Preview list with edit/remove per question → "Add to quiz" inserts into questions/options tables in order
- Validation: flag MCQs without exactly clearoptions or no correct answer
- Should be able to understand passages, theories, essays, true/false, and many options. 
- For simplicity, put in a format the tutor must follow for the ai to understand

### Server functions / routes

- `lib/quizzes.functions.ts` — list, get, create, update, delete, duplicate (admin); listPublished, getForPlayer (strips is_correct) for students
- `lib/questions.functions.ts` — CRUD, reorder, bulk insert from parsed AI
- `lib/attempts.functions.ts` — start, submit (server-side scoring using truth from DB), getMyAttempts, getAttemptsForQuiz (admin)
- `lib/students.functions.ts` — list, bulkImport CSV (admin uses `supabaseAdmin` to create auth users + assign student role)
- `lib/ai-parse.functions.ts` — paste-text parser via Lovable AI Gateway
- `lib/settings.functions.ts` — app settings (key/value table)

All protected fns use `requireSupabaseAuth`; admin fns additionally check `has_role(uid,'admin')` server-side.

### PWA (installable only)

- `public/manifest.webmanifest` (name, short_name, theme `#1A2540`, background `#fcfbf8`, standalone)
- Generated 192/512 icons + apple-touch-icon
- `<link rel="manifest">` and theme-color in `__root.tsx`
- No service worker
- Push notifications 

### UI components

- Admin layout: collapsible sidebar (shadcn sidebar) + header
- Student layout: minimal top bar; quiz player is full-screen
- Reusable: QuestionEditor, OptionRow, QuizPreview, AIParsePanel, AttemptsTable, StatsCards
- Dark Mode

### Out of scope for v1 (stubbed/grayed)

- .docx/.pdf/Google Docs/Notion uploads (paste text only)
- Offline quiz taking + sync
- Tutor multi-tenant, PIN access, PDF export, swipe gestures, API access

### Build order

1. Enable Lovable Cloud; migration for schema, enum, roles, RLS, GRANTs, trigger, `has_role()`
2. Auth page + `_authenticated` gate + admin role gate
3. Admin shell + quizzes CRUD + question editor
4. AI paste-parse panel
5. Student quiz list + player + scoring + results
6. Attempts/analytics + student management + settings
7. PWA manifest + icons + brand polish