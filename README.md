# HaniLearn-QZ

HaniLearn-QZ - Admin Quiz Creation & Management Platform



OVERVIEW:

Build a one-to-many quiz management platform where admin (you) creates quizzes for students. Modern, clean UI. PWA web app (installable, works offline). AI-powered question import. Future-proof for multiple tutors.



---



CORE ARCHITECTURE:



Two main user roles:

1. ADMIN (you): Create, manage, publish quizzes

2. STUDENTS: Take quizzes, view results



Admin dashboard = full control

Student interface = simple, clean, quiz-focused



---



ADMIN DASHBOARD - QUIZ CREATION



1. CREATE QUIZ SECTION

   - New quiz form with fields:

     * Quiz title

     * Description

     * Category (dropdown: JAMB, WAEC, NECO, GCE, Post-UTME, Custom)

     * Duration (minutes)

     * Difficulty level (Easy, Medium, Hard)

     * Instructions (optional)

     * Is published? (toggle)

   

2. AI QUESTION IMPORT (THE MAGIC)

   Option A: Upload document

   - Accept: .docx, .txt, .pdf, Google Docs link, Notion link

   - Click "Upload & Parse"

   - AI reads document automatically:

     * Identifies questions

     * Extracts multiple choice options (A, B, C, D)

     * Identifies correct answer

     * Formats into quiz structure

     * Shows preview for review

   - User confirms and saves to quiz

   

   Option B: Paste raw text

   - Large textarea

   - Paste questions in any format:

     * "1. What is...? A) ... B) ... C) ... D) ..."

     * "Question: ... Answer: A"

     * Mixed formats

   - Click "Parse Text"

   - AI processes (same as above)

   - Preview and confirm

   

   Option C: Manual editor (below)



3. RICH QUESTION EDITOR

   For each question in quiz:

   - Question type dropdown:

     * Multiple Choice (4 options)

     * True/False

     * Short Answer

     * Essay/Theory

   - Question text field (rich text editor)

   - For MCQ: 4 option fields with radio buttons to select correct answer

   - Explanation field (why this answer is correct)

   - Difficulty selector (Easy/Medium/Hard)

   - Tags/subjects (autocomplete: Math, English, Physics, etc.)

   - Delete question button

   - Move up/down (reorder)

   - Duplicate question button



4. QUIZ PREVIEW

   - See all questions in order

   - Preview how students will see it

   - Review mode (show answers + explanations)



5. PUBLISH/SETTINGS

   - Save quiz as draft

   - Publish quiz (make available to students)

   - Set quiz as "Available" or "Closed"

   - Set start/end date (optional)

   - Randomize question order? (toggle)

   - Shuffle options? (toggle)

   - Show answers immediately after submit? (toggle)

   - Show explanations? (toggle)

   - Time limit enforcement? (toggle)



---



ADMIN DASHBOARD - QUIZ MANAGEMENT



1. QUIZZES LIST

   - Table view showing:

     * Quiz title

     * Category

     * Number of questions

     * Duration

     * Status (Draft/Published)

     * Date created

     * Attempts count

   - Actions:

     * Edit quiz

     * Delete quiz

     * View results

     * Copy quiz

     * View analytics

   - Filter by: Category, Status

   - Sort by: Date, Attempts, Title



2. RESULTS & ANALYTICS

   - See all student attempts

   - For each attempt:

     * Student name/ID

     * Score (percentage)

     * Time taken

     * Date/time taken

     * View detailed answers (what they selected vs correct)

   - Bulk export (CSV)

   - Statistics:

     * Average score

     * Pass/fail rate

     * Most missed questions

     * Time analysis



3. STUDENT MANAGEMENT

   - List all students

   - Add student manually (name, email, ID)

   - Bulk import students (CSV)

   - Assign quizzes to specific students (optional)

   - View student progress

   - Send message to students (via notification)



4. ADMIN SETTINGS

   - App settings:

     * App name ("HaniLearn-QZ")

     * Logo/branding

     * Primary colors

     * Default quiz settings

   - Question bank settings:

     * Categories

     * Difficulty levels

     * Subject tags

   - Student access:

     * Allow public quizzes? (toggle)

     * Require authentication to take quiz?

     * Allow retakes? (toggle, how many times?)

   - Advanced:

     * API access (for future tutor integration)

     * Data export options



---



STUDENT INTERFACE - QUIZ TAKING



1. QUIZ LIST/HOME

   - Grid or list of available quizzes

   - Show:

     * Quiz title

     * Category

     * Number of questions

     * Duration

     * Difficulty

     * Button: "Take Quiz"

   - Filter by: Category

   - Search by quiz name

   - Show only "available" quizzes



2. QUIZ PLAYER

   Clean, distraction-free interface:

   

   - Header:

     * Quiz title

     * Timer (countdown)

     * Progress bar (question X of Y)

   

   - Main area:

     * Question text (large, readable)

     * Multiple choice options:

       - 4 radio buttons (A, B, C, D)

       - Clickable text (not just buttons)

     - Keyboard support: Press 1,2,3,4 to select option

   

   - Navigation:

     * Previous button (disabled on Q1)

     * Next button

     * Submit quiz button (at end)

   

   - Sidebar (optional):

     * Question navigator (click to jump to question X)

     * Show answered/unanswered questions

     * Review mode toggle



