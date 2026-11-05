"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";

type State = { error?: string } | undefined;

/** A small delete button that asks for confirmation and shows any error inline. */
export function ConfirmDelete({
  action,
  confirmText,
  label = "Delete",
  returnTo,
}: {
  action: (prev: State, fd: FormData) => Promise<State>;
  confirmText: string;
  label?: string;
  returnTo?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
      className="inline-flex flex-col items-end gap-1"
    >
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={pending}>
        {pending ? "Deleting…" : label}
      </Button>
      {state?.error ? (
        <p role="alert" className="max-w-xs text-right text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
