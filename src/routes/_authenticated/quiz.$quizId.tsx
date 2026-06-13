import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/quiz/$quizId")({
  component: () => <Outlet />,
});
