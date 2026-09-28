-- Pedidos de demo desde la página de presentación (los inserta /api/demo con la service role).
create table if not exists public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  company text,
  email text not null,
  phone text,
  employees text,
  plan text,
  message text,
  status text not null default 'nuevo',
  notes text,
  ip text,
  user_agent text
);
create index if not exists demo_requests_created_idx on public.demo_requests (created_at desc);
alter table public.demo_requests enable row level security;

-- Sólo el dueño de la plataforma puede verlos y marcarlos (nadie puede insertar desde el navegador).
drop policy if exists demo_requests_admin_select on public.demo_requests;
create policy demo_requests_admin_select on public.demo_requests
  for select to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'matipealv@gmail.com');

drop policy if exists demo_requests_admin_update on public.demo_requests;
create policy demo_requests_admin_update on public.demo_requests
  for update to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'matipealv@gmail.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'matipealv@gmail.com');
