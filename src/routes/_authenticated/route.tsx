import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getOrCreateGuestIdentity } from "@/lib/guest-identity";

const GUEST_SESSION_KEY = "hanilearn.guest.session.v1";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (data.user) return { user: data.user };
    // Admin routes still require a real account.
    if (location.pathname.startsWith("/admin")) {
      throw redirect({ to: "/auth" });
    }

    // Get (or create) this device's stable guest handle + fingerprint.
    const { handle, fingerprint } = await getOrCreateGuestIdentity();

    // Prevent duplicate guest accounts for the same device by remembering our previous
    // guest email/password locally and reusing it.
    let creds: { email: string; password: string } | null = null;
    try {
      const cached = localStorage.getItem(GUEST_SESSION_KEY);
      if (cached) creds = JSON.parse(cached);
    } catch { /* ignore */ }

    if (creds) {
      const { data: signedIn } = await supabase.auth.signInWithPassword(creds);
      if (signedIn?.user) return { user: signedIn.user };
    }

    // First visit on this device — create a permanent guest account tied to this fingerprint.
    const email = `guest-${fingerprint.slice(0, 20)}@guest.hanilearnqz.local`;
    const password = `g_${fingerprint.slice(0, 32)}!Qz9`;
    const { data: created, error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: handle, guest: true, fingerprint } },
    });
    if (signUpErr || !created.user) {
      // Account may already exist from a prior visit before we cached creds — sign in instead.
      const { data: signedIn, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr || !signedIn?.user) throw redirect({ to: "/auth" });
      try { localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify({ email, password })); } catch { /* ignore */ }
      return { user: signedIn.user };
    }

    try { localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify({ email, password })); } catch { /* ignore */ }
    try {
      await supabase.from("profiles").upsert(
        { id: created.user.id, full_name: handle, handle, is_guest: true, device_fingerprint: fingerprint } as any,
        { onConflict: "id" },
      );
    } catch { /* non-fatal */ }
    return { user: created.user };
  },
  component: () => <Outlet />,
});
