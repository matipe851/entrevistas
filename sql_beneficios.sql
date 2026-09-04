-- ============================================================
--  Módulo 2 · Administración de personal
--  Área 10 · Beneficios (carpeta con 5 subcarpetas)
--  Subcarpetas (columna "type"):
--    obra_social · prepaga · bonificaciones · corporativos · prestamos
--  Correr una sola vez en el SQL Editor de Supabase.
-- ============================================================

create table if not exists public.benefits (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        uuid not null references public.employees(id) on delete cascade,
  type               text not null check (type in ('obra_social','prepaga','bonificaciones','corporativos','prestamos')),
  status             text not null default 'activo' check (status in ('activo','pendiente','suspendido','finalizado')),
  title              text,
  provider           text,          -- obra social / prepaga / proveedor del beneficio
  plan               text,          -- plan o categoría
  member_id          text,          -- N° de afiliado o socio
  amount             numeric,       -- aporte, cuota, monto del bono o total del préstamo
  installment_amount numeric,       -- valor de cada cuota (préstamos)
  installments       integer default 0,   -- cantidad de cuotas (préstamos)
  installments_paid  integer default 0,   -- cuotas ya descontadas (préstamos)
  frequency          text default 'mensual',
  start_date         date,
  end_date           date,
  expiry_date        date,          -- vencimiento de credencial / convenio
  detail             text,
  file_url           text,
  file_name          text,
  created_at         timestamptz not null default now()
);

create index if not exists benefits_employee_idx on public.benefits (employee_id);
create index if not exists benefits_type_idx     on public.benefits (type);
create index if not exists benefits_expiry_idx   on public.benefits (expiry_date);

alter table public.benefits enable row level security;

-- Mismo criterio que el resto del módulo: sólo usuarios autenticados.
drop policy if exists "benefits_select" on public.benefits;
create policy "benefits_select" on public.benefits
  for select to authenticated using (true);

drop policy if exists "benefits_insert" on public.benefits;
create policy "benefits_insert" on public.benefits
  for insert to authenticated with check (true);

drop policy if exists "benefits_update" on public.benefits;
create policy "benefits_update" on public.benefits
  for update to authenticated using (true) with check (true);

drop policy if exists "benefits_delete" on public.benefits;
create policy "benefits_delete" on public.benefits
  for delete to authenticated using (true);
