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
