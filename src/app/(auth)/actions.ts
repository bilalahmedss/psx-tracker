"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/auth";
import { HOME_PATH, safeNext } from "@/lib/safe-redirect";

export type AuthState = { error?: string; message?: string } | undefined;

const email = z.email("Enter a valid email address").trim().toLowerCase();
const password = z.string().min(8, "Password must be at least 8 characters").max(72, "Password is too long");

function field(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
}

export async function signIn(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const parsed = z.object({ email, password: z.string().min(1, "Enter your password") }).safeParse({
    email: field(fd, "email"),
    password: field(fd, "password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Confirm your email first. Check your inbox for the link." };
    }
    return { error: "Email or password is incorrect." };
  }
  redirect(safeNext(field(fd, "next")));
}

export async function signUp(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const parsed = z.object({ email, password }).safeParse({
    email: field(fd, "email"),
    password: field(fd, "password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const origin = await getOrigin();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext(field(fd, "next")))}` },
  });
  if (error) {
    if (error.code === "over_email_send_rate_limit") {
      return { error: "Too many emails sent. Wait a few minutes and try again." };
    }
    if (error.code === "weak_password") return { error: error.message };
    console.error("signUp failed", error.code);
    return { error: "Could not create the account. Try again." };
  }
  // Email confirmation off: signed in straight away.
  if (data.session) redirect(safeNext(field(fd, "next")));
  // Same message whether or not the address already has an account.
  return { message: "Check your email for a confirmation link to finish signing up." };
}

export async function signInWithGoogle(fd: FormData): Promise<void> {
  const supabase = await createClient();
  const origin = await getOrigin();
  const next = safeNext(field(fd, "next"));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect("/login?error=google");
  redirect(data.url);
}

export async function requestPasswordReset(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const parsed = email.safeParse(field(fd, "email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const origin = await getOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  if (error?.code === "over_email_send_rate_limit") {
    return { error: "Too many emails sent. Wait a few minutes and try again." };
  }
  // Don't reveal whether the address has an account.
  return { message: "If an account exists for that email, a reset link is on its way." };
}

export async function updatePassword(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const parsed = z
    .object({ password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "Passwords don't match" })
    .safeParse({ password: field(fd, "password"), confirm: field(fd, "confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return { error: "Choose a password different from your current one." };
    if (error.code === "weak_password") return { error: error.message };
    return { error: "Could not update the password. Request a new reset link and try again." };
  }
  redirect(HOME_PATH);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
