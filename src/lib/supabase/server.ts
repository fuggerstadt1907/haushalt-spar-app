import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

/** Supabase-Client mit der Session des angemeldeten Users. RLS gilt. */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // In Server Components nicht erlaubt. Der Proxy erneuert die Session.
        }
      },
    },
  });
}
