"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { FormNotice } from "@/components/auth-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { commitImport, previewImport, type ImportPreview } from "./actions";

export function ImportFlow({ portfolioId }: { portfolioId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onFile = (file: File | undefined) => {
    setError(null);
    setPreview(null);
    if (!file) return;
    if (file.size > 1_000_000) {
      setError("File is larger than 1 MB. Split it into smaller files.");
      return;
    }
    setFileName(file.name);
    file.text().then((t) => {
      setText(t);
      start(async () => setPreview(await previewImport(portfolioId, t)));
    });
  };

  const total = preview ? preview.counts.trades + preview.counts.dividends + preview.counts.cash : 0;
  const canImport = preview && !preview.fatal && preview.errorCount === 0 && !preview.oversell && total > 0;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>1. Choose a CSV file</CardTitle>
          <CardDescription>
            Start from the{" "}
            <a href="/templates/import.csv" download className="font-medium text-foreground underline underline-offset-4">
              import template
            </a>
            . Rows can be buys, sells, dividends, deposits or withdrawals. Blank commission and sales tax are filled from this
            portfolio&apos;s fee profile; blank dividend tax uses 15% (filer) or 30% (non-filer) for that date. Dates can be YYYY-MM-DD or
            DD/MM/YYYY.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" id="csv-file" onChange={(e) => onFile(e.target.files?.[0])} />
          <label htmlFor="csv-file" className={buttonVariants({ variant: "outline" })}>
            {fileName ? "Choose another file" : "Choose file"}
          </label>
          <span className="text-sm text-muted-foreground">{fileName || "No file chosen"}</span>
          {pending && !preview ? <span className="text-sm text-muted-foreground">Checking…</span> : null}
        </CardContent>
      </Card>

      <FormNotice error={error ?? preview?.fatal ?? undefined} />

      {preview && !preview.fatal ? (
        <Card>
          <CardHeader>
            <CardTitle>2. Review</CardTitle>
            <CardDescription>
              {preview.rows.length} rows: {preview.counts.trades} trades, {preview.counts.dividends} dividends, {preview.counts.cash} cash entries
              {preview.errorCount ? `, ${preview.errorCount} with errors` : ""}. Nothing is saved until you confirm.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {preview.oversell ? <FormNotice error={preview.oversell} /> : null}
            <div className="max-h-[28rem] overflow-auto rounded-lg border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Line</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Symbol</th>
                    <th className="px-3 py-2 font-medium">Details</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.line} className={r.error ? "border-t bg-destructive/5" : "border-t"}>
                      <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{r.line}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{r.date}</td>
                      <td className="px-3 py-1.5">{r.type}</td>
                      <td className="px-3 py-1.5 font-medium">{r.symbol}</td>
                      <td className="px-3 py-1.5 text-muted-foreground money">{r.summary}</td>
                      <td className={r.error ? "px-3 py-1.5 text-destructive" : "px-3 py-1.5 text-emerald-700 dark:text-emerald-400"}>{r.error ?? "OK"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap justify-end gap-3">
              <Link href={`/portfolios/${portfolioId}`} className={buttonVariants({ variant: "ghost" })}>
                Cancel
              </Link>
              <Button
                type="button"
                disabled={!canImport || pending}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const r = await commitImport(portfolioId, text!);
                    if (!r.ok) setError(r.error);
                    else router.push(`/portfolios/${portfolioId}/history?imported=${r.counts.trades + r.counts.dividends + r.counts.cash}`);
                  })
                }
              >
                {pending ? "Importing…" : canImport ? `Import ${total} rows` : "Fix errors to import"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
