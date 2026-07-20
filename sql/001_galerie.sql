-- ═══════════════════════════════════════════════════════════════
--  Galerie foto Rise Up — schema + securitate
--  Ruleaza o singura data. Poate fi rulat din nou fara probleme
--  (totul e "if not exists" / "or replace").
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. PROFILES ───────────────────────────────────────────────
-- Fiecare user din auth.users primeste automat un rand aici.
-- Rolul implicit e 'viewer'; 'photographer' il pui manual.

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'viewer' check (role in ('viewer', 'photographer')),
  created_at timestamptz not null default now()
);

-- Trigger: la orice user nou in auth.users, creeaza randul din profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ─── 2. HELPER: e fotograf? ────────────────────────────────────
-- security definer = ruleaza cu drepturi de owner, ca sa nu intre
-- in recursiune infinita cand o folosim in policy-urile de pe profiles.

create or replace function public.is_photographer()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'photographer'
  );
$$;


-- ─── 3. PHOTOS ─────────────────────────────────────────────────
-- Fisierele stau pe R2. Aici tinem doar evidenta lor.

-- Tinem doar CALEA in R2, nu URL-ul complet. Asa, daca mutam vreodata
-- Worker-ul pe alt domeniu, pozele vechi continua sa mearga — adresa
-- se construieste la afisare, din setarile din js/config.js.

create table if not exists public.photos (
  id            uuid primary key default gen_random_uuid(),
  storage_key   text not null unique,       -- originals/2026-07-20/<uuid>.jpg
  thumb_key     text,                       -- thumbs/2026-07-20/<uuid>.jpg
  content_type  text,
  size_bytes    bigint,
  width         int,
  height        int,
  day_tag       text,                       -- optional: "Ziua 1"
  uploaded_by   uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists photos_created_at_idx on public.photos (created_at desc);
create index if not exists photos_day_tag_idx    on public.photos (day_tag);


-- ─── 4. ROW LEVEL SECURITY ─────────────────────────────────────
-- RLS = regulile care decid cine ce poate face, verificate de
-- Postgres, nu de JavaScript. Chiar daca cineva fura cheia anon
-- din browser, regulile astea raman in picioare.

alter table public.profiles enable row level security;
alter table public.photos   enable row level security;

-- profiles: fiecare isi vede doar propriul rand.
-- NU exista policy de UPDATE => nimeni nu-si poate schimba rolul
-- din client. Rolul se schimba doar din dashboard/service key.
drop policy if exists "profiles: citeste propriul rand" on public.profiles;
create policy "profiles: citeste propriul rand"
  on public.profiles for select
  using (id = auth.uid());

-- photos: galeria e publica — oricine citeste, inclusiv nelogat.
drop policy if exists "photos: oricine poate vedea" on public.photos;
create policy "photos: oricine poate vedea"
  on public.photos for select
  to anon, authenticated
  using (true);

-- photos: doar fotograful scrie.
drop policy if exists "photos: doar fotograful adauga" on public.photos;
create policy "photos: doar fotograful adauga"
  on public.photos for insert
  to authenticated
  with check (public.is_photographer() and uploaded_by = auth.uid());

drop policy if exists "photos: doar fotograful modifica" on public.photos;
create policy "photos: doar fotograful modifica"
  on public.photos for update
  to authenticated
  using (public.is_photographer());

drop policy if exists "photos: doar fotograful sterge" on public.photos;
create policy "photos: doar fotograful sterge"
  on public.photos for delete
  to authenticated
  using (public.is_photographer());


-- ─── 5. GRANT-URI ──────────────────────────────────────────────
-- ATENTIE, subtilitate de Postgres: RLS decide CARE RANDURI vede
-- cineva, dar GRANT decide daca are voie sa atinga tabelul deloc.
-- Fara GRANT, cererea e respinsa inainte sa ajunga la policies
-- ("permission denied for table"). Deci sunt necesare AMANDOUA.
-- GRANT-ul de mai jos e larg, dar RLS ramane filtrul real.

grant usage on schema public to anon, authenticated;

grant select on public.profiles to authenticated;
grant select on public.photos   to anon, authenticated;
grant insert, update, delete on public.photos to authenticated;


-- ─── 6. REALTIME ───────────────────────────────────────────────
-- Ca pozele noi sa apara live in galerie, fara refresh.

do $$
begin
  alter publication supabase_realtime add table public.photos;
exception
  when duplicate_object then null;  -- deja adaugat, e ok
end;
$$;
