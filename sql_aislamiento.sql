-- AISLAMIENTO ENTRE CUENTAS
-- Antes: las reglas "<tabla>_rrhh" dejaban que CUALQUIER cuenta aprobada leyera y
-- modificara los datos de TODAS las cuentas (sólo pedían profiles.approved).
-- Ahora: cada cuenta aprobada ve y toca únicamente sus propias filas.
-- Las funciones públicas (fichador, firmas, encuestas, demo) usan la service role y no cambian.

do $$
declare t text;
begin
  -- Tablas con columna owner
  foreach t in array array['absence_notes','action_plans','announcements','attendance','climate_surveys',
    'culture_values','cvs','employee_movements','employees','fichador_config','health_safety','hr_documents',
    'job_posts','leaves','performance','recognitions','sanctions','searches','training']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_rrhh', t);
    execute format($p$create policy %I on public.%I for all to authenticated
      using (owner = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved))
      with check (owner = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved))$p$,
      t || '_rrhh', t);
  end loop;

  -- Tablas con columna recruiter_id
  foreach t in array array['interviews','cv_folders','question_bank']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_rrhh', t);
    execute format($p$create policy %I on public.%I for all to authenticated
      using (recruiter_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved))
      with check (recruiter_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved))$p$,
      t || '_rrhh', t);
  end loop;
end $$;

-- Respuestas de clima: se ven sólo si la encuesta es de la cuenta.
drop policy if exists climate_responses_rrhh on public.climate_responses;
create policy climate_responses_rrhh on public.climate_responses for all to authenticated
  using (exists (select 1 from public.climate_surveys s where s.id = climate_responses.survey_id and s.owner = auth.uid()))
  with check (exists (select 1 from public.climate_surveys s where s.id = climate_responses.survey_id and s.owner = auth.uid()));
