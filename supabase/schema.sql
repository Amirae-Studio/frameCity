-- FrameCity — auth + access-code schema
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query).

-- ============================================================ profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  has_access boolean not null default false,
  redeemed_code text,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read only their own profile. No insert/update policies:
-- writes happen only via the trigger + redeem function below.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Auto-create a profile row on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================ access codes
create table if not exists public.access_codes (
  code text primary key,
  is_active boolean not null default true,
  max_uses integer not null default 1,
  uses integer not null default 0,
  note text,
  created_at timestamptz not null default now()
);

-- RLS on, with NO policies: codes are invisible to clients.
-- The only path in is the SECURITY DEFINER function below.
alter table public.access_codes enable row level security;

-- ============================================================ redeem (atomic)
create or replace function public.redeem_access_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_code text := upper(trim(p_code));
  v_row public.access_codes%rowtype;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  -- Already unlocked? Idempotent success.
  if exists (select 1 from public.profiles where id = v_user and has_access) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  -- Lock the code row so two users can't redeem the same code at once.
  select * into v_row
  from public.access_codes
  where code = v_code and is_active
  for update;

  if not found or v_row.uses >= v_row.max_uses then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  update public.access_codes
  set uses = uses + 1
  where code = v_row.code;

  -- Upsert in case the signup trigger predates this schema.
  select email into v_email from auth.users where id = v_user;
  insert into public.profiles (id, email, has_access, redeemed_code, redeemed_at)
  values (v_user, v_email, true, v_row.code, now())
  on conflict (id) do update
    set has_access = true,
        redeemed_code = excluded.redeemed_code,
        redeemed_at = excluded.redeemed_at;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.redeem_access_code(text) from public, anon;
grant execute on function public.redeem_access_code(text) to authenticated;

-- ============================================================ seed examples
-- Store codes UPPERCASE (redemption uppercases input). Examples:
-- insert into public.access_codes (code, note) values
--   ('FC-7K2M-9QRX', 'MakerWorld order #1001'),
--   ('FC-4TWN-1BZP', 'MakerWorld order #1002');
--
-- Bulk: Dashboard → Table Editor → access_codes → Insert → Import from CSV.

-- ============================================================ model storage
-- Private bucket holding the city model layers (display GLBs + archive STLs).
-- Each location is a FOLDER of layer files sharing one origin:
--   <city-slug>/<location-slug>/terrain.glb, roads.glb, grass.glb,
--   main-building.glb, small-building.glb, trees.glb, …
-- The app lists the folder and loads every .glb as one assembled tile.
insert into storage.buckets (id, name, public)
values ('city-models', 'city-models', false)
on conflict (id) do nothing;

-- Only signed-in backers who have redeemed a code can read model files.
-- The app hands out 60s signed URLs (app/studio/actions.ts) after this passes.
drop policy if exists "backers read city models" on storage.objects;
create policy "backers read city models"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'city-models'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and has_access
    )
  );

-- Upload files via Dashboard → Storage → city-models, or the CLI/API.
