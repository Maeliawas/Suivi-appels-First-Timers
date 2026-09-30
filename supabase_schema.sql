-- =========================================================
-- Suivi Appels J+3 — schéma Supabase
-- À exécuter une seule fois dans Supabase : SQL Editor > New query
-- =========================================================

-- Table principale : un contact = un client à rappeler
create table if not exists contacts (
  id text primary key,
  name text not null default '',
  phone text not null default '',
  booking_date date,
  booking_ref text default '',
  event_date date,
  needs_promo boolean not null default false,
  promo_sent boolean not null default false,
  status text not null default 'a_appeler' check (status in ('a_appeler','traite')),
  tags text[] not null default '{}',
  notes text default '',
  checklist_notes jsonb not null default '{}'::jsonb,
  issue_note text default '',
  caller text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Maj automatique de updated_at à chaque modification
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_contacts_updated_at on contacts;
create trigger trg_contacts_updated_at
  before update on contacts
  for each row execute function set_updated_at();

-- Row Level Security : seules les personnes connectées (compte Supabase Auth)
-- peuvent lire ou écrire les contacts. Personne d'autre (visiteur anonyme) ne
-- peut accéder aux données, même si l'URL du site est connue.
alter table contacts enable row level security;

drop policy if exists "authenticated read" on contacts;
create policy "authenticated read" on contacts
  for select
  to authenticated
  using (true);

drop policy if exists "authenticated write" on contacts;
create policy "authenticated write" on contacts
  for insert
  to authenticated
  with check (true);

drop policy if exists "authenticated update" on contacts;
create policy "authenticated update" on contacts
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "authenticated delete" on contacts;
create policy "authenticated delete" on contacts
  for delete
  to authenticated
  using (true);

-- Index utiles pour les tris/filtres du dashboard
create index if not exists idx_contacts_booking_date on contacts (booking_date);
create index if not exists idx_contacts_status on contacts (status);

-- =========================================================
-- Après avoir exécuté ce script :
-- 1. Aller dans "Table Editor" > contacts > "Insert" > "Import data from CSV"
--    et importer le fichier contacts_export.csv fourni à côté de ce script.
-- 2. Aller dans "Authentication" > "Users" > "Add user" pour créer un compte
--    (email + mot de passe) pour chaque personne qui doit accéder au dashboard.
--    Décocher "Auto confirm user" n'est pas nécessaire si tu crées le compte
--    toi-même depuis le tableau de bord Supabase (il est confirmé d'office).
-- =========================================================
