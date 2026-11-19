#!/usr/bin/env node
// Legt einen der beiden Haushalts-Accounts an (R1). Es gibt keine öffentliche Registrierung.
//
//   node --env-file=.env.local scripts/create-user.mjs --email <mail> --name <Anzeigename> [--household <Name>]
//
// Das Passwort wird abgefragt und nirgends gespeichert. Braucht SUPABASE_SECRET_KEY in .env.local.
import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";

const MAX_PROFILES = 2;

const { values } = parseArgs({
  options: { email: { type: "string" }, name: { type: "string" }, household: { type: "string" } },
});
if (!values.email || !values.name) {
  console.error("Aufruf: node --env-file=.env.local scripts/create-user.mjs --email <mail> --name <Anzeigename> [--household <Name>]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SECRET_KEY müssen in .env.local stehen.");
  process.exit(1);
}

function askHidden(question) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    stdout.write(question);
    let input = "";
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (char) => {
      if (char === "\u0003") process.exit(130);
      if (char === "\r" || char === "\n") {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.off("data", onData);
        stdout.write("\n");
        resolve(input);
      } else if (char === "\u007f") {
        input = input.slice(0, -1);
      } else {
        input += char;
      }
    };
    stdin.on("data", onData);
  });
}

const supabase = createClient(url, secretKey, { auth: { persistSession: false } });

const { data: households, error: householdError } = await supabase.from("household").select("id, name");
if (householdError) throw householdError;
if (households.length > 1) {
  console.error("Es gibt mehr als einen Haushalt. Bitte im Supabase-Dashboard prüfen.");
  process.exit(1);
}

let household = households[0];
if (household) {
  const { count } = await supabase.from("profile").select("id", { count: "exact", head: true }).eq("household_id", household.id);
  if ((count ?? 0) >= MAX_PROFILES) {
    console.error(`Der Haushalt hat bereits ${MAX_PROFILES} Accounts.`);
    process.exit(1);
  }
}

// Gleiche Regeln wie in supabase/config.toml (auth.password_requirements).
const password = await askHidden("Passwort (mind. 8 Zeichen, Groß- und Kleinbuchstaben, Zahl, Sonderzeichen): ");
if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
  console.error("Das Passwort erfüllt die Regeln nicht: mind. 8 Zeichen, Groß- und Kleinbuchstaben, eine Zahl und ein Sonderzeichen.");
  process.exit(1);
}

if (!household) {
  const { data, error } = await supabase.from("household").insert({ name: values.household ?? "Haushalt" }).select("id, name").single();
  if (error) throw error;
  household = data;
  console.log(`Haushalt „${household.name}“ angelegt.`);
}

const { data: created, error: userError } = await supabase.auth.admin.createUser({
  email: values.email,
  password,
  email_confirm: true,
});
if (userError) {
  console.error(`Account konnte nicht angelegt werden: ${userError.message}`);
  process.exit(1);
}

const { error: profileError } = await supabase
  .from("profile")
  .insert({ id: created.user.id, household_id: household.id, display_name: values.name });
if (profileError) {
  await supabase.auth.admin.deleteUser(created.user.id);
  console.error(`Profil konnte nicht angelegt werden: ${profileError.message}`);
  process.exit(1);
}

console.log(`Account für ${values.name} angelegt und dem Haushalt „${household.name}“ zugeordnet.`);
