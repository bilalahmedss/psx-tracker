import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Skeleton } from "@/components/skeleton";
import { requireUser } from "@/lib/auth";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password" };

// Reached from the emailed reset link, which signs the user in first.
export default function ResetPasswordPage() {
  return (
    <AuthShell title="Choose a new password">
      <Suspense fallback={<Skeleton className="h-44" />}>
        <SignedInResetForm />
      </Suspense>
    </AuthShell>
  );
}

async function SignedInResetForm() {
  await requireUser();
  return <ResetPasswordForm />;
}
