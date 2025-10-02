-- 1) Spalte anlegen
alter table public.items
  add column if not exists rarity_id smallint references public.rarities(id);

-- 2) Bestehende Daten migrieren (falls items.rarity Text/Enum war)
-- Versuche Match gegen slug oder label
update public.items i
set rarity_id = r.id
from public.rarities r
where i.rarity_id is null
  and (i.rarity::text = r.slug or i.rarity::text = r.label);

-- 3) Pflichtfeld
alter table public.items
  alter column rarity_id set not null;

-- 4) (Optional) alte Spalte entfernen, wenn vorhanden
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'items' and column_name = 'rarity'
  ) then
    alter table public.items drop column rarity;
  end if;
end $$;

-- 5) RLS für rarities (reine Lookup-Tabelle)
alter table if exists public.rarities enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='rarities' and policyname='rarities_select_all'
  ) then
    create policy rarities_select_all on public.rarities for select using (true);
  end if;
end $$;
