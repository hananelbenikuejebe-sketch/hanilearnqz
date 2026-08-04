import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listGuides } from "@/lib/support.functions";
import { getMyCreatorStatus } from "@/lib/creators.functions";
import { AppShell } from "@/components/app-nav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { LifeBuoy, MessageCircle, Search, Lightbulb } from "lucide-react";

export const Route = createFileRoute("/_authenticated/support")({
  head: () => ({ meta: [
    { title: "Help & support — HaniLearn-QZ" },
    { name: "description", content: "Guides, tips and direct support for creating quizzes, AI credits, earnings and withdrawals on HaniLearn-QZ." },
    { property: "og:title", content: "Help & support — HaniLearn-QZ" },
    { property: "og:description", content: "Guides, tips and direct support for HaniLearn-QZ creators and learners." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Support,
});

const TIPS = [
  "Share your affiliate link from Wallet — you earn a cut of every creator or AI purchase from people you invite.",
  "A tick (✓) right after an option in your pasted text tells the offline parser which answer is correct.",
  "Write 'Answer: B' and 'Explanation: …' under a question and the parser files them in the right place.",
  "Set a price on a quiz to sell it — your earnings land in Wallet, minus the platform fee.",
  "Pro creator access raises your quiz and question limits and unlocks AI parsing and analytics.",
  "AI essay marking and AI parsing spend AI credit — check your balance in Wallet before a big import.",
];

function Support() {
  const listFn = useServerFn(listGuides);
  const statusFn = useServerFn(getMyCreatorStatus);
  const { data } = useQuery({ queryKey: ["support-guides"], queryFn: () => listFn() });
  const { data: status } = useQuery({ queryKey: ["creator-status"], queryFn: () => statusFn() });
  const [q, setQ] = useState("");
  const [tip, setTip] = useState(0);

  const guides = (data?.guides ?? []).filter((g: any) =>
    !q.trim() || `${g.title} ${g.body}`.toLowerCase().includes(q.trim().toLowerCase()));
  const wa = (data?.support_whatsapp ?? "+2349071829295").replace(/\D/g, "");

  return (
    <AppShell isSuperAdmin={status?.is_super_admin}>
      <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold"><LifeBuoy className="h-6 w-6" />Help & support</h1>
            <p className="text-sm text-muted-foreground">Guides, walkthroughs and direct help.</p>
          </div>
          {data?.is_admin && <Button asChild size="sm" variant="outline"><Link to="/admin/guides">Edit guides</Link></Button>}
        </div>

        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-start gap-3 py-4">
            <Lightbulb className="mt-0.5 h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">Tip {tip + 1} of {TIPS.length}</p>
              <p className="text-sm text-muted-foreground">{TIPS[tip]}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setTip((t) => (t + 1) % TIPS.length)}>Next</Button>
          </CardContent>
        </Card>

        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search the guides…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Guides</CardTitle>
            <CardDescription>Everything from creating your first quiz to getting paid.</CardDescription></CardHeader>
          <CardContent>
            {!guides.length && <p className="py-6 text-center text-sm text-muted-foreground">No guides match your search.</p>}
            <Accordion type="single" collapsible>
              {guides.map((g: any) => (
                <AccordionItem key={g.id} value={g.id}>
                  <AccordionTrigger className="text-left text-sm">{g.title}</AccordionTrigger>
                  <AccordionContent className="space-y-2 text-sm">
                    <p className="whitespace-pre-wrap text-muted-foreground">{g.body}</p>
                    {g.link_url && (
                      <a className="text-primary underline" href={g.link_url} target="_blank" rel="noopener noreferrer">
                        {g.link_label || "Open link"}
                      </a>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Still stuck?</CardTitle>
            <CardDescription>Message the admin directly — payments, access and account issues.</CardDescription></CardHeader>
          <CardContent>
            <Button asChild>
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-1 h-4 w-4" />Chat on WhatsApp ({data?.support_whatsapp ?? "+234 907 182 9295"})
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
