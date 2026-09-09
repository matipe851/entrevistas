-- ============================================================
--  Mentor IA · Simulador de entrevistas para candidatos
--
--  Es el segundo producto de la web: entra por otra puerta, con su
--  propio usuario (una persona que busca trabajo), separado del
--  usuario de la consultora.
--
--  Dos tablas nuevas:
--    mentor_profiles -> quién es el candidato (se crea sola al entrar).
--    mentor_sessions -> cada simulacro con sus preguntas, respuestas
--                       transcriptas e informe.
--
--  Y una parte IMPORTANTE al final: cerrarle las tablas de la
--  consultora a los usuarios del mentor. Leela antes de correr.
--
--  Correr una sola vez en el SQL Editor de Supabase.
-- ============================================================

/* ---------- Quién es el candidato ---------- */
create table if not exists public.mentor_profiles (
  id           uuid primary key,               -- = auth.uid()
  email        text,
  full_name    text,
  target_role  text,                           -- el puesto que viene buscando
  created_at   timestamptz not null default now()
);

/* ---------- Cada simulacro ---------- */
create table if not exists public.mentor_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid(),
  email         text,
  position      text not null,                 -- puesto al que apunta
  company       text,
  level         text,                          -- junior | semi | senior
  job_desc      text,                          -- descripción del aviso (opcional)
  cv_text       text,                          -- texto extraído del CV (opcional)
  questions     jsonb not null default '[]'::jsonb,
  answers       jsonb not null default '[]'::jsonb,  -- [{id,text,transcript,seconds,fillers,...}]
  report        jsonb,                         -- el informe completo
  score         numeric,                       -- puntaje general, para el historial
  status        text not null default 'en_curso' check (status in ('en_curso','listo')),
  created_at    timestamptz not null default now()
);
create index if not exists mentor_sessions_user_idx on public.mentor_sessions (user_id, created_at desc);

/* ---------- Seguridad: cada candidato ve SÓLO lo suyo ----------
   Ojo que acá el criterio es distinto al de la consultora: en las
   tablas de RR.HH. cualquier usuario autenticado (de la empresa) puede
   leer todo, porque son compañeros de trabajo. Un candidato no puede
   ver el simulacro de otro candidato ni por casualidad. */
alter table public.mentor_profiles enable row level security;
alter table public.mentor_sessions enable row level security;

drop policy if exists "mentor_profiles_own" on public.mentor_profiles;
create policy "mentor_profiles_own" on public.mentor_profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "mentor_sessions_own" on public.mentor_sessions;
create policy "mentor_sessions_own" on public.mentor_sessions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ============================================================
--  IMPORTANTE · Cerrar la consultora a los usuarios del mentor
--
--  Hasta hoy la única forma de tener cuenta era que un administrador
--  te aprobara, así que las tablas de RR.HH. están abiertas a
--  "cualquier usuario autenticado" y con eso alcanzaba.
--
--  Desde que el mentor deja registrarse solo, eso deja de alcanzar:
--  una persona que se registra para practicar entrevistas queda
--  autenticada y, con la clave pública de la app, podría leer legajos,
--  sueldos y encuestas. La app no se lo muestra, pero la base sí se
--  lo daría.
--
--  Este bloque cambia esas políticas para que además exijan estar
--  APROBADO en profiles. El usuario del mentor no lo está, así que
--  la base le dice que no hay nada. Los usuarios de la consultora no
--  notan ningún cambio.
--
--  Sólo toca las tablas que existan; las que no, las saltea.
-- ============================================================
do $$
declare
  t text;
  tablas text[] := array[
    'employees','employee_movements','attendance','leaves','absence_notes',
    'performance','training','health_safety','hr_documents','benefits','offboarding',
    'fichador_config','interviews','cvs','cv_folders','job_posts','searches',
    'question_bank','climate_surveys','climate_responses',
    'culture_values','recognitions','action_plans','announcements'
  ];
begin
  foreach t in array tablas loop
    if to_regclass('public.' || t) is null then
      raise notice 'salteo %: no existe', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    -- Se borran las políticas viejas de "cualquier autenticado".
    execute format('drop policy if exists "%1$s_select" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_insert" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_update" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_delete" on public.%1$I', t);
    -- Y las que hayan quedado con otros nombres de versiones anteriores.
    execute format('drop policy if exists "auth_all_%1$s" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_auth_all" on public.%1$I', t);

    -- Una sola política por tabla: usuario de la consultora aprobado.
    execute format($f$
      create policy "%1$s_rrhh" on public.%1$I
        for all to authenticated
        using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved))
        with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved))
    $f$, t);
  end loop;
end $$;

-- Nota: /api/encuesta, /api/fichar y /api/sign entran con la SERVICE ROLE,
-- que se saltea RLS. El empleado que responde una encuesta, ficha o firma
-- un documento por link público sigue funcionando igual que antes.
