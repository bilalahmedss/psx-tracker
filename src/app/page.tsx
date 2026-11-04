import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>PSX Tracker</CardTitle>
          <CardDescription>Project set up. Milestone 1 starts here.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Run <code>npm run check:supabase</code> to confirm your Supabase keys.
        </CardContent>
      </Card>
    </main>
  );
}
