-- ============================================================
--  Módulo 2 · Administración de personal
--  Área 12 · Off boarding (proceso de egreso)
--  Una fila por empleado. El checklist, la liquidación y la
--  entrevista de salida se guardan como JSON en la misma fila.
--  Correr una sola vez en el SQL Editor de Supabase.
-- ============================================================

create table if not exists public.offboarding (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null unique references public.employees(id) on delete cascade,
  status            text not null default 'en_curso' check (status in ('en_curso','completado')),
  reason            text,          -- motivo de la desvinculación
  termination_date  date,          -- fecha de egreso
  last_day          date,          -- último día efectivamente trabajado
  notice_date       date,          -- fecha en que se notificó el preaviso
  tasks             jsonb not null default '{}'::jsonb,   -- { clave: {done, date, note} }
  settlement        jsonb not null default '{}'::jsonb,   -- { concepto: importe }
  exit_interview    jsonb not null default '{}'::jsonb,   -- { date, recommend, real_reason, comments }
  notes             text,
  created_at        timestamptz not null default now()
);

create index if not exists offboarding_employee_idx on public.offboarding (employee_id);
create index if not exists offboarding_status_idx   on public.offboarding (status);

alter table public.offboarding enable row level security;

-- Mismo criterio que el resto del módulo: sólo usuarios autenticados.
drop policy if exists "offboarding_select" on public.offboarding;
create policy "offboarding_select" on public.offboarding
  for select to authenticated using (true);

drop policy if exists "offboarding_insert" on public.offboarding;
create policy "offboarding_insert" on public.offboarding
  for insert to authenticated with check (true);

drop policy if exists "offboarding_update" on public.offboarding;
create policy "offboarding_update" on public.offboarding
  for update to authenticated using (true) with check (true);

drop policy if exists "offboarding_delete" on public.offboarding;
create policy "offboarding_delete" on public.offboarding
  for delete to authenticated using (true);
