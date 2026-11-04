-- ============================================================
-- Messagerie privée : conversations à 2 personnes ou en groupe
-- ATTENTION : ce script remplace l'ancien (salons) et efface
-- les anciens messages de test. Les comptes sont conservés.
-- ============================================================

drop table if exists public.messages cascade;
drop table if exists public.rooms cascade;
drop table if exists public.conversation_members cascade;
drop table if exists public.conversations cascade;
drop function if exists public.create_conversation(uuid[], text);
drop function if exists public.is_member(uuid);

-- Profils
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  created_at timestamptz default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Conversations (privées ou groupes) et leurs membres
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  name text,
  is_group boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (conversation_id, user_id)
);
create index on public.conversation_members (user_id);

create table public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id),
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz default now()
);
create index on public.messages (conversation_id, created_at);

-- Vérifie que l'utilisateur connecté fait partie d'une conversation
create function public.is_member(cid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = cid and user_id = auth.uid()
  )
$$;

-- Crée une conversation (réutilise la privée existante entre 2 personnes)
create function public.create_conversation(p_members uuid[], p_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  others uuid[];
  cid uuid;
  grp boolean;
begin
  if me is null then raise exception 'Non connecté'; end if;
  select array_agg(distinct m) into others from unnest(p_members) m where m <> me;
  if others is null then raise exception 'Choisissez au moins une personne'; end if;
  grp := array_length(others, 1) > 1;

  if not grp then
    select c.id into cid from public.conversations c
    where not c.is_group
      and exists (select 1 from public.conversation_members x where x.conversation_id = c.id and x.user_id = me)
      and exists (select 1 from public.conversation_members x where x.conversation_id = c.id and x.user_id = others[1]);
    if cid is not null then return cid; end if;
  end if;

  insert into public.conversations (name, is_group, created_by)
  values (case when grp then coalesce(nullif(trim(p_name), ''), 'Groupe') end, grp, me)
  returning id into cid;

  insert into public.conversation_members (conversation_id, user_id)
  select cid, u from unnest(others || me) u;
  return cid;
end $$;

-- Sécurité (RLS) : on ne voit que ses propres conversations
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

drop policy if exists "profils lisibles" on public.profiles;
drop policy if exists "modifier son profil" on public.profiles;
create policy "profils lisibles" on public.profiles for select to authenticated using (true);
create policy "modifier son profil" on public.profiles for update to authenticated using (id = auth.uid());

create policy "mes conversations" on public.conversations for select to authenticated using (public.is_member(id));
create policy "membres de mes conversations" on public.conversation_members for select to authenticated using (public.is_member(conversation_id));
create policy "lire les messages" on public.messages for select to authenticated using (public.is_member(conversation_id));
create policy "écrire un message" on public.messages for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(conversation_id));
create policy "supprimer son message" on public.messages for delete to authenticated using (user_id = auth.uid());

-- Temps réel
alter publication supabase_realtime add table public.messages, public.conversation_members;
