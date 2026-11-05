import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Native <select> styled for both themes. The background and text colours are
 * explicit (never transparent): the browser draws the option list with the
 * select's colours, so a transparent dark-mode select gave white text on the
 * default white popup. `color-scheme` in globals.css makes the popup itself
 * follow the theme too.
 */
export const NATIVE_SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30 [&_option]:bg-popover [&_option]:text-popover-foreground";

export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return <select data-slot="native-select" className={cn(NATIVE_SELECT_CLASS, className)} {...props} />;
}
