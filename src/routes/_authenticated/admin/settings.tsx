import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { getSettings, updateSettings } from "@/lib/settings.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getSettings);
  const updFn = useServerFn(updateSettings);
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => fetchFn() });
  const [appName, setAppName] = useState("");
  const [cats, setCats] = useState("");
  const [tags, setTags] = useState("");
  useEffect(() => {
    if (data) { setAppName(data.app_name); setCats((data.categories ?? []).join(", ")); setTags((data.subject_tags ?? []).join(", ")); }
  }, [data]);
  const save = useMutation({
    mutationFn: () => updFn({ data: {
      app_name: appName,
      categories: cats.split(",").map((c) => c.trim()).filter(Boolean),
      subject_tags: tags.split(",").map((c) => c.trim()).filter(Boolean),
    }}),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-3xl font-bold">Settings</h1>
      <Card><CardContent className="pt-6 space-y-4">
        <div><Label>App name</Label><Input value={appName} onChange={(e) => setAppName(e.target.value)} /></div>
        <div><Label>Categories (comma-separated)</Label><Input value={cats} onChange={(e) => setCats(e.target.value)} /></div>
        <div><Label>Subject tags (comma-separated)</Label><Input value={tags} onChange={(e) => setTags(e.target.value)} /></div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
      </CardContent></Card>
      <Card><CardContent className="pt-6 text-sm text-muted-foreground">
        <strong className="text-foreground">Coming soon:</strong> Multi-tutor workspaces, PIN access, .docx/PDF upload, push notifications, API access.
      </CardContent></Card>
    </div>
  );
}
