import { Check, CheckCheck } from "lucide-react";

/** WhatsApp-style sent/read ticks for own outgoing messages. */
export function MessageTicks({ read }: { read: boolean }) {
  return read
    ? <CheckCheck className="h-3.5 w-3.5 text-primary-foreground/90" aria-label="Read" />
    : <Check className="h-3.5 w-3.5 text-primary-foreground/70" aria-label="Sent" />;
}
