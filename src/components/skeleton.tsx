import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-muted", className)} />;
}

/** Placeholder for a form made of stacked cards. */
export function FormSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-44" />
      <Skeleton className="h-52" />
      <Skeleton className="h-64" />
    </div>
  );
}
