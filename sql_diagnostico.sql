-- ============================================================
--  Diagnóstico: qué hay corrido y qué falta
--  No modifica nada. Pegalo en el SQL Editor de Supabase y mirá
--  las tres consultas que devuelve.
-- ============================================================

-- 1) Estado de cada tabla: si existe, si tiene RLS y si está blindada
select
  x.archivo,
  x.tabla,
  case when to_regclass('public.' || x.tabla) is null then '✗ FALTA CORRER' else '✓ existe' end            as tabla,
  case when to_regclass('public.' || x.tabla) is null then '—'
       when coalesce((select c.relrowsecurity from pg_class c
                      join pg_namespace n on n.oid = c.relnamespace
                      where n.nspname = 'public' and c.relname = x.tabla), false)
       then '✓ activada' else '✗ APAGADA' end                                                              as rls,
  coalesce((select count(*) from pg_policies p
            where p.schemaname = 'public' and p.tablename = x.tabla), 0)                                   as politicas,
  case when to_regclass('public.' || x.tabla) is null then '—'
       when exists (select 1 from pg_policies p
                    where p.schemaname = 'public' and p.tablename = x.tabla
                      and coalesce(p.qual, '') like '%approved%')
       then '✓ sólo RR.HH. aprobado'
       when exists (select 1 from pg_policies p
                    where p.schemaname = 'public' and p.tablename = x.tabla
                      and coalesce(p.qual, '') like '%auth.uid()%')
       then '✓ sólo el dueño'
       when exists (select 1 from pg_policies p
                    where p.schemaname = 'public' and p.tablename = x.tabla)
       then '⚠ ABIERTA a cualquier usuario'
       else '✗ sin políticas' end                                                                          as quien_puede_leer
from (values
  ('base / módulos 1 y 2', 'profiles'),
  ('base / módulos 1 y 2', 'employees'),
  ('base / módulos 1 y 2', 'interviews'),
  ('base / módulos 1 y 2', 'cvs'),
  ('base / módulos 1 y 2', 'job_posts'),
  ('base / módulos 1 y 2', 'attendance'),
  ('base / módulos 1 y 2', 'leaves'),
  ('sql_marca.sql',        'brands'),
  ('sql_beneficios.sql',   'benefits'),
  ('sql_offboarding.sql',  'offboarding'),
  ('sql_encuestas.sql',    'climate_surveys'),
  ('sql_encuestas.sql',    'climate_responses'),
  ('sql_clima.sql',        'culture_values'),
  ('sql_clima.sql',        'recognitions'),
  ('sql_clima.sql',        'action_plans'),
  ('sql_clima.sql',        'announcements'),
  ('sql_mentor.sql',       'mentor_profiles'),
  ('sql_mentor.sql',       'mentor_sessions')
) as x(archivo, tabla)
order by x.archivo, x.tabla;

-- 2) ¿Tu usuario de la consultora sigue habilitado para ver los datos?
--    Si tu fila dice approved = false, la app te va a mostrar todo vacío.
select id, email, approved,
       case when approved then '✓ ve los datos de RR.HH.' else '✗ NO ve nada — hay que aprobarlo' end as estado
from public.profiles
order by approved, email;

-- 3) Resumen en una línea
select
  (select count(*) from (values ('benefits'),('offboarding'),('climate_surveys'),('climate_responses'),
                                ('culture_values'),('recognitions'),('action_plans'),('announcements'),
                                ('mentor_profiles'),('mentor_sessions')) as v(t)
   where to_regclass('public.' || v.t) is not null)                                    as tablas_creadas_de_10,
  (select count(*) from pg_policies
   where schemaname = 'public' and coalesce(qual,'') like '%approved%')                 as politicas_blindadas,
  (select count(*) from pg_policies p
   join pg_class c on c.relname = p.tablename
   where p.schemaname = 'public'
     and p.tablename not like 'mentor_%'
     and coalesce(p.qual,'') not like '%approved%'
     and coalesce(p.qual,'') not like '%auth.uid()%')                                   as politicas_todavia_abiertas;
