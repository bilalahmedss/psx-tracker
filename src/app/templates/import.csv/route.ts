import { TEMPLATE_CSV } from "@/lib/csv/import";

// The CSV import template, with one example row per type.
export function GET() {
  return new Response(TEMPLATE_CSV, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="psx-tracker-import-template.csv"',
    },
  });
}
