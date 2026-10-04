-- Métricas del lanzamiento. Correlas en el SQL Editor de Supabase.

-- 1. Prácticas iniciadas, terminadas con diagnóstico y tasa de llegada al diagnóstico (últimos 30 días).
select
  count(*) as iniciadas,
  count(f.session_id) as con_diagnostico,
  round(100.0 * count(f.session_id) / nullif(count(*), 0), 1) as pct_diagnostico
from public.sessions s
left join public.feedback f on f.session_id = s.id
where s.created_at > now() - interval '30 days';

-- 2. Usuarios que repiten: hicieron otra práctica dentro de los 7 días de la primera.
with primeras as (
  select user_id, min(created_at) as primera from public.sessions group by user_id
)
select
  count(*) as usuarios,
  count(*) filter (where exists (
    select 1 from public.sessions s
    where s.user_id = p.user_id
      and s.created_at > p.primera
      and s.created_at <= p.primera + interval '7 days'
  )) as repiten_en_7_dias
from primeras p;

-- 3. Situaciones más elegidas y puntaje promedio.
select
  s.scenario_slug,
  count(*) as practicas,
  round(avg((f.score_tone + f.score_assertive + f.score_empathy + f.score_clarity) / 4.0), 1) as promedio
from public.sessions s
left join public.feedback f on f.session_id = s.id
group by s.scenario_slug
order by practicas desc;
