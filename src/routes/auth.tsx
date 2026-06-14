import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Sign in — HaniLearn-QZ" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault(); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back!");
    navigate({ to: "/" });
  }
  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault(); setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin, data: { full_name: fullName } },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Account created. Signing you in…");
    const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
    if (signErr) toast.message("Check your email to confirm, then sign in.");
    else navigate({ to: "/" });
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
            <CardDescription>Sign in or create your account to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4 pt-4">
                  <div><Label htmlFor="e1">Email</Label><Input id="e1" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                  <div><Label htmlFor="p1">Password</Label><Input id="p1" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                  <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4 pt-4">
                  <div><Label htmlFor="n2">Full name</Label><Input id="n2" required value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
                  <div><Label htmlFor="e2">Email</Label><Input id="e2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                  <div><Label htmlFor="p2">Password</Label><Input id="p2" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                  <p className="text-xs text-muted-foreground">The first account becomes admin automatically.</p>
                  <Button type="submit" className="w-full" disabled={loading}>{loading ? "Creating…" : "Create account"}</Button>
                </form>
              </TabsContent>
            </Tabs>
            <div className="mt-4 pt-4 border-t">
              <Button variant="outline" className="w-full" disabled={loading} onClick={async () => {
                setLoading(true);
                const { error } = await supabase.auth.signInAnonymously();
                setLoading(false);
                if (error) return toast.error(error.message);
                toast.success("Continuing as guest");
                navigate({ to: "/" });
              }}>Continue as guest</Button>
              <p className="text-xs text-muted-foreground text-center mt-2">Guests can take public quizzes. Sign in to save progress and access private quizzes.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

