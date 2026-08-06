import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RotateCcw, Compass, PlusCircle, Wallet } from "lucide-react";

/** Suggested next actions after finishing a quiz — nudges retake, exploration, creation and top-up. */
export function NextStepsCard({ quizId, category }: { quizId?: string; category?: string } = {}) {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2"><CardTitle className="text-sm">What's next?</CardTitle></CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {quizId && (
          <Button asChild variant="outline" size="sm" className="justify-start gap-2">
            <Link to="/quiz/$id" params={{ id: quizId }} search={{ retake: true } as any}>
              <RotateCcw className="h-4 w-4" /> Retake this quiz
            </Link>
          </Button>
        )}
        <Button asChild variant="outline" size="sm" className="justify-start gap-2">
          <Link to="/explore" search={category ? ({ category } as any) : undefined}>
            <Compass className="h-4 w-4" /> Explore similar quizzes
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="justify-start gap-2">
          <Link to="/create">
            <PlusCircle className="h-4 w-4" /> Create your own quiz
          </Link>
        </Button>
        <Button asChild size="sm" className="justify-start gap-2">
          <Link to="/wallet">
            <Wallet className="h-4 w-4" /> Top up AI credit
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
