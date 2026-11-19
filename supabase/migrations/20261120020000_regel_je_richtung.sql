-- Regeln je Gegenpartei und Richtung (R11): Eine Ausgabenregel gilt für Abflüsse, eine
-- Einnahmenregel für Zuflüsse. So kann das Finanzamt bei Steuererstattungen „Einnahme“ sein und
-- bei Steuerzahlungen eine Ausgabenkategorie haben, ohne dass die eine Regel die andere ersetzt.

alter table public.merchant_rule drop constraint merchant_rule_household_id_counterparty_key_key;
alter table public.merchant_rule drop constraint merchant_rule_kind_check;
alter table public.merchant_rule add constraint merchant_rule_kind_check check (kind in ('expense', 'income'));
alter table public.merchant_rule
  add constraint merchant_rule_household_key_kind_key unique (household_id, counterparty_key, kind);
