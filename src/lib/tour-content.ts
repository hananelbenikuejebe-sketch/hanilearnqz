/**
 * All guided-tour content lives here. Tours are short (3-6 steps), contextual,
 * and grounded in real selectors from the actual routes under
 * src/routes/_authenticated. Each tour only auto-triggers on the page it's about.
 *
 * `target` resolution (see tour-overlay.tsx):
 *   - a plain CSS selector (e.g. `[data-tour="wallet-balance"]`, `nav a[href="/wallet"]`)
 *   - `text:Some Label` fuzzy-matches the first visible heading/button/link/tab
 *     whose text contains "Some Label" (case-insensitive)
 * A step may also declare:
 *   - `route`: navigate here before this step is shown (tour survives page changes)
 *   - `action`: a target to click first (e.g. a tab or collapsible trigger) so the
 *     real target becomes visible before we spotlight it
 *   - `waitMs`: extra settle time after an action/route change before measuring
 * Steps whose target never resolves are skipped automatically instead of
 * blurring the whole screen.
 */

export type TourStep = {
  title: string;
  body: string;
  target?: string;
  /** Selector to click before resolving `target` (opens a tab/accordion/etc). */
  action?: string;
  /** Navigate to this route before showing the step. */
  route?: string;
  /** Extra ms to wait after route/action before measuring the target. */
  waitMs?: number;
  /** Optional monetisation nudge shown as a small link under the body. */
  nudge?: { label: string; to: string };
};

export type Tour = {
  key: string;
  title: string;
  /** Route path substrings that should auto-trigger this tour on first visit. */
  matches: string[];
  steps: TourStep[];
};

