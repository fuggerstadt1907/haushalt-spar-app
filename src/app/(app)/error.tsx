"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Alert variant="destructive" className="max-w-xl">
      <AlertTitle>Da ist etwas schiefgegangen.</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{error.message || "Unbekannter Fehler."}</p>
        <Button variant="outline" size="sm" onClick={reset}>
          Erneut versuchen
        </Button>
      </AlertDescription>
    </Alert>
  );
}
