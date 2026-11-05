/** "How is this calculated?" disclosure for money figures. */
export function Explain({ children, title = "How is this calculated?" }: { children: React.ReactNode; title?: string }) {
  return (
    <details className="group rounded-lg border bg-muted/30 px-3 py-2 text-sm">
      <summary className="cursor-pointer select-none text-muted-foreground marker:text-muted-foreground group-open:mb-2">{title}</summary>
      <div className="flex flex-col gap-1.5 text-muted-foreground">{children}</div>
    </details>
  );
}
