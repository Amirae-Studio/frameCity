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

-- ============================================================ cities & places tables
create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  available boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  city_slug text not null references public.cities(slug) on delete cascade,
  slug text not null,
  name text not null,
  area text,
  coords text,
  completed boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(city_slug, slug)
);

alter table public.cities enable row level security;
alter table public.places enable row level security;

drop policy if exists "public read cities" on public.cities;
create policy "public read cities" on public.cities for select using (true);

drop policy if exists "public read places" on public.places;
create policy "public read places" on public.places for select using (true);

-- Seed initial cities into database table
insert into public.cities (slug, name, available, display_order) values
  ('london', 'London', true, 1),
  ('paris', 'Paris', true, 2),
  ('new-york', 'New York', true, 3),
  ('tokyo', 'Tokyo', true, 4),
  ('hong-kong', 'Hong Kong', false, 5),
  ('singapore', 'Singapore', false, 6),
  ('dubai', 'Dubai', false, 7),
  ('chicago', 'Chicago', false, 8),
  ('sydney', 'Sydney', false, 9),
  ('san-francisco', 'San Francisco', false, 10)
on conflict (slug) do update set
  name = excluded.name,
  available = excluded.available,
  display_order = excluded.display_order;

-- Seed initial places into database table
insert into public.places (city_slug, slug, name, area, coords, completed, display_order) values
  ('london', 'the-city', 'The City', 'Square Mile · EC2', '51.5155° N, 0.0922° W', true, 1),
  ('london', 'westminster', 'Westminster', 'Big Ben · Abbey', '51.4995° N, 0.1248° W', true, 2),
  ('london', 'tower-bridge', 'Tower Bridge', 'Southwark riverfront', '51.5055° N, 0.0754° W', true, 3),
  ('london', 'canary-wharf', 'Canary Wharf', 'Docklands', '51.5054° N, 0.0235° W', false, 4),
  ('london', 'camden', 'Camden', 'Regent''s Park edge', '51.5390° N, 0.1426° W', false, 5),

  ('paris', 'tour-eiffel', 'Tour Eiffel', 'Champ-de-Mars · 7ᵉ', '48.8584° N, 2.2945° E', true, 1),
  ('paris', 'le-marais', 'Le Marais', '3ᵉ & 4ᵉ arr.', '48.8590° N, 2.3620° E', false, 2),
  ('paris', 'ile-de-la-cite', 'Île de la Cité', 'Notre-Dame', '48.8530° N, 2.3499° E', false, 3),
  ('paris', 'montmartre', 'Montmartre', 'Sacré-Cœur · 18ᵉ', '48.8867° N, 2.3431° E', false, 4),
  ('paris', 'la-defense', 'La Défense', 'Grande Arche', '48.8920° N, 2.2362° E', false, 5),

  ('new-york', 'midtown', 'Midtown', 'Empire State', '40.7484° N, 73.9857° W', true, 1),
  ('new-york', 'central-park-south', 'Central Park South', 'Billionaires'' Row', '40.7661° N, 73.9797° W', false, 2),
  ('new-york', 'financial-district', 'Financial District', 'Wall St · One WTC', '40.7074° N, 74.0113° W', false, 3),
  ('new-york', 'dumbo', 'DUMBO', 'Brooklyn Bridge', '40.7033° N, 73.9894° W', false, 4),
  ('new-york', 'times-square', 'Times Square', 'Theater District', '40.7580° N, 73.9855° W', false, 5),

  ('tokyo', 'shibuya', 'Shibuya', 'Scramble Crossing', '35.6595° N, 139.7005° E', true, 1),
  ('tokyo', 'shinjuku', 'Shinjuku', 'West towers', '35.6938° N, 139.7034° E', false, 2),
  ('tokyo', 'roppongi', 'Roppongi', 'Tokyo Tower view', '35.6628° N, 139.7315° E', false, 3),
  ('tokyo', 'asakusa', 'Asakusa', 'Sensō-ji', '35.7148° N, 139.7967° E', false, 4),
  ('tokyo', 'ginza', 'Ginza', 'Chūō shopping mile', '35.6717° N, 139.7650° E', false, 5)
on conflict (city_slug, slug) do update set
  name = excluded.name,
  area = excluded.area,
  coords = excluded.coords,
  completed = excluded.completed,
  display_order = excluded.display_order;


