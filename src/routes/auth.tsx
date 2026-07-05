import { createFileRoute, useNavigate, Link, useSearch } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useServerFn } from "@tanstack/react-start";
import { trackAffiliateClick, attributeAffiliate } from "@/lib/affiliate.functions";
import { getOrCreateGuestIdentity } from "@/lib/guest-identity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";
import { z } from "zod";

const REF_KEY = "hanilearn.ref";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Sign in — HaniLearn-QZ" }] }),
  validateSearch: (s: any) => z.object({ ref: z.string().max(16).optional() }).parse(s),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showGuest, setShowGuest] = useState(false);
  const trackClick = useServerFn(trackAffiliateClick);
  const attribute = useServerFn(attributeAffiliate);

  useEffect(() => {
    if (search.ref) {
      const code = search.ref.toUpperCase();
      try { localStorage.setItem(REF_KEY, code); } catch { /* ignore */ }
      trackClick({ data: { code } }).catch(() => {});
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate, search.ref, trackClick]);

  async function afterAuth() {
    try {
      const code = localStorage.getItem(REF_KEY);
      if (code) {
        await attribute({ data: { code } });
        localStorage.removeItem(REF_KEY);
      }
    } catch { /* non-fatal */ }
    navigate({ to: "/" });
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault(); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back!"); await afterAuth();
  }
  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault(); setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin, data: { full_name: fullName } },
    });
    if (error) { setLoading(false); return toast.error(error.message); }
    // Auto sign-in immediately (works when Confirm Email is off in Auth settings)
    const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signErr) return toast.error("Account created but sign-in failed: " + signErr.message);
    toast.success("Welcome!"); await afterAuth();
  }
  async function handleGuest() {
    setLoading(true);
    try {
      const { handle, fingerprint } = await getOrCreateGuestIdentity();
      const gEmail = `guest-${fingerprint.slice(0, 20)}@guest.hanilearnqz.local`;
      const gPass = `g_${fingerprint.slice(0, 32)}!Qz9`;
      let { error } = await supabase.auth.signInWithPassword({ email: gEmail, password: gPass });
      if (error) {
        const { error: upErr } = await supabase.auth.signUp({
          email: gEmail, password: gPass,
          options: { data: { full_name: handle, guest: true, fingerprint } },
        });
        if (upErr) throw upErr;
        await supabase.auth.signInWithPassword({ email: gEmail, password: gPass });
      }
      toast.success("Continuing as guest"); await afterAuth();
    } catch (e: any) { toast.error(e.message ?? "Guest sign-in failed"); }
    finally { setLoading(false); }
  }

  async function handleGoogle() {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
      if (result.error) throw result.error;
      if (result.redirected) return;
      toast.success("Signed in with Google"); await afterAuth();
    } catch (e: any) { toast.error(e?.message ?? "Google sign-in failed"); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background to-secondary">
      <div className="flex justify-between items-center p-4">
        <Link to="/" className="font-bold text-lg">HaniLearn-QZ</Link>
        <ThemeToggle />
      </div>
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">Welcome</CardTitle>
            <CardDescription>Sign in or create your account.{search.ref && <span className="block text-xs mt-1 text-primary">Referred by {search.ref.toUpperCase()}</span>}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="outline" className="w-full mb-4" disabled={loading} onClick={handleGoogle}>
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 7.1 29.3 5 24 5 16.3 5 9.7 9.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 34.9 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C41.9 35.4 44 30.1 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>
              Continue with Google
            </Button>
            <div className="relative mb-4"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">or</span></div></div>
            <Tabs defaultValue="signup">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="signup">Create account</TabsTrigger>
                <TabsTrigger value="signin">Sign in</TabsTrigger>
              </TabsList>
              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-3 pt-4">
                  <div><Label htmlFor="n2">Full name</Label><Input id="n2" required value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
                  <div><Label htmlFor="e2">Email</Label><Input id="e2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                  <div><Label htmlFor="p2">Password</Label><Input id="p2" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                  <Button type="submit" className="w-full" disabled={loading}>{loading ? "Creating…" : "Create account"}</Button>
                </form>
              </TabsContent>
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-3 pt-4">
                  <div><Label htmlFor="e1">Email</Label><Input id="e1" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                  <div><Label htmlFor="p1">Password</Label><Input id="p1" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                  <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
                </form>
              </TabsContent>
            </Tabs>
            <div className="mt-4 pt-3 border-t text-center">
              {!showGuest
                ? <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setShowGuest(true)}>Just browsing? Continue without an account</button>
                : <Button variant="outline" size="sm" className="w-full" disabled={loading} onClick={handleGuest}>Continue as guest (limited)</Button>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
