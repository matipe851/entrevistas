-- ============================================================
--  Módulo 3 · Clima y cultura
--  Área 1 · Encuestas de clima
--
--  Dos tablas:
--    climate_surveys    -> la encuesta (plantilla, preguntas, programación
--                          mensual/trimestral/anual y lista de destinatarios).
--    climate_responses  -> una fila por respuesta. ANÓNIMA: no guarda quién
--                          respondió, sólo la ronda, el área y las respuestas.
--
--  Correr una sola vez en el SQL Editor de Supabase.
-- ============================================================

create table if not exists public.climate_surveys (
  id             uuid primary key default gen_random_uuid(),
  owner          uuid not null default auth.uid(),
  title          text not null,
  template       text not null default 'gptw',   -- gptw | pulso | custom
  intro          text,
  questions      jsonb not null default '[]'::jsonb, -- [{id,dim,text,type}]
  scale          integer not null default 5,
  anonymous      boolean not null default true,
  ask_area       boolean not null default true,  -- pedir "Área / equipo" (para segmentar)
  status         text not null default 'borrador' check (status in ('borrador','activa','cerrada')),
  code           text unique,                    -- código del link público (?enc=CODIGO)
  frequency      text not null default 'unica' check (frequency in ('unica','mensual','trimestral','anual')),
  auto_send      boolean not null default false, -- si está en true, el cron la envía sola
  start_date     date,                           -- primer envío programado
  next_send_at   timestamptz,                    -- próximo envío (lo mueve el cron)
  last_sent_at   timestamptz,
  current_round  text,                           -- ronda vigente, ej: "2026-09"
  recipients     jsonb not null default '[]'::jsonb, -- [{email,name}]
  brand_name     text,
  brand_logo     text,                           -- logo de la empresa, para el mail de invitación
  created_at     timestamptz not null default now()
);

create index if not exists climate_surveys_owner_idx  on public.climate_surveys (owner);
create index if not exists climate_surveys_code_idx   on public.climate_surveys (code);
create index if not exists climate_surveys_next_idx   on public.climate_surveys (next_send_at);

create table if not exists public.climate_responses (
  id            uuid primary key default gen_random_uuid(),
  survey_id     uuid not null references public.climate_surveys(id) on delete cascade,
  round         text,                              -- ronda en la que se respondió
  area          text,                              -- área / equipo (opcional)
  answers       jsonb not null default '{}'::jsonb,-- { id_pregunta: valor }
  comments      text,
  submitted_at  timestamptz not null default now()
);

create index if not exists climate_responses_survey_idx on public.climate_responses (survey_id);
create index if not exists climate_responses_round_idx  on public.climate_responses (survey_id, round);

alter table public.climate_surveys   enable row level security;
alter table public.climate_responses enable row level security;

-- Mismo criterio que el resto de la app: sólo usuarios autenticados.
-- Las respuestas de los empleados entran por /api/encuesta (service role),
-- así que no hace falta ninguna política pública.
drop policy if exists "climate_surveys_select" on public.climate_surveys;
create policy "climate_surveys_select" on public.climate_surveys
  for select to authenticated using (true);

drop policy if exists "climate_surveys_insert" on public.climate_surveys;
create policy "climate_surveys_insert" on public.climate_surveys
  for insert to authenticated with check (true);

drop policy if exists "climate_surveys_update" on public.climate_surveys;
create policy "climate_surveys_update" on public.climate_surveys
  for update to authenticated using (true) with check (true);

drop policy if exists "climate_surveys_delete" on public.climate_surveys;
create policy "climate_surveys_delete" on public.climate_surveys
  for delete to authenticated using (true);

drop policy if exists "climate_responses_select" on public.climate_responses;
create policy "climate_responses_select" on public.climate_responses
  for select to authenticated using (true);

drop policy if exists "climate_responses_insert" on public.climate_responses;
create policy "climate_responses_insert" on public.climate_responses
  for insert to authenticated with check (true);

drop policy if exists "climate_responses_delete" on public.climate_responses;
create policy "climate_responses_delete" on public.climate_responses
  for delete to authenticated using (true);