3. QUIZ RESULTS

   After submission:

   - Score (percentage)

   - Pass/fail status

   - Time taken

   - Questions breakdown:

     * Question text

     * Student's answer vs correct answer

     * Explanation (if enabled)

   - Buttons:

     * Retake quiz (if allowed)

     * Back to home

   - Export results as PDF (optional)



---



AI LOGIC - QUESTION PARSING



When admin uploads document or pastes text:



1. Document parsing:

   - Extract raw text from .docx, .txt, .pdf

   - Handle Google Docs/Notion links (fetch content)



2. Question identification:

   - Look for question patterns:

     * "1. What is...?"

     * "Question 1:"

     * "Q1:"

   - Split text by these patterns



3. Option extraction:

   - For each question, find options:

     * "A) ...", "A. ...", "(A) ...", "a) ..."

     * Same for B, C, D

   - Extract text after option markers



4. Answer detection:

   - Look for answer key:

     * "Answer: A"

     * "Correct: B"

     * Marked option (bold, highlighted, checkmark)

   - If found, match to extracted options



5. Format validation:

   - Check if 4 options found (for MCQ)

   - Check if answer is valid

   - Flag problematic questions for review

   - Present preview to admin before saving



6. Fallback:

   - If parsing fails, show raw text

   - Let admin manually fix and save



---



DATABASE SCHEMA (SIMPLIFIED)



Quizzes table:

- id, title, description, category, duration, difficulty, instructions, is_published, created_at, updated_at, question_count



Questions table:

- id, quiz_id, question_text, question_type, difficulty, position, explanation, tags



Options table (for MCQ):

- id, question_id, option_text (A/B/C/D), is_correct, position



Student Attempts table:

- id, student_id, quiz_id, score, time_taken, submitted_at, answers (JSON)



Students table:

- id, name, email, status, created_at



---



TECHNICAL REQUIREMENTS



Framework: Next.js (Lovable default)

Auth: Email/password (admin login only for now)

Database: Supabase (auto-generated by Lovable)

Storage: Supabase Storage (for document uploads)

AI: Claude API for question parsing

PWA: Make it installable, offline support for quiz taking



---



UI/UX SPECIFICATIONS



Design system:

- Color: Navy (#1A2540) primary, Gold (#D4A574) secondary, White/light gray backgrounds

- Typography: Modern sans-serif (Poppins, Inter, or system fonts)

- Spacing: Clean, airy, breathing room

- Rounded corners: Subtle (4-8px)

- Icons: Material or Feather icons

- Mobile-first responsive



Admin dashboard:

- Sidebar navigation (collapsible on mobile)

- Left: Navigation menu (Quizzes, Students, Analytics, Settings)

- Right: Main content area

- Top: Header with logo, user menu



Student quiz interface:

- Full-screen quiz experience (minimal UI)

- Only question, options, timer, progress bar

- Hide navigation except necessary buttons

- Dark mode option (eye-friendly for long sessions)



---



PWA REQUIREMENTS



Make installable:

- Service worker for offline support

- Cache quiz data locally

- Allow quiz taking offline (sync when back online)

- Home screen icon

- Splash screen

- Manifest file



Mobile optimization:

- Touch-friendly buttons (min 48px)

- Responsive layout

- Fast loading (<3s)

- Gesture support (swipe for next question)



---



FUTURE-PROOFING (For Multiple Tutors)



Code it so later you can:

1. Add multi-tenant architecture (each tutor has their own workspace)

2. Add tutor role (create quizzes for their own students)

3. Add permission levels (admin > tutor > student)

4. Add workspace/organization model

5. Add tutor analytics & earnings (if monetizing)



For now: Single admin, many students

Later: Many tutors, many students



Hint in settings: "Tutor features coming soon" (grayed out options)



---



KEY DIFFERENTIATORS



1. AI question import (biggest feature)

2. Modern, clean UI (vs QuizBoot's dated look)

3. PWA (works offline, installable)

4. Focused experience (admin tool, not bloated)

5. Fast (lightweight, optimized)

6. Nigerian exam focus (JAMB, WAEC formats)



---



MUST-HAVE FLOWS



Admin flow:

1. Login → Dashboard

2. Create quiz → Upload doc/paste text → AI parses → Preview → Save

3. View quizzes → Edit quiz → Publish

4. View results → See student scores + analytics

5. Manage students → See progress



Student flow:

1. Open app (no login needed for now, or simple PIN)

2. See available quizzes

3. Click quiz → Take quiz

4. Submit → See results

5. Retake (if allowed)



---



DEPLOYMENT



- Host on Vercel (PWA support)

- Domain: hanilearn-qz.com or hanilearn.com/qz

- Database: Supabase (free tier fine for now)

- AI: Claude API (pay-as-you-go)

- Storage: Supabase Storage



---



That's it. Build it exactly like this. No assumptions.



You're the admin. Students log in (or get PIN). You create quizzes. They take them. Done.



Future: Add more tutors. Scale. Monetize.



For now: Simple, efficient, powerful.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://hanilearnqz.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/758b6d1b-d120-4f5b-ad40-12f29def2e3b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
