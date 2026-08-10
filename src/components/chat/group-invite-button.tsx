import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createGroupInvite } from "@/lib/groups.functions";
import { ShareButton } from "@/components/share-button";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

/** Generates (or reuses) an invite token and offers it via the shared ShareButton. */
export function GroupInviteButton({ groupId, groupName }: { groupId: string; groupName: string }) {
  const createFn = useServerFn(createGroupInvite);
  const [link, setLink] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => createFn({ data: { group_id: groupId } }),
    onSuccess: (row: any) => setLink(`/messages/group/${groupId}?invite=${row.token}`),
    onError: (e: any) => toast.error(e.message ?? "Couldn't create invite link"),
  });

  if (link) {
    return <ShareButton url={link} title={`Join "${groupName}"`} text={`Join my group "${groupName}" on HaniLearn-QZ`} label="Share invite" size="icon" variant="ghost" />;
  }
  return (
    <Button type="button" size="icon" variant="ghost" disabled={create.isPending} onClick={() => create.mutate()} aria-label="Create invite link">
      <UserPlus className="h-4 w-4" />
    </Button>
  );
}
