import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (data.user) return { user: data.user };
    // Admin routes still require a real account.
    if (location.pathname.startsWith("/admin")) {
      throw redirect({ to: "/auth" });
    }
    // Otherwise: create an anonymous guest session so quizzes / dashboard are reachable without sign-in.
    const { data: anon, error } = await supabase.auth.signInAnonymously();
    if (error || !anon.user) throw redirect({ to: "/auth" });
    return { user: anon.user };
  },
  component: () => <Outlet />,
});

