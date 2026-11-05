import { Label } from "@/components/ui/label";

/** Label + control + error/hint, with optional Rs / % affixes. */
export function FormField({
  label,
  name,
  error,
  hint,
  prefix,
  suffix,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: React.ReactNode;
  prefix?: string;
  suffix?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <div className="flex items-center gap-2">
        {prefix ? <span className="text-sm text-muted-foreground">{prefix}</span> : null}
        <div className="flex-1">{children}</div>
        {suffix ? <span className="text-sm text-muted-foreground">{suffix}</span> : null}
      </div>
      {error ? (
        <p id={`${name}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Props wiring an input to its error message for screen readers. */
export function fieldProps(name: string, errors: Record<string, string | undefined>) {
  return {
    id: name,
    name,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  } as const;
}
