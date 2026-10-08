-- Ensayo: módulos de negociación, dilema del día, oratoria y práctica entre pares.
-- Mismo criterio que 0001: escribe solo el servidor (service role) y cada usuario lee lo suyo.

-- Negociación: resultado del acuerdo (hubo trato, si quedó dentro del margen, etc.).
alter table public.feedback add column if not exists deal jsonb;

-- Dilema del día: un voto por usuario y por día.
create table public.dilemma_votes (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  dilemma_id text not null,
  choice text not null,
  answer text,
  ai_feedback jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
create index dilemma_votes_day_idx on public.dilemma_votes (day, dilemma_id);

-- Oratoria: cada intento con su transcripción y su análisis.
create table public.speech_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  challenge_slug text not null,
  mode text not null check (mode in ('audio', 'texto')),
  duration_seconds integer,
  transcript text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index speech_attempts_user_created_idx on public.speech_attempts (user_id, created_at desc);

-- Práctica entre pares: salas de 15 minutos con dos roles.
create table public.peer_rooms (
  id uuid primary key default gen_random_uuid(),
  exercise_slug text not null,
  host_id uuid not null references auth.users (id) on delete cascade,
  host_name text not null,
  host_role text not null check (host_role in ('practica', 'evalua')),
  guest_id uuid references auth.users (id) on delete set null,
  guest_name text,
  scheduled_at timestamptz,
  is_public boolean not null default true,
  status text not null default 'open' check (status in ('open', 'matched', 'done', 'cancelled')),
  created_at timestamptz not null default now()
);
create index peer_rooms_open_idx on public.peer_rooms (status, is_public, created_at desc);

create table public.peer_feedback (
  room_id uuid not null references public.peer_rooms (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  answers jsonb not null,
  created_at timestamptz not null default now(),
  primary key (room_id, author_id)
);

alter table public.dilemma_votes enable row level security;
alter table public.speech_attempts enable row level security;
alter table public.peer_rooms enable row level security;
alter table public.peer_feedback enable row level security;

create policy "Cada usuario lee sus votos" on public.dilemma_votes
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Cada usuario lee sus intentos de oratoria" on public.speech_attempts
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Cada participante lee sus salas" on public.peer_rooms
  for select to authenticated
  using (host_id = (select auth.uid()) or guest_id = (select auth.uid()));

create policy "Cada participante lee el feedback de sus salas" on public.peer_feedback
  for select to authenticated
  using (exists (
    select 1 from public.peer_rooms r
    where r.id = peer_feedback.room_id
      and (r.host_id = (select auth.uid()) or r.guest_id = (select auth.uid()))
  ));
