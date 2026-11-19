-- Etappe 2: KI-Bewertung (R8–R12). Kategorien, Regeln je Gegenpartei und die Bewertung an der
-- Buchung. Die Bewertungsspalten fasst commit_import nicht an, beim Wechsel vorgemerkt → gebucht
-- bleibt die Bewertung deshalb erhalten (R7a).

-- Kategorien (R12) -------------------------------------------------------------------

create table public.category (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default private.current_household_id()
    references public.household (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index category_household_name_idx on public.category (household_id, lower(name));

alter table public.category enable row level security;

create policy category_all on public.category for all to authenticated
  using (household_id = (select private.current_household_id()))
  with check (household_id = (select private.current_household_id()));

-- Startliste für jeden Haushalt, auch für künftige.
create function private.seed_default_categories(p_household_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.category (household_id, name, is_default)
  select p_household_id, name, true
  from unnest(array[
    'Wohnen', 'Energie', 'Versicherungen', 'Mobilität', 'Lebensmittel', 'Abos & Medien',
    'Kommunikation', 'Kinder', 'Gesundheit', 'Freizeit', 'Essen gehen', 'Kleidung', 'Haushalt',
    'Sparen', 'Sonstiges'
  ]) as name
  on conflict do nothing;
$$;

revoke execute on function private.seed_default_categories(uuid) from public, anon, authenticated;

create function private.seed_default_categories_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_default_categories(new.id);
  return new;
end;
$$;

create trigger household_seed_categories
  after insert on public.household
  for each row execute function private.seed_default_categories_trigger();

select private.seed_default_categories(id) from public.household;

-- Regeln je Gegenpartei (R11) ---------------------------------------------------------

create table public.merchant_rule (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default private.current_household_id()
    references public.household (id) on delete cascade,
  -- Normalisierte Gegenpartei, siehe counterpartyKey() in src/lib/rating/rules.ts.
  counterparty_key text not null check (length(counterparty_key) > 0),
  -- Anzeigename, wie er beim Anlegen in der Buchung stand.
  counterparty_label text not null,
  kind text not null check (kind in ('expense', 'income', 'refund')),
  category_id uuid references public.category (id) on delete set null,
  necessity text check (necessity in ('must', 'should', 'could', 'dispensable')),
  urgency text check (urgency in ('immediate', 'could_wait', 'impulse')),
  created_by uuid references public.profile (id) on delete set null,
  updated_by uuid references public.profile (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, counterparty_key)
);

create trigger merchant_rule_touch_updated_at
  before update on public.merchant_rule
  for each row execute function private.touch_updated_at();

alter table public.merchant_rule enable row level security;

create policy merchant_rule_all on public.merchant_rule for all to authenticated
  using (household_id = (select private.current_household_id()))
  with check (household_id = (select private.current_household_id()));

-- Bewertung an der Buchung (R9, R10) --------------------------------------------------

alter table public.transaction
  add column category_id uuid references public.category (id) on delete set null,
  add column necessity text check (necessity in ('must', 'should', 'could', 'dispensable')),
  add column urgency text check (urgency in ('immediate', 'could_wait', 'impulse')),
  add column ai_reason text,
  add column review_status text not null default 'unrated'
    check (review_status in ('unrated', 'suggested', 'confirmed')),
  add column rating_source text check (rating_source in ('rule', 'ai', 'manual'));

create index transaction_review_idx on public.transaction (household_id, review_status)
  where review_status <> 'confirmed';
create index transaction_category_idx on public.transaction (category_id);

-- Kategorie und Regel müssen zum selben Haushalt gehören wie die Zeile, die auf sie zeigt.
create function private.check_category_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.category c where c.id = new.category_id and c.household_id = new.household_id
  ) then
    raise exception 'Kategorie gehört zu einem anderen Haushalt';
  end if;
  return new;
end;
$$;

create trigger transaction_check_category
  before insert or update of category_id on public.transaction
  for each row execute function private.check_category_household();

create trigger merchant_rule_check_category
  before insert or update of category_id on public.merchant_rule
  for each row execute function private.check_category_household();

-- Alle Daten löschen (R25) nimmt jetzt auch Regeln und eigene Kategorien mit. ----------

create or replace function public.delete_all_household_data()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.account where household_id = (select private.current_household_id());
  delete from public.merchant_rule where household_id = (select private.current_household_id());
  delete from public.category
  where household_id = (select private.current_household_id()) and not is_default;
end;
$$;
