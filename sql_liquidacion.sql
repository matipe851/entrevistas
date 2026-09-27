-- ============================================================
--  Módulo 2 · Administración de personal
--  Área 5 · Liquidación de sueldos
--  Una fila por empleado, período y tipo (mensual, 1.ª/2.ª quincena, SAC).
--  Los datos cargados y los renglones del recibo se guardan como JSON.
--  Correr una sola vez en el SQL Editor de Supabase.
-- ============================================================

create table if not exists public.payrolls (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.employees(id) on delete cascade,
  period          text not null,                          -- 'AAAA-MM'
  kind            text not null default 'mensual' check (kind in ('mensual','quincena1','quincena2','sac')),
  inputs          jsonb not null default '{}'::jsonb,     -- lo cargado en el formulario
  lines           jsonb not null default '[]'::jsonb,     -- renglones del recibo
  gross_rem       numeric(14,2) not null default 0,       -- total remunerativo
  gross_norem     numeric(14,2) not null default 0,       -- total no remunerativo
  deductions      numeric(14,2) not null default 0,       -- aportes, embargos y descuentos
  net             numeric(14,2) not null default 0,       -- neto a cobrar
  status          text not null default 'liquidada',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (employee_id, period, kind)
);

create index if not exists payrolls_employee_idx on public.payrolls (employee_id);
create index if not exists payrolls_period_idx   on public.payrolls (period);

alter table public.payrolls enable row level security;

-- Mismo criterio que el resto del módulo: sólo usuarios autenticados y aprobados.
drop policy if exists "payrolls_select" on public.payrolls;
create policy "payrolls_select" on public.payrolls
  for select to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved));

drop policy if exists "payrolls_insert" on public.payrolls;
create policy "payrolls_insert" on public.payrolls
  for insert to authenticated with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved));

drop policy if exists "payrolls_update" on public.payrolls;
create policy "payrolls_update" on public.payrolls
  for update to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved)) with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved));

drop policy if exists "payrolls_delete" on public.payrolls;
create policy "payrolls_delete" on public.payrolls
  for delete to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved));
