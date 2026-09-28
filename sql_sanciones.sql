-- ============================================================
--  Módulo 2 · Área 13 · Sanciones disciplinarias (v40.5)
--  + dueño (owner) en las tablas de Liquidación, como el resto de las tablas.
--  Correr una sola vez en el SQL Editor de Supabase.
-- ============================================================
create table if not exists public.sanctions (
  id             uuid primary key default gen_random_uuid(),
  owner          uuid default auth.uid(),
  employee_id    uuid not null references public.employees(id) on delete cascade,
  type           text not null check (type in ('llamado','apercibimiento','suspension')),
  incident_date  date not null,
  notified_date  date,
  start_date     date,           -- suspensión: desde
  end_date       date,           -- suspensión: hasta
  days           integer,        -- suspensión: días sin goce
  facts          text,
  text           text,           -- nota notificada
  doc_id         uuid,           -- documento en hr_documents (PDF firmado)
  created_at     timestamptz not null default now()
);
create index if not exists sanctions_employee_idx on public.sanctions (employee_id);
alter table public.sanctions enable row level security;
drop policy if exists "sanctions_own_all" on public.sanctions;
create policy "sanctions_own_all" on public.sanctions for all using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists "sanctions_rrhh" on public.sanctions;
create policy "sanctions_rrhh" on public.sanctions for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved));

alter table public.payrolls add column if not exists owner uuid default auth.uid();
alter table public.salary_scales add column if not exists owner uuid default auth.uid();
