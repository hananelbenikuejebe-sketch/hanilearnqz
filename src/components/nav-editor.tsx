import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GripVertical, ArrowUp, ArrowDown, X, Plus } from "lucide-react";
import type { NavItemId } from "@/lib/nav-prefs.functions";

export type NavCatalogEntry = {
  id: NavItemId;
  label: string;
  icon: any;
};

export function NavEditor({
  open,
  onOpenChange,
  catalog,
  value,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: NavCatalogEntry[];
  value: NavItemId[];
  onSave: (items: NavItemId[]) => void;
  saving?: boolean;
}) {
  const [items, setItems] = useState<NavItemId[]>(value);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Re-seed local state whenever the dialog is (re)opened with fresh data.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setItems(value);
  }

  const byId = (id: NavItemId) => catalog.find((c) => c.id === id);
  const available = catalog.filter((c) => !items.includes(c.id));

  function move(index: number, dir: -1 | 1) {
    setItems((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function remove(index: number) {
    setItems((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== index)));
  }

  function add(id: NavItemId) {
    setItems((prev) => (prev.length >= 5 ? prev : [...prev, id]));
  }

  function handleDrop(index: number) {
    setItems((prev) => {
      if (dragIndex === null || dragIndex === index) return prev;
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setDragIndex(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Customise bottom bar</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Drag to reorder, or use the arrows. Keep 2–5 tabs; everything else lives in More.
          </p>
          <ul className="space-y-1.5">
            {items.map((id, index) => {
              const entry = byId(id);
              if (!entry) return null;
              const Icon = entry.icon;
              return (
                <li
                  key={id}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(index)}
                  className={cn(
                    "flex items-center gap-2 rounded-md border bg-card px-2.5 py-2 text-sm",
                    dragIndex === index && "opacity-50",
                  )}
                >
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{entry.label}</span>
                  <button
                    type="button"
                    aria-label={`Move ${entry.label} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${entry.label} down`}
                    disabled={index === items.length - 1}
                    onClick={() => move(index, 1)}
                    className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${entry.label}`}
                    disabled={items.length <= 2}
                    onClick={() => remove(index)}
                    className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>

          {available.length > 0 && (
            <>
              <p className="pt-2 text-xs font-medium text-muted-foreground">Add to bar</p>
              <div className="flex flex-wrap gap-1.5">
                {available.map((entry) => {
                  const Icon = entry.icon;
                  return (
                    <button
                      type="button"
                      key={entry.id}
                      disabled={items.length >= 5}
                      onClick={() => add(entry.id)}
                      className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs disabled:opacity-40"
                    >
                      <Plus className="h-3 w-3" />
                      <Icon className="h-3.5 w-3.5" />
                      {entry.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => onSave(items)}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
