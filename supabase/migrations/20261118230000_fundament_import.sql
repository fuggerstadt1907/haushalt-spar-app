-- Etappe 1: Haushalt, Profile, Konten, Imports, Buchungen (R1–R7a, R25)

create schema if not exists private;

-- Haushalt & Profile (R1) ------------------------------------------------------

create table public.household (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profile (
  id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references public.household (id) on delete restrict,
  display_name text not null,
  created_at timestamptz not null default now()
);

create index profile_household_idx on public.profile (household_id);

-- Haushalt des angemeldeten Users. security definer, damit die RLS-Policies von
-- profile nicht rekursiv auf sich selbst zugreifen.
create function private.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select household_id from public.profile where id = (select auth.uid())
$$;

grant usage on schema private to authenticated;
grant execute on function private.current_household_id() to authenticated;

-- Konten (R2) ------------------------------------------------------------------

create table public.account (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default private.current_household_id()
    references public.household (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  type text not null check (type in ('giro', 'credit_card')),
  -- Nur für die Erkennung von Umbuchungen, verlässt nie den Server.
  iban text check (iban is null or iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  created_by uuid references public.profile (id) on delete set null,
  created_at timestamptz not null default now()
);

create index account_household_idx on public.account (household_id);
create unique index account_household_iban_key on public.account (household_id, iban)
  where iban is not null;

-- Imports (R3–R5) --------------------------------------------------------------

create table public.import (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default private.current_household_id()
    references public.household (id) on delete cascade,
  account_id uuid not null references public.account (id) on delete cascade,
  source text not null default 'upload' check (source in ('upload', 'fints', 'enable_banking')),
  format text not null,
  period_from date not null,
  period_to date not null,
  opening_balance_cents bigint,
  closing_balance_cents bigint,
  transaction_count integer not null default 0,
  created_by uuid references public.profile (id) on delete set null,
  created_at timestamptz not null default now()
);

create index import_household_idx on public.import (household_id);
create index import_account_idx on public.import (account_id);

-- Buchungen (R3, R6, R7, R7a) --------------------------------------------------

create table public.transaction (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default private.current_household_id()
    references public.household (id) on delete cascade,
  account_id uuid not null references public.account (id) on delete cascade,
  import_id uuid not null references public.import (id) on delete cascade,
  booking_date date not null,
  value_date date,
  booking_status text not null check (booking_status in ('booked', 'pending')),
  -- Vorzeichen: negativ = Abfluss, positiv = Zufluss. Immer EUR.
  amount_cents bigint not null,
  original_amount_cents bigint,
  original_currency text,
  counterparty text,
  -- Nur für die Erkennung von Umbuchungen, verlässt nie den Server.
  counterparty_iban text,
  purpose text,
  booking_text text,
  creditor_id text,
  mandate_reference text,
  bank_reference text,
  merchant_category_code text,
  dedupe_hash text not null,
  kind text not null check (kind in ('expense', 'income', 'transfer', 'card_settlement', 'refund')),
  refund_of uuid references public.transaction (id) on delete set null,
  updated_by uuid references public.profile (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, dedupe_hash)
);

create index transaction_household_date_idx on public.transaction (household_id, booking_date desc);
create index transaction_account_date_idx on public.transaction (account_id, booking_date desc);
create index transaction_import_idx on public.transaction (import_id);
create index transaction_refund_of_idx on public.transaction (refund_of);
create index transaction_updated_by_idx on public.transaction (updated_by);
create index account_created_by_idx on public.account (created_by);
create index import_created_by_idx on public.import (created_by);

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger transaction_touch_updated_at
  before update on public.transaction
  for each row execute function private.touch_updated_at();

-- Row Level Security: nur Profile desselben Haushalts --------------------------

alter table public.household enable row level security;
alter table public.profile enable row level security;
alter table public.account enable row level security;
alter table public.import enable row level security;
alter table public.transaction enable row level security;

create policy household_select on public.household
  for select to authenticated
  using (id = (select private.current_household_id()));

create policy profile_select on public.profile
  for select to authenticated
  using (household_id = (select private.current_household_id()));

create policy profile_update_own on public.profile
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()) and household_id = (select private.current_household_id()));

create policy account_all on public.account
  for all to authenticated
  using (household_id = (select private.current_household_id()))
  with check (household_id = (select private.current_household_id()));

create policy import_all on public.import
  for all to authenticated
  using (household_id = (select private.current_household_id()))
  with check (household_id = (select private.current_household_id()));

create policy transaction_all on public.transaction
  for all to authenticated
  using (household_id = (select private.current_household_id()))
  with check (household_id = (select private.current_household_id()));

-- Konto, Import und Buchung müssen zum selben Haushalt gehören.
create function private.check_same_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'import' then
    if not exists (select 1 from public.account a where a.id = new.account_id and a.household_id = new.household_id) then
      raise exception 'Konto gehört nicht zum Haushalt';
    end if;
  elsif tg_table_name = 'transaction' then
    if not exists (
      select 1 from public.import i
      where i.id = new.import_id and i.account_id = new.account_id and i.household_id = new.household_id
    ) then
      raise exception 'Import gehört nicht zu Konto und Haushalt';
    end if;
  end if;
  return new;
end;
$$;

create trigger import_same_household
  before insert or update on public.import
  for each row execute function private.check_same_household();

create trigger transaction_same_household
  before insert or update on public.transaction
  for each row execute function private.check_same_household();

-- Import übernehmen (R4, R6, R7, R7a) ------------------------------------------
-- Die Vorschau wird in TypeScript berechnet. Diese Funktion schreibt das Ergebnis
-- atomar. security invoker: RLS gilt.
--
-- p_import:        { account_id, format, period_from, period_to, opening_balance_cents, closing_balance_cents }
-- p_inserts:       neue Buchungen (Spalten wie public.transaction, ohne id/import_id/household_id)
-- p_pending_updates: [{ id, ...Felder der gebuchten Buchung }] vorläufig → gebucht, gleiche Zeile
-- p_pending_deletes: ids vorläufiger Buchungen, die weder vorgemerkt noch gebucht wieder auftauchen
-- p_kind_updates:  [{ id, kind, refund_of }] bestehende Buchungen, deren Art sich durch den Import ändert
create function public.commit_import(
  p_import jsonb,
  p_inserts jsonb,
  p_pending_updates jsonb,
  p_pending_deletes uuid[],
  p_kind_updates jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_import_id uuid;
  v_user uuid := (select auth.uid());
  v_count integer;
begin
  insert into public.import (account_id, format, period_from, period_to,
    opening_balance_cents, closing_balance_cents, created_by)
  values (
    (p_import ->> 'account_id')::uuid,
    p_import ->> 'format',
    (p_import ->> 'period_from')::date,
    (p_import ->> 'period_to')::date,
    (p_import ->> 'opening_balance_cents')::bigint,
    (p_import ->> 'closing_balance_cents')::bigint,
    v_user
  )
  returning id into v_import_id;

  delete from public.transaction
  where id = any (p_pending_deletes)
    and booking_status = 'pending'
    and account_id = (p_import ->> 'account_id')::uuid;

  update public.transaction t
  set import_id = v_import_id,
      booking_status = 'booked',
      booking_date = (u ->> 'booking_date')::date,
      value_date = (u ->> 'value_date')::date,
      amount_cents = (u ->> 'amount_cents')::bigint,
      original_amount_cents = (u ->> 'original_amount_cents')::bigint,
      original_currency = u ->> 'original_currency',
      counterparty = u ->> 'counterparty',
      counterparty_iban = u ->> 'counterparty_iban',
      purpose = u ->> 'purpose',
      booking_text = u ->> 'booking_text',
      creditor_id = u ->> 'creditor_id',
      mandate_reference = u ->> 'mandate_reference',
      bank_reference = u ->> 'bank_reference',
      merchant_category_code = u ->> 'merchant_category_code',
      dedupe_hash = u ->> 'dedupe_hash',
      kind = u ->> 'kind',
      refund_of = (u ->> 'refund_of')::uuid,
      updated_by = v_user
  from jsonb_array_elements(p_pending_updates) as u
  where t.id = (u ->> 'id')::uuid
    and t.booking_status = 'pending'
    and t.account_id = (p_import ->> 'account_id')::uuid;

  insert into public.transaction (account_id, import_id, booking_date, value_date, booking_status,
    amount_cents, original_amount_cents, original_currency, counterparty, counterparty_iban, purpose,
    booking_text, creditor_id, mandate_reference, bank_reference, merchant_category_code, dedupe_hash,
    kind, refund_of, updated_by)
  select (p_import ->> 'account_id')::uuid, v_import_id,
    (r ->> 'booking_date')::date, (r ->> 'value_date')::date, r ->> 'booking_status',
    (r ->> 'amount_cents')::bigint, (r ->> 'original_amount_cents')::bigint, r ->> 'original_currency',
    r ->> 'counterparty', r ->> 'counterparty_iban', r ->> 'purpose', r ->> 'booking_text',
    r ->> 'creditor_id', r ->> 'mandate_reference', r ->> 'bank_reference',
    r ->> 'merchant_category_code', r ->> 'dedupe_hash', r ->> 'kind',
    (r ->> 'refund_of')::uuid, v_user
  from jsonb_array_elements(p_inserts) as r
  on conflict (account_id, dedupe_hash) do nothing;

  update public.transaction t
  set kind = u ->> 'kind',
      refund_of = (u ->> 'refund_of')::uuid,
      updated_by = v_user
  from jsonb_array_elements(p_kind_updates) as u
  where t.id = (u ->> 'id')::uuid;

  select count(*) into v_count from public.transaction where import_id = v_import_id;
  update public.import set transaction_count = v_count where id = v_import_id;

  return v_import_id;
end;
$$;

revoke execute on function public.commit_import(jsonb, jsonb, jsonb, uuid[], jsonb) from public, anon;
grant execute on function public.commit_import(jsonb, jsonb, jsonb, uuid[], jsonb) to authenticated;

-- Alle Daten löschen (R25). Haushalt und Profile bleiben, sonst ist kein Login mehr möglich.
create function public.delete_all_household_data()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.account where household_id = (select private.current_household_id());
end;
$$;

revoke execute on function public.delete_all_household_data() from public, anon;
grant execute on function public.delete_all_household_data() to authenticated;

-- Aufräumlauf (R25): Buchungen älter als 24 Monate --------------------------------

create function private.delete_old_transactions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.transaction
  where booking_date < (current_date - interval '24 months')::date;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function private.delete_old_transactions() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'delete-old-transactions',
  '15 3 * * *',
  $$select private.delete_old_transactions()$$
);
