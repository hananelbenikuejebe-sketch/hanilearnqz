# HaniLearn-QZ — 3-batch delivery plan

## Batch 1 (today)

Bugs
- Withdrawal request: return a WhatsApp link rendered as a real link (no blocked pop-up), surface the true error text, and stop failing when bank details are saved in the same action.
- AI credit metering: credits now actually reduce. Admin-granted `ai_enabled` means "allowed to use AI", not "free AI". Every non-admin AI call is priced and debited until the balance hits zero.
- Free monthly AI credit (default ₦10) auto-granted once per calendar month, admin-editable.

Item 4 — manual payment with receipt verification
- Bank details shown in-app for every purchase (creator access, AI credit, quiz).
- Receipt upload into a private store, plus claimed amount / date / sender / bank reference.
- Deterministic verification algorithm first (amount, date window, duplicate reference, name similarity, file sanity). AI vision check only when the algorithm is inconclusive, so credit use stays minimal.
- Auto-grant on pass (user sees instant access); every grant queued for admin confirmation.
- Admin decline reverses everything: access, credits, quiz purchase, affiliate commission, ledger entries. User is told to contact support; support number always visible.
- All thresholds (laxity, min confidence, receipt age, AI on/off, auto-approve) admin-editable.

Item 5 — parsing strategy
- New offline engine: numbering styles, inline/tabular options, tick marks (✓ ✔ ✅ ☑), `Answer:` / `Explanation:` / `Reason:` / `Marking scheme:` labels, `Passage:` shared across questions, section headers → subsection, `[5 marks]` → points, fill-in-the-blank, theory detection.
- "AI parse" now runs the offline engine first and only sends low-confidence questions to AI for repair/explanations — the bulk of credit savings.
- Free tier settings: questions per quiz, quizzes per month, offline parse limit, AI parse allowed or not.

## Batch 2

- In-app AI question generator (generate → offline parse → review), priced per generation and locked to paid creator access + credits.
- Advanced AI usage tracker UI (per user, per feature, cost) and mass enable/disable.
- UI finetuning: dark toggle on every page, password show/hide, badges and achievement levels, richer profile pages (bio, picture, pro/creator/student badges, quizzes created/joined).
- Free tier enforcement UI: locked features stay visible with an upgrade prompt.

## Batch 3

- Exam rebuild: one umbrella quiz with internal sections (shared settings, per-section subject/difficulty), single continuous player with section headers instead of separate quizzes.
- Exam editor for sections, reordering, preview, publish.
- Migration of existing exams/quiz bundles into the new sectioned format.
