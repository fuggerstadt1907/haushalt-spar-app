import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Angemeldeter User samt Profil und Haushalt. Jede Seite und jede Server-Action geht hierüber,
 * die eigentliche Absicherung macht RLS in der Datenbank.
 */
export const requireProfile = cache(async () => {
  // Immer pro Request. Der Supabase-Client nutzt intern Date.now(), das darf nicht vorgerendert werden.
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profile")
    .select("id, display_name, household_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!profile) {
    throw new Error("Diesem Login ist kein Haushalt zugeordnet. Siehe README, Abschnitt „Accounts anlegen“.");
  }
  return { supabase, profile };
});
