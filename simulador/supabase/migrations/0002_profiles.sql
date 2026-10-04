-- Ensayo: perfiles con aprobación del administrador.
-- Cada cuenta nueva queda "pending" hasta que el administrador la acepta o la rechaza
-- desde /admin. El administrador se define en la app (ADMIN_EMAIL), no en la base.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index profiles_status_created_idx on public.profiles (status, created_at desc);

alter table public.profiles enable row level security;

-- Cada usuario lee solo su perfil. Las escrituras pasan por el servidor (service role).
create policy "Cada usuario lee su perfil" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

-- Al crearse una cuenta en Supabase Auth, se crea su perfil pendiente.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Cuentas que ya existían antes de esta migración: quedan pendientes.
insert into public.profiles (id, email, created_at)
select id, coalesce(email, ''), created_at from auth.users
on conflict (id) do nothing;
