"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormNotice } from "@/components/auth-shell";
import type { DeleteState } from "./actions";

export function DeletePortfolio({
  name,
  action,
}: {
  name: string;
  action: (prev: DeleteState, fd: FormData) => Promise<DeleteState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [confirm, setConfirm] = useState("");
  const matches = confirm.trim() === name;

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Delete portfolio</CardTitle>
        <CardDescription>
          This permanently deletes the portfolio and everything in it: trades, dividends, cash entries and history. It
          can&apos;t be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-3">
          <FormNotice error={state?.error} />
          <div className="grid gap-1.5">
            <Label htmlFor="confirm">
              Type <span className="font-semibold">{name}</span> to confirm
            </Label>
            <Input id="confirm" name="confirm" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <div>
            <Button type="submit" variant="destructive" disabled={!matches || pending}>
              {pending ? "Deleting…" : "Delete portfolio"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
