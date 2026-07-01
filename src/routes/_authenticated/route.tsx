import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getOrCreateGuestIdentity } from "@/lib/guest-identity";

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

    // Assign a memorable, device-derived handle so guests are distinguishable and not all called "student".
    try {
      const { handle, fingerprint } = await getOrCreateGuestIdentity();
      await supabase.from("profiles").upsert({
        id: anon.user.id,
        full_name: handle,
        // @ts-expect-error device_fingerprint added via migration if present; ignored otherwise
        device_fingerprint: fingerprint,
      }, { onConflict: "id" });
      await supabase.auth.updateUser({ data: { full_name: handle, guest: true, fingerprint } });
    } catch { /* non-fatal */ }

    return { user: anon.user };
  },
  component: () => <Outlet />,
});
