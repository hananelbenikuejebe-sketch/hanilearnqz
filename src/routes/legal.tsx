import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/legal")({
  component: Legal,
  head: () => ({
    meta: [
      { title: "Privacy Policy & Terms — HaniLearn-QZ" },
      { name: "description", content: "How HaniLearn-QZ handles your data, how our AI uses your activity, payment and AI credit rules, and the terms of using the platform." },
      { property: "og:title", content: "Privacy Policy & Terms — HaniLearn-QZ" },
      { property: "og:description", content: "Data handling, AI access to your activity, payments, AI credits and the terms of using HaniLearn-QZ." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function Legal() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4 pb-24 md:p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Privacy Policy &amp; Terms of Service</h1>
        <p className="text-sm text-muted-foreground">
          HaniLearn-QZ (&quot;HaniLearn&quot;, &quot;we&quot;) is a Nigerian quiz and assessment platform for students, creators and
          institutions. Last updated {new Date().getFullYear()}. Questions: WhatsApp +234 907 182 9295.
        </p>
      </header>

      <Section title="1. What we collect">
        <p>Account data: your name or handle, email (where provided), school, level, bio, social links, avatar and — for guest
          accounts — a hashed device fingerprint used only to keep one guest identity stable across visits instead of creating
          duplicate accounts.</p>
        <p>Activity data: quizzes you create or take, attempt answers and scores, likes, comments, shares, quiz opens and
          impressions in Explore, group and direct messages, notification subscriptions, and AI conversations.</p>
        <p>Money data: AI credit balance, wallet balance, top-ups, withdrawal requests, quiz purchases, bank details you submit
          for payouts, and payment receipts you upload for verification.</p>
      </Section>

      <Section title="2. How our AI uses your data">
        <p>HaniLearn uses AI for question parsing and generation, essay and theory marking, result feedback, receipt
          verification, personalised notifications, the Hani AI chat and the Creator assistant.</p>
        <p>To do this, AI models process the content you submit (pasted questions, essay answers, receipts, chat messages) and,
          for personalisation, aggregated signals about your activity: categories you attempt, engagement counts, streaks,
          credit balance and recency. Analytics available to our AI and to platform admins is behavioural and financial — it does
          not expose your password, and admins never receive your card or bank credentials from us.</p>
        <p>Your private direct messages are not used to train models. Content is sent to third-party model providers
          (including our AI gateway and OpenRouter) purely to produce the response you asked for.</p>
      </Section>

      <Section title="3. AI credits, payments and fees">
        <p>AI features are regulated by AI credit, not by tiers: if you hold credit, AI works. Every AI call is priced in
          Naira-denominated credit at rates published in the app, debited atomically before the call runs. Unused credit
          expires after the period shown on your wallet.</p>
        <p>Free monthly credit is granted automatically to every account at the amount configured by the platform.
          Top-ups and withdrawals carry a platform fee shown before you confirm. Quiz sales carry a platform fee on the
          creator&apos;s earnings. Receipts uploaded for manual payment verification are reviewed automatically and, where
          needed, by an admin; fraudulent receipts result in loss of access.</p>
      </Section>

      <Section title="4. Notifications">
        <p>With your permission we send push and in-app notifications about new quizzes, results, messages, credits and
          reminders. You can revoke permission in your browser or device settings at any time; in-app notifications remain.</p>
      </Section>

      <Section title="5. Your content and conduct">
        <p>You keep ownership of quizzes you create; you grant us a licence to host, display, share and promote them within
          HaniLearn. You must not upload content you do not have the right to use, exam material you are contractually barred
          from sharing, or content that is unlawful, hateful or harassing. Creators are responsible for the accuracy of their
          quizzes and for prices they set.</p>
        <p>We may hide, unpublish or remove content and suspend accounts that break these terms, abuse AI credit, or attempt
          to bypass payment or access controls.</p>
      </Section>

      <Section title="6. Your rights and data retention">
        <p>You can edit your profile, delete your AI conversations, and request deletion of your account and personal data by
          contacting support. Inactive guest profiles are purged automatically. Financial records are retained as long as
          required for accounting and dispute resolution.</p>
      </Section>

      <Section title="7. Security and liability">
        <p>Data is stored on managed cloud infrastructure with row-level access rules so users can only read their own private
          records. No platform is perfectly secure. HaniLearn is provided &quot;as is&quot;; to the extent permitted by law we are not
          liable for indirect losses, and our total liability is limited to the amount you paid us in the previous three months.</p>
      </Section>

      <Section title="8. Changes and contact">
        <p>We may update this document as features change; material changes will be announced in-app. Contact us on WhatsApp at
          +234 907 182 9295 or through in-app support.</p>
      </Section>

      <p className="pt-4 text-sm">
        <Link to="/" className="font-medium text-primary underline">Back to HaniLearn-QZ</Link>
      </p>
    </main>
  );
}
