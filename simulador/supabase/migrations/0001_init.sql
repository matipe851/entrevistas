-- Ensayo: sesiones de práctica, mensajes y diagnósticos.
-- Las situaciones viven en el código (lib/scenarios.ts), así el prompt secreto del personaje
-- nunca llega a la base ni al navegador.
--
-- Escritura: solo el servidor, con la service role key. Así nadie puede saltear el límite
-- diario ni el tope de mensajes escribiendo directo en la API de Supabase.
-- Lectura: cada usuario ve solo lo suyo (RLS).

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scenario_slug text not null,
  status text not null default 'active' check (status in ('active', 'finished')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index sessions_user_created_idx on public.sessions (user_id, created_at desc);

create table public.messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index messages_session_idx on public.messages (session_id, id);

create table public.feedback (
  session_id uuid primary key references public.sessions (id) on delete cascade,
  score_tone smallint not null check (score_tone between 1 and 10),
  score_assertive smallint not null check (score_assertive between 1 and 10),
  score_empathy smallint not null check (score_empathy between 1 and 10),
  score_clarity smallint not null check (score_clarity between 1 and 10),
  summary text not null,
  strengths jsonb not null default '[]',
  rewrites jsonb not null default '[]',
  created_at timestamptz not null default now()
);

alter table public.sessions enable row level security;
alter table public.messages enable row level security;
alter table public.feedback enable row level security;

create policy "Cada usuario lee sus sesiones" on public.sessions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Cada usuario lee los mensajes de sus sesiones" on public.messages
  for select to authenticated
  using (exists (
    select 1 from public.sessions s
    where s.id = messages.session_id and s.user_id = (select auth.uid())
  ));

create policy "Cada usuario lee sus diagnósticos" on public.feedback
  for select to authenticated
  using (exists (
    select 1 from public.sessions s
    where s.id = feedback.session_id and s.user_id = (select auth.uid())
  ));
