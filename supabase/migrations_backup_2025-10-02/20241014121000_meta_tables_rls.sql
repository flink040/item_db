-- Ensure lookup tables expose metadata for read-only access
alter table if exists public.item_types enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'item_types'
      and policyname = 'item_types_select_all'
  ) then
    create policy item_types_select_all on public.item_types for select using (true);
  end if;
end $$;

alter table if exists public.materials enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'materials'
      and policyname = 'materials_select_all'
  ) then
    create policy materials_select_all on public.materials for select using (true);
  end if;
end $$;
