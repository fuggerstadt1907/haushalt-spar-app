import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden" };

/** Einziger öffentlicher Bereich. Eine Registrierung gibt es nicht (R1). */
export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Haushalt</h1>
          <p className="text-sm text-muted-foreground">Mit deinem Haushalts-Login anmelden.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