export const TOURS: Tour[] = [
  {
    key: "home-explore",
    title: "Getting around",
    matches: ["/explore"],
    steps: [
      { title: "Welcome to Explore", body: "Browse quizzes made by other creators — JAMB, WAEC, NECO and custom sets. Tap any card to preview it.", target: "text:Explore" },
      { title: "Filter fast", body: "Narrow down by subject, difficulty and price so you find the right quiz in seconds.", target: "[data-tour='explore-filters'], [data-coach='explore']" },
      { title: "Create", body: "You can build quizzes just like these — upload notes or a past question and let AI do the work.", target: "nav a[href='/create']", nudge: { label: "Start creating", to: "/create" } },
      { title: "Wallet & credit", body: "Priced quizzes and AI features use credit from your wallet — keep it topped up.", target: "nav a[href='/wallet']", nudge: { label: "Open wallet", to: "/wallet" } },
    ],
  },
  {
    key: "quiz-take",
    title: "Taking a quiz",
    matches: ["/quiz/", "/take"],
    steps: [
      { title: "Paged or continuous", body: "Choose Paged mode to answer one question at a time, or Continuous to scroll through all questions freely.", target: "text:Paged" },
      { title: "Theory questions", body: "Open-ended theory answers are graded by AI against the model answer — this uses a small amount of AI credit per attempt." },
      { title: "Credit deduction", body: "Priced quizzes deduct credit when you start. Your balance is always shown before you begin.", nudge: { label: "Check your credit", to: "/wallet" } },
      { title: "Submit when ready", body: "Answer at your own pace, then submit to see your score and full corrections.", target: "text:Submit" },
    ],
  },
  {
    key: "quiz-builder",
    title: "Building a quiz",
    matches: ["/admin/quizzes/new", "/admin/quizzes/", "/edit"],
    steps: [
      // Basics
      { title: "This is the quiz builder", body: "Everything about one quiz lives here across four tabs: Settings, Questions, Sections, and Import & generate.", target: "text:Settings", action: "[data-tour='tab-settings']" },
      { title: "Start with the basics", body: "Title, subject, category and difficulty decide where your quiz shows up in Explore — be specific, it gets you more attempts.", target: "input[name='title'], #title", action: "[data-tour='tab-settings']" },
      // Questions / parser + AI generator
      { title: "Add questions your way", body: "Switch to the Questions tab to type them manually, or use Import & generate to paste a document or ask AI.", target: "[data-tour='tab-questions']", action: "[data-tour='tab-questions']" },
      { title: "Paste parser — format matters", body: "Paste: the question line, options as A) B) C) D), then 'Answer: B' and optionally 'Reason:'. The offline parser reads this instantly, no AI credit needed.", target: "[data-tour='tab-ai']", action: "[data-tour='tab-ai']" },
      { title: "AI generator", body: "No document at all? Describe a topic and how many questions you want and AI writes them — with answers, explanations and points. Uses AI credit.", target: "[data-tour='tab-ai']", nudge: { label: "Check AI credit", to: "/wallet" } },
      // Sections
      { title: "Sections & headers", body: "Group questions into sections with their own headers and marks — perfect for exam-style papers (Section A objectives, Section B theory).", target: "[data-tour='tab-sections']", action: "[data-tour='tab-sections']" },
      // Prizes / pricing / toggles
      { title: "Price and prizes", body: "Charge per attempt and add cash prizes for top scorers, paid straight into winners' wallets. Toggles below control timer, retakes, shuffling, comments and the leaderboard.", target: "text:Prize", action: "[data-tour='tab-settings']" },
      // Publish
      { title: "Publish and share", body: "Flip Published on when you're ready, then share the link everywhere — every share brings attempts, and attempts are how you earn.", target: "text:Publish", action: "[data-tour='tab-settings']", nudge: { label: "See your earnings", to: "/wallet" } },
    ],
  },
  {
    key: "analytics",
    title: "Quiz analytics",
    matches: ["/results", "/admin/quizzes/", "quizzes/$id/results"],
    steps: [
      { title: "Attempts & scores", body: "See every attempt on this quiz, average score, and how each question performed.", target: "text:Result" },
      { title: "Hardest questions", body: "Spot which questions trip people up most — a sign to clarify wording or adjust points.", target: "text:Question" },
      { title: "Earnings per quiz", body: "If this quiz is priced, your earnings from it show up here and in your Wallet.", nudge: { label: "See wallet", to: "/wallet" } },
    ],
  },
  {
    key: "wallet",
    title: "Wallet & monetisation",
    matches: ["/wallet"],
    steps: [
      { title: "Your Wallet", body: "This is where your AI credit, earnings and payment history live.", target: "text:Wallet" },
      { title: "AI credit", body: "AI credit powers document parsing, AI question generation and AI-graded theory answers. It runs out — keep an eye on the balance.", target: "[data-coach='wallet']", nudge: { label: "Buy AI credit now", to: "/wallet" } },
      { title: "Top up by receipt", body: "Pay via bank transfer and upload your receipt — it's verified automatically, usually within minutes.", target: "text:Bank" },
      { title: "Go Pro / creator access", body: "Unlocks unlimited or discounted AI usage and creator tools — great value if you create or take a lot of quizzes.", target: "text:Creator" },
      { title: "Withdraw earnings", body: "Earned from selling quizzes or affiliate links? Add your bank account here and request a withdrawal any time.", target: "text:Withdraw" },
    ],
  },
  {
    key: "messaging",
    title: "Messages & groups",
    matches: ["/messages"],
    steps: [
      { title: "Messages & Groups", body: "Chat 1:1 with other users, or join/create groups for class discussions and quiz help.", target: "text:Messages" },
      { title: "Groups", body: "Groups are great for study circles — share quizzes, discuss results and coordinate with classmates.", target: "[role='tab']" },
      { title: "Start a chat", body: "Search for anyone to start a new conversation or add them to a group.", target: "text:New" },
      { title: "Share a quiz in chat", body: "Drop a link to any quiz straight into a conversation — a fast way for creators to get more attempts.", nudge: { label: "Create a quiz to share", to: "/create" } },
    ],
  },
  {
    key: "ads",
    title: "Promoting with ads",
    matches: ["/ads"],
    steps: [
      { title: "Promote your quiz", body: "Submit a sponsored ad card to reach more learners across Explore, results and wallet screens.", target: "text:Promote" },
      { title: "Pick placements", body: "Choose where your ad shows up and for how long — price scales with reach and duration.", target: "text:Placement" },
      { title: "Live price preview", body: "See the exact cost before you submit, including any free-tier discount you qualify for.", target: "text:price" },
      { title: "Track your ads", body: "Approved, pending and rejected ads all show here with performance once live.", target: "text:My ads" },
    ],
  },
];

export function findTourForPath(pathname: string): Tour | null {
  const hit = TOURS.find((t) => t.matches.some((m) => pathname.includes(m)));
  return hit ?? null;
}

export function getTour(key: string): Tour | null {
  return TOURS.find((t) => t.key === key) ?? null;
}
