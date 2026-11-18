-- Vorläufige Buchungen können auch durch eine geänderte Vormerkung ersetzt werden (R7a), der
-- Status kommt deshalb aus der Datei. Der Aufräumlauf (R25) hält die Anzahl je Import aktuell.

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
      kind = u ->> 'kind',
      refund_of = (u ->> 'refund_of')::uuid,
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

create or replace function private.delete_old_transactions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_imports uuid[];
begin
  with deleted as (
    delete from public.transaction
    where booking_date < (current_date - interval '24 months')::date
    returning import_id
  )
  select count(*), array_agg(distinct import_id) into v_count, v_imports from deleted;

  -- Eigene Anweisung, damit die Zählung den Stand nach dem Löschen sieht.
  update public.import i
  set transaction_count = (select count(*) from public.transaction t where t.import_id = i.id)
  where i.id = any (v_imports);

  return v_count;
end;
$$;
