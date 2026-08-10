export function DateSeparator({ label }: { label: string }) {
  return (
    <div className="my-3 flex items-center justify-center">
      <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">{label}</span>
    </div>
  );
}
