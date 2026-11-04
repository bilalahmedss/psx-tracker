import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Skeleton } from "@/components/skeleton";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  link: "That sign-in link is invalid or has expired. Open it in the same browser you signed up in, or request a new one.",
  google: "Google sign-in isn't available right now. Use email and password, or try again later.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthShell title="Welcome" description="Sign in or create an account to track your PSX portfolio.">
      <Suspense fallback={<Skeleton className="h-80" />}>
        <LoginFormWithParams searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function LoginFormWithParams({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "";
  const errorKey = typeof params.error === "string" ? params.error : "";
  return <LoginForm next={next} initialError={ERRORS[errorKey]} />;
}
