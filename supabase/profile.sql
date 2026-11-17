-- ============================================================
-- Profil utilisateur : photo de profil, couverture, galerie,
-- nom/prénom, genre, nationalité, profil public ou privé.
-- À exécuter UNE FOIS, après schema.sql (et les scripts suivants).
-- ============================================================

-- Informations toujours visibles (nom d'utilisateur, photo, confidentialité)
alter table public.profiles
  add column avatar_url text,
  add column is_private boolean not null default false;

-- Informations personnelles (masquées si le profil est privé)
create table public.profile_details (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  first_name text check (char_length(first_name) <= 60),
  last_name text check (char_length(last_name) <= 60),
  gender text check (gender in ('homme', 'femme', 'autre', 'non_precise')),
  nationality text check (nationality ~ '^[A-Z]{2}$'),
  cover_url text,
  updated_at timestamptz default now()
);

-- Historique des photos (galerie)
create table public.profile_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('avatar', 'cover')),
  url text not null,
  created_at timestamptz default now()
);
create index on public.profile_photos (user_id, created_at desc);

-- Visible par son propriétaire, ou si le profil est public
create function public.profile_visible(uid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select uid = auth.uid() or exists (select 1 from profiles p where p.id = uid and not p.is_private)
$$;

-- Sécurité (RLS)
alter table public.profile_details enable row level security;
alter table public.profile_photos enable row level security;

create policy "voir les details" on public.profile_details for select to authenticated using (public.profile_visible(user_id));
create policy "creer ses details" on public.profile_details for insert to authenticated with check (user_id = auth.uid());
create policy "modifier ses details" on public.profile_details for update to authenticated using (user_id = auth.uid());

create policy "voir la galerie" on public.profile_photos for select to authenticated using (public.profile_visible(user_id));
create policy "ajouter une photo" on public.profile_photos for insert to authenticated with check (user_id = auth.uid());
create policy "supprimer une photo" on public.profile_photos for delete to authenticated using (user_id = auth.uid());

-- Suppression des fichiers de son propre dossier
drop policy if exists "media suppression" on storage.objects;
create policy "media suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
