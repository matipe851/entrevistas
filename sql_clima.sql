-- ============================================================
--  Módulo 3 · Clima y cultura
--  Áreas 3, 4, 5 y 6
--
--  El área 1 (Encuestas de clima) usa sql_encuestas.sql y el área 2
--  (eNPS y satisfacción) no tiene tablas propias: lee las respuestas
--  de las encuestas. Este archivo agrega las cuatro tablas que faltan
--  y las columnas que las vinculan entre sí:
--
--    culture_values -> los valores de la empresa (área 4).
--    recognitions   -> feedback y reconocimientos (área 3). Cada uno
--                      puede colgar de un valor (value_id) y de un
--                      empleado del legajo (to_employee_id).
--    action_plans   -> planes de acción (área 5). Guardan de dónde
--                      salieron: encuesta (survey_id) y dimensión.
--    announcements  -> comunicación interna (área 6). Guardan a qué
--                      cosa refieren (related_type / related_id).
--
--  Correr una sola vez en el SQL Editor de Supabase, después de
--  sql_encuestas.sql.
-- ============================================================

/* ---------- Área 4 · Valores y cultura ---------- */
create table if not exists public.culture_values (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null default auth.uid(),
  name         text not null,
  description  text,
  behaviors    jsonb not null default '[]'::jsonb,  -- conductas observables: ["Avisa a tiempo", ...]
  color        text,                                -- var(--teal), var(--green), …
  sort         integer not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists culture_values_owner_idx on public.culture_values (owner);

/* ---------- Área 3 · Feedback y reconocimiento ---------- */
create table if not exists public.recognitions (
  id              uuid primary key default gen_random_uuid(),
  owner           uuid not null default auth.uid(),
  kind            text not null default 'reconocimiento'
                  check (kind in ('reconocimiento','felicitacion','feedback','idea')),
  to_employee_id  uuid,                                -- id del empleado en el legajo (Módulo 2)
  to_name         text,                                -- copia del nombre, por si se borra el legajo
  from_name       text,                                -- quién lo escribe (puede ser anónimo)
  value_id        uuid references public.culture_values(id) on delete set null, -- valor (área 4)
  message         text not null,
  visibility      text not null default 'publico' check (visibility in ('publico','privado')),
  status          text not null default 'nuevo' check (status in ('nuevo','archivado')),
  created_at      timestamptz not null default now()
);
create index if not exists recognitions_owner_idx on public.recognitions (owner);
create index if not exists recognitions_emp_idx   on public.recognitions (to_employee_id);
create index if not exists recognitions_value_idx on public.recognitions (value_id);

/* ---------- Área 5 · Planes de acción ---------- */
create table if not exists public.action_plans (
  id                uuid primary key default gen_random_uuid(),
  owner             uuid not null default auth.uid(),
  title             text not null,
  description       text,
  source            text not null default 'manual'
                    check (source in ('manual','encuesta','enps','valores','feedback')),
  survey_id         uuid references public.climate_surveys(id) on delete set null, -- encuesta de origen (área 1)
  survey_title      text,
  dimension         text,                              -- credibilidad | respeto | … | valores
  area              text,                              -- área o equipo alcanzado
  responsible_id    uuid,                              -- responsable: id del empleado en el legajo
  responsible_name  text,
  priority          text not null default 'media' check (priority in ('alta','media','baja')),
  status            text not null default 'propuesto'
                    check (status in ('propuesto','en_curso','hecho','cancelado')),
  start_date        date,
  due_date          date,
  tasks             jsonb not null default '[]'::jsonb, -- [{id,text,done}]
  result            text,                               -- qué pasó después (impacto)
  created_at        timestamptz not null default now()
);
create index if not exists action_plans_owner_idx  on public.action_plans (owner);
create index if not exists action_plans_survey_idx on public.action_plans (survey_id);

/* ---------- Área 6 · Comunicación interna ---------- */
create table if not exists public.announcements (
  id             uuid primary key default gen_random_uuid(),
  owner          uuid not null default auth.uid(),
  title          text not null,
  body           text,
  category       text not null default 'novedad'
                 check (category in ('novedad','resultado','plan','valores','evento')),
  status         text not null default 'borrador' check (status in ('borrador','publicado')),
  recipients     jsonb not null default '[]'::jsonb,  -- [{email}]
  related_type   text,                                 -- encuesta | plan | valor | reconocimiento
  related_id     uuid,
  related_label  text,
  pinned         boolean not null default false,
  sent_at        timestamptz,
  sent_count     integer not null default 0,
  brand_name     text,
  brand_logo     text,
  created_at     timestamptz not null default now()
);
create index if not exists announcements_owner_idx on public.announcements (owner);

/* ---------- Seguridad (mismo criterio que el resto de la app) ----------
   Sólo usuarios autenticados. El envío de los anuncios por mail entra por
   /api/encuesta (service role), así que no hace falta política pública. */
alter table public.culture_values enable row level security;
alter table public.recognitions   enable row level security;
alter table public.action_plans   enable row level security;
alter table public.announcements  enable row level security;

do $$
declare
  t text;
  -- Sólo el usuario de la consultora aprobado. El del mentor se registra
  -- solo y NO puede ver nada de RR.HH.
  REGLA_RRHH constant text := 'exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved)';
begin
  foreach t in array array['culture_values','recognitions','action_plans','announcements'] loop
    execute format('drop policy if exists "%1$s_select" on public.%1$I', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (%2$s)', t, REGLA_RRHH);
    execute format('drop policy if exists "%1$s_insert" on public.%1$I', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (%2$s)', t, REGLA_RRHH);
    execute format('drop policy if exists "%1$s_update" on public.%1$I', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (%2$s) with check (%2$s)', t, REGLA_RRHH);
    execute format('drop policy if exists "%1$s_delete" on public.%1$I', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (%2$s)', t, REGLA_RRHH);
  end loop;
end $$;
