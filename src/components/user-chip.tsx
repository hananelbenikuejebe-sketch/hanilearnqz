import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function initialsOf(name?: string | null) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function UserChip({
  userId,
  name,
  handle,
  avatarUrl,
  size = "sm",
  subtitle,
  variant = "inline",
  className,
}: {
  userId: string;
  name?: string | null;
  handle?: string | null;
  avatarUrl?: string | null;
  size?: "xs" | "sm" | "md";
  subtitle?: string;
  variant?: "inline" | "row";
  className?: string;
}) {
  const display = name || (handle ? `@${handle}` : "Unknown");
  const dim = size === "xs" ? "h-5 w-5" : size === "md" ? "h-9 w-9" : "h-7 w-7";
  const text = size === "xs" ? "text-[9px]" : size === "md" ? "text-xs" : "text-[10px]";

  return (
    <Link
      to="/profile/$userId"
      params={{ userId }}
      title="View profile"
      className={cn(
        "group inline-flex items-center gap-2 rounded-md px-1.5 py-1 transition hover:bg-accent/50",
        variant === "row" && "w-full justify-between",
        className,
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Avatar className={cn(dim, "shrink-0")}>
          {avatarUrl && <AvatarImage src={avatarUrl} alt={display} />}
          <AvatarFallback className={text}>{initialsOf(name || handle)}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 leading-tight">
          <span className="flex items-center gap-1">
            <span className="truncate text-sm font-medium underline-offset-2 group-hover:underline">{display}</span>
            <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground opacity-70" aria-hidden />
          </span>
          {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
        </span>
      </span>
    </Link>
  );
}

export function UserChipRow(props: Omit<Parameters<typeof UserChip>[0], "variant">) {
  return <UserChip {...props} variant="row" />;
}
