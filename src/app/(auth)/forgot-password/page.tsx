"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthShell, FormNotice } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "../actions";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);

  return (
    <AuthShell title="Reset your password" description="We'll email you a link to choose a new password.">
      <form action={action} className="flex flex-col gap-4">
        <FormNotice error={state?.error} message={state?.message} />
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Sending…" : "Send reset link"}
        </Button>
        <Link href="/login" className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </form>
    </AuthShell>
  );
}
