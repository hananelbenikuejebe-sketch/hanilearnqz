import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getQuizSocialSummary, toggleQuizLike, addQuizComment, deleteQuizComment, hideQuizComment, recordQuizShare } from "@/lib/social.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Heart, MessageCircle, Share2, Trophy, EyeOff, Eye, Trash2, Crown, Medal } from "lucide-react";
import { toast } from "sonner";

export function SocialPanel({ quizId, quizTitle, shareUrl }: { quizId: string; quizTitle?: string; shareUrl?: string }) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getQuizSocialSummary);
  const likeFn = useServerFn(toggleQuizLike);
  const commentFn = useServerFn(addQuizComment);
  const deleteFn = useServerFn(deleteQuizComment);
  const hideFn = useServerFn(hideQuizComment);
  const shareFn = useServerFn(recordQuizShare);

  const { data, isLoading } = useQuery({
    queryKey: ["social", quizId],
    queryFn: () => fetchFn({ data: { quiz_id: quizId } }),
  });

  const [body, setBody] = useState("");

  const like = useMutation({
    mutationFn: () => likeFn({ data: { quiz_id: quizId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social", quizId] }),
    onError: (e: any) => toast.error(e.message),
  });
  const comment = useMutation({
    mutationFn: () => commentFn({ data: { quiz_id: quizId, body } }),
    onSuccess: () => { setBody(""); qc.invalidateQueries({ queryKey: ["social", quizId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social", quizId] }),
  });
  const hide = useMutation({
    mutationFn: ({ id, hidden }: { id: string; hidden: boolean }) => hideFn({ data: { id, hidden } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social", quizId] }),
  });

  async function share() {
    const url = shareUrl ?? `${window.location.origin}/quiz/${quizId}`;
    const shareData = { title: quizTitle ?? "Quiz", text: "Try this quiz on HaniLearn-QZ", url };
    try {
      const canNativeShare = typeof navigator !== "undefined" && typeof (navigator as any).share === "function";
      if (canNativeShare) await (navigator as any).share(shareData);
      else { await navigator.clipboard.writeText(url); toast.success("Link copied"); }
      await shareFn({ data: { quiz_id: quizId, channel: canNativeShare ? "native" : "copy_link" } });
      qc.invalidateQueries({ queryKey: ["social", quizId] });
    } catch { /* user cancelled */ }
  }

  if (isLoading || !data) return null;
  const { settings, counts, liked_by_me, comments, leaderboard, is_admin } = data;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 flex-wrap">
            {settings.allow_likes && (
              <Button size="sm" variant={liked_by_me ? "default" : "outline"} onClick={() => like.mutate()} disabled={like.isPending}>
                <Heart className={`h-4 w-4 mr-1 ${liked_by_me ? "fill-current" : ""}`} />{counts.likes}
              </Button>
            )}
            {settings.allow_sharing && (
              <Button size="sm" variant="outline" onClick={share}>
                <Share2 className="h-4 w-4 mr-1" />Share{counts.shares ? ` · ${counts.shares}` : ""}
              </Button>
            )}
            {settings.allow_comments && (
              <Badge variant="secondary" className="ml-auto"><MessageCircle className="h-3 w-3 mr-1" />{counts.comments} comments</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {settings.show_leaderboard && leaderboard.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" />Leaderboard</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {leaderboard.map((row: any) => (
              <div key={row.student_id} className={`flex items-center gap-3 px-2 py-1.5 rounded text-sm ${row.is_me ? "bg-primary/10 border border-primary/30" : ""}`}>
                <span className="w-6 text-center font-bold text-muted-foreground">
                  {row.rank === 1 ? <Crown className="h-4 w-4 text-amber-500 inline" /> : row.rank <= 3 ? <Medal className="h-4 w-4 text-amber-600 inline" /> : row.rank}
                </span>
                <span className="flex-1 truncate">{row.name}{row.is_me && " (you)"}</span>
                <span className="tabular-nums font-medium">{row.score_pct.toFixed(0)}%</span>
                <span className="tabular-nums text-xs text-muted-foreground w-12 text-right">{Math.floor(row.time_taken_sec / 60)}m{row.time_taken_sec % 60}s</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {settings.allow_comments && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Discussion</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Textarea rows={2} placeholder="Share your thoughts about this quiz…" value={body} onChange={(e) => setBody(e.target.value)} />
              <div className="flex justify-end">
                <Button size="sm" disabled={!body.trim() || comment.isPending} onClick={() => comment.mutate()}>Post</Button>
              </div>
            </div>
            <div className="space-y-2">
              {comments.length === 0 && <div className="text-sm text-muted-foreground text-center py-4">Be the first to comment.</div>}
              {comments.map((c: any) => (
                <div key={c.id} className={`p-2 rounded border text-sm ${c.is_hidden ? "opacity-60 bg-muted" : ""}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-medium text-xs">{c.author_name}{c.is_hidden && " · hidden"}</span>
                    <div className="flex gap-1">
                      {is_admin && (
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => hide.mutate({ id: c.id, hidden: !c.is_hidden })} title={c.is_hidden ? "Unhide" : "Hide"}>
                          {c.is_hidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                        </Button>
                      )}
                      {(c.is_mine || is_admin) && (
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => remove.mutate(c.id)} title="Delete">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="whitespace-pre-wrap">{c.body}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
