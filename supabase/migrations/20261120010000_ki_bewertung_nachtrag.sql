-- Etappe 2, Nachtrag aus dem Review:
-- 1. Namen, die vor jedem KI-Aufruf entfernt werden (R8), z. B. die vollen Namen im Haushalt.
-- 2. Die Startkategorien sind fest (R12), auch per RLS.
-- 3. Vorgemerkt → gebucht behält eine von Hand oder per Regel bestimmte Art (R7a, R11).

-- 1. Namensliste ----------------------------------------------------------------------

create table public.private_name (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default private.current_household_id()
    references public.household (id) on delete cascade,
  name text not null check (length(trim(name)) >= 2),
  created_by uuid references public.profile (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index private_name_household_name_idx on public.private_name (household_id, lower(name));

alter table public.private_name enable row level security;

create policy private_name_all on public.private_name for all to authenticated
  using (household_id = (select private.current_household_id()))
  with check (household_id = (select private.current_household_id()));

-- 2. Startkategorien schützen ----------------------------------------------------------

drop policy category_all on public.category;

create policy category_select on public.category for select to authenticated
  using (household_id = (select private.current_household_id()));

create policy category_insert on public.category for insert to authenticated
  with check (household_id = (select private.current_household_id()) and not is_default);

create policy category_update on public.category for update to authenticated
  using (household_id = (select private.current_household_id()) and not is_default)
  with check (household_id = (select private.current_household_id()) and not is_default);

create policy category_delete on public.category for delete to authenticated
  using (household_id = (select private.current_household_id()) and not is_default);

-- 3. commit_import ---------------------------------------------------------------------

create or replace function public.commit_import(
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
      booking_status = coalesce(u ->> 'booking_status', 'booked'),
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
      -- Von Hand oder per Regel bestimmte Art bleibt erhalten (z. B. Erstattung → Einnahme).
      kind = case when t.review_status = 'confirmed' and t.rating_source in ('rule', 'manual')
        then t.kind else u ->> 'kind' end,
      refund_of = case when t.review_status = 'confirmed' and t.rating_source in ('rule', 'manual')
        then t.refund_of else (u ->> 'refund_of')::uuid end,
      updated_by = v_user
  from jsonb_array_elements(p_pending_updates) as u
  where t.id = (u ->> 'id')::uuid
    and t.booking_status = 'pending'
    and t.account_id = (p_import ->> 'account_id')::uuid;

  insert into public.transaction (id, account_id, import_id, booking_date, value_date, booking_status,
    amount_cents, original_amount_cents, original_currency, counterparty, counterparty_iban, purpose,
    booking_text, creditor_id, mandate_reference, bank_reference, merchant_category_code, dedupe_hash,
    kind, refund_of, updated_by)
  select coalesce((r ->> 'id')::uuid, gen_random_uuid()), (p_import ->> 'account_id')::uuid, v_import_id,
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

-- Alle Daten löschen (R25) nimmt auch die Namensliste mit.
create or replace function public.delete_all_household_data()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.account where household_id = (select private.current_household_id());
  delete from public.merchant_rule where household_id = (select private.current_household_id());
  delete from public.private_name where household_id = (select private.current_household_id());
  delete from public.category
  where household_id = (select private.current_household_id()) and not is_default;
end;
$$;
