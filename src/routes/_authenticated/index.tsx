import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "HaniLearn — Create & take quizzes" },
      { name: "description", content: "HaniLearn is a quiz and CBT platform for JAMB, WAEC, NECO and custom assessments." },
      { property: "og:title", content: "HaniLearn — Create & take quizzes" },
      { property: "og:description", content: "HaniLearn is a quiz and CBT platform for JAMB, WAEC, NECO and custom assessments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => { throw redirect({ to: "/explore" }); },
});
