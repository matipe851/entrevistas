-- ============================================================
--  Marca de la empresa (white-label por usuario)
--
--  Cada usuario carga las empresas con las que trabaja (nombre + logo) y
--  elige una al iniciar sesión. La marca activa se usa en toda la app y,
--  sobre todo, viaja en TODOS los mails que se mandan desde adentro.
--
--  Correr una sola vez en el SQL Editor de Supabase.
-- ============================================================

create table if not exists public.brands (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null default auth.uid(),
  name          text not null,
  logo_url      text,
  last_used_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists brands_owner_idx on public.brands (owner, last_used_at desc);

alter table public.brands enable row level security;

-- A diferencia del resto de la app, acá cada uno ve y edita SOLO sus empresas.
drop policy if exists "brands_select" on public.brands;
create policy "brands_select" on public.brands
  for select to authenticated using (owner = auth.uid());

drop policy if exists "brands_insert" on public.brands;
create policy "brands_insert" on public.brands
  for insert to authenticated with check (owner = auth.uid());

drop policy if exists "brands_update" on public.brands;
create policy "brands_update" on public.brands
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "brands_delete" on public.brands;
create policy "brands_delete" on public.brands
  for delete to authenticated using (owner = auth.uid());

-- Las encuestas de clima guardan también el logo, para que el mail de invitación
-- salga con la marca. (Si todavía no corriste sql_encuestas.sql, esto no hace nada
-- y la columna ya viene incluida cuando lo corras.)
alter table if exists public.climate_surveys add column if not exists brand_logo text;
