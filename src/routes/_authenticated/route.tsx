import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ensureGuestSession } from "@/lib/guest-identity";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) return { user: data.user };

    // No sign-in required to browse or take public quizzes: transparently
    // create/reuse a device-scoped guest account instead of bouncing to /auth.
    const ok = await ensureGuestSession();
    if (ok) {
      const { data: after } = await supabase.auth.getUser();
      if (after.user) return { user: after.user };
    }
    throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});
