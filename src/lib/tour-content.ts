/**
 * All guided-tour content lives here. Each tour is a short, ordered list of steps.
 * `target` is either:
 *   - a plain CSS selector (e.g. `[data-coach="wallet"]`, `nav a[href="/wallet"]`)
 *   - `text:Some Label` which finds the first heading/button/link whose visible text
 *     contains "Some Label" (case-insensitive) — used when no stable selector/hook exists.
 * If nothing resolves, TourOverlay falls back to a centered card automatically.
 */

export type TourStep = {
  title: string;
  body: string;
  target?: string;
  /** Optional monetisation nudge shown as a small link under the body. */
  nudge?: { label: string; to: string };
};

export type Tour = {
  key: string;
  /** Route path prefixes that should auto-trigger this tour on first visit. */
  matches: string[];
  steps: TourStep[];
};

export const TOURS: Tour[] = [
  {
    key: "explore",
    matches: ["/explore"],
    steps: [
      {
        title: "Welcome to Explore",
        body: "Browse quizzes made by other creators — JAMB, WAEC, NECO and custom sets. Tap any card to preview it.",
        target: "text:Explore",
      },
      {
        title: "Filter fast",
        body: "Narrow down by subject, difficulty and price so you find the right quiz in seconds.",
        target: "[data-coach='explore']",
      },
      {
        title: "Some quizzes cost credit",
        body: "Priced quizzes are set by their creators. Keep AI credit topped up so you're never blocked mid-search.",
        target: "nav a[href='/wallet']",
        nudge: { label: "Top up AI credit", to: "/wallet" },
      },
      {
        title: "Like what you see?",
        body: "You can build quizzes just like these — upload notes or a past question and let AI do the work.",
        target: "nav a[href='/create']",
        nudge: { label: "Start creating", to: "/create" },
      },
    ],
  },
  {
    key: "create",
    matches: ["/create"],
    steps: [
      {
        title: "Three ways to build a quiz",
        body: "Type questions manually, paste/upload a document for AI parsing, or ask AI to generate fresh questions from a topic.",
        target: "text:Create",
      },
      {
        title: "The quiz builder",
        body: "Add sections and questions, set the correct answers, and preview as you go.",
        target: "[data-coach='create']",
      },
      {
        title: "AI parsing saves hours",
        body: "Upload a PDF or image of past questions and AI will extract clean, structured questions automatically. This uses AI credit.",
      },
      {
        title: "AI generation",
        body: "No document? Describe a topic and let AI generate a full set of questions for you in seconds.",
      },
      {
        title: "Price your quiz",
        body: "Once published, you can charge a small credit fee per attempt — this is how creators earn on HaniLearn.",
        target: "nav a[href='/wallet']",
        nudge: { label: "See earnings in Wallet", to: "/wallet" },
      },
      {
        title: "Low on credit?",
        body: "Parsing and AI generation both use AI credit. Top up any time so you're never interrupted while building.",
        nudge: { label: "Buy AI credit", to: "/wallet" },
      },
    ],
  },
  {
    key: "wallet",
    matches: ["/wallet"],
    steps: [
      {
        title: "Your Wallet",
        body: "This is where your AI credit, earnings and payment history live.",
        target: "text:Wallet",
      },
      {
        title: "AI credit",
        body: "AI credit powers document parsing, AI question generation, and AI-graded theory answers. It runs out — keep an eye on the balance.",
        target: "[data-coach='wallet']",
        nudge: { label: "Buy AI credit now", to: "/wallet" },
      },
      {
        title: "Top up by receipt",
        body: "Pay via bank transfer and upload your receipt — it's verified automatically, usually within minutes.",
      },
      {
        title: "Go Pro",
        body: "A Pro / creator-access plan unlocks unlimited or discounted AI usage and creator tools — great value if you create or take a lot of quizzes.",
        nudge: { label: "Compare plans", to: "/wallet" },
      },
      {
        title: "Withdraw your earnings",
        body: "Earned from selling quizzes or affiliate links? Add your bank account here and request a withdrawal any time.",
      },
    ],
  },
  {
    key: "messages",
    matches: ["/messages"],
    steps: [
      {
        title: "Messages & Groups",
        body: "Chat 1:1 with other users, or join/create groups for class discussions and quiz help.",
        target: "text:Messages",
      },
      {
        title: "Groups",
        body: "Groups are great for study circles — share quizzes, discuss results and coordinate with classmates.",
        target: "[data-coach='messages']",
      },
      {
        title: "Share a quiz in chat",
        body: "You can drop a link to any quiz straight into a conversation — a fast way for creators to get more attempts.",
        nudge: { label: "Create a quiz to share", to: "/create" },
      },
    ],
  },
  {
    key: "profile",
    matches: ["/profile"],
    steps: [
      {
        title: "Your Profile",
        body: "Track your milestones, badges and activity here.",
        target: "text:Profile",
      },
      {
        title: "Milestones & badges",
        body: "Complete quizzes, create content and refer friends to unlock badges that show up on your public profile.",
      },
      {
        title: "Share your profile",
        body: "Your public profile link is a great way to promote quizzes you've created and grow your audience.",
        nudge: { label: "Become a creator", to: "/create" },
      },
    ],
  },
  {
    key: "quiz-take",
    matches: ["/quiz/", "/take"],
    steps: [
      {
        title: "Taking a quiz",
        body: "Choose Paged mode to answer one question at a time, or Continuous to scroll through all questions freely.",
      },
      {
        title: "Theory questions",
        body: "Open-ended theory answers are graded by AI against the model answer — this uses a small amount of AI credit per attempt.",
        nudge: { label: "Check your AI credit", to: "/wallet" },
      },
      {
        title: "Credit deduction",
        body: "Priced quizzes deduct credit when you start; AI-graded sections may use a little more. Your balance is always shown before you begin.",
      },
    ],
  },
  {
    key: "results",
    matches: ["/results", "/result"],
    steps: [
      {
        title: "Results & corrections",
        body: "See your score, review each question, and read corrections with explanations for anything you missed.",
        target: "text:Result",
      },
      {
        title: "Turn mistakes into mastery",
        body: "Retake the quiz, or explore similar quizzes on the same topic to keep improving.",
        nudge: { label: "Explore similar quizzes", to: "/explore" },
      },
      {
        title: "Enjoyed it?",
        body: "You could be on the other side of this — creators earn credit every time someone takes their quiz.",
        nudge: { label: "Create your own quiz", to: "/create" },
      },
    ],
  },
  {
    key: "creators-dashboard",
    matches: ["/creator", "/dashboard", "/analytics"],
    steps: [
      {
        title: "Creator dashboard",
        body: "Track attempts, scores and earnings across every quiz you've published.",
      },
      {
        title: "Pricing tricks",
        body: "Quizzes priced slightly below round numbers (e.g. 45 instead of 50 credit) tend to convert better — try small experiments.",
      },
      {
        title: "Prizes drive attempts",
        body: "Adding a prize or leaderboard reward for top scorers noticeably increases how many people take a quiz.",
      },
      {
        title: "Run an ad",
        body: "Boost visibility for a new quiz with a small in-app ad spend — early attempts help your quiz rank higher in Explore.",
        nudge: { label: "Promote a quiz", to: "/wallet" },
      },
      {
        title: "Affiliate links",
        body: "Share your affiliate link — you earn credit when people you refer top up or buy Pro, on top of quiz sales.",
        nudge: { label: "Get your affiliate link", to: "/wallet" },
      },
    ],
  },
  {
    key: "admin",
    matches: ["/admin"],
    steps: [
      {
        title: "Admin basics",
        body: "From here you can moderate quizzes, manage users, review payment receipts and broadcast notifications.",
      },
      {
        title: "Payments & settings",
        body: "Configure pricing defaults, AI provider routing and platform-wide settings under Settings.",
      },
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
