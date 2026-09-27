-- ============================================================
--  Liquidación de sueldos · ampliación (v40.1)
--  1) Recibo archivado en Documentación  2) Costo laboral
--  3) Escalas salariales por convenio y categoría (paritarias)
--  Correr una sola vez en el SQL Editor de Supabase (después de sql_liquidacion.sql).
-- ============================================================

alter table public.payrolls add column if not exists doc_id uuid;              -- documento en hr_documents (tipo recibo)
alter table public.payrolls add column if not exists employer_cost numeric(14,2); -- costo laboral del empleador

create table if not exists public.salary_scales (
  id          uuid primary key default gen_random_uuid(),
  agreement   text not null,                    -- convenio, igual que en el legajo (ej.: Comercio (CCT 130/75))
  category    text not null,                    -- categoría, igual que en el legajo
  basic       numeric(14,2) not null default 0, -- básico mensual de la escala
  no_rem      numeric(14,2) not null default 0, -- suma no remunerativa del convenio
  valid_from  date not null,                    -- vigencia desde
  notes       text,
  created_at  timestamptz not null default now(),
  unique (agreement, category, valid_from)
);
create index if not exists salary_scales_agreement_idx on public.salary_scales (agreement);

alter table public.salary_scales enable row level security;
drop policy if exists "salary_scales_select" on public.salary_scales;
create policy "salary_scales_select" on public.salary_scales for select to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved));
drop policy if exists "salary_scales_insert" on public.salary_scales;
create policy "salary_scales_insert" on public.salary_scales for insert to authenticated with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved));
drop policy if exists "salary_scales_update" on public.salary_scales;
create policy "salary_scales_update" on public.salary_scales for update to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved)) with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved));
drop policy if exists "salary_scales_delete" on public.salary_scales;
create policy "salary_scales_delete" on public.salary_scales for delete to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved));
