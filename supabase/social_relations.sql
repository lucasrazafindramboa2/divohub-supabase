-- ============================================================
-- Relations : amis (demandes), blocage, amis proches.
-- À exécuter UNE FOIS, après subscription.sql.
-- Les abonnements réciproques existants sont convertis en amitiés.
-- ============================================================

create table public.blocks (
  blocker_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (blocker_id, blocked_id), check (blocker_id <> blocked_id)
);
create table public.friend_requests (
  sender_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (sender_id, receiver_id), check (sender_id <> receiver_id)
);
-- Une amitié = une seule ligne, avec user_a < user_b
create table public.friendships (
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_a, user_b), check (user_a < user_b)
);
create index on public.friendships (user_b);
create table public.close_friends (
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (owner_id, friend_id), check (owner_id <> friend_id)
);

-- Reprise de l'existant : abonnés réciproques => amis
insert into public.friendships (user_a, user_b)
select least(f1.follower_id, f1.following_id), greatest(f1.follower_id, f1.following_id)
from public.follows f1
join public.follows f2 on f2.follower_id = f1.following_id and f2.following_id = f1.follower_id
where f1.follower_id < f1.following_id
on conflict do nothing;

-- Fonctions de contrôle
create function public.is_blocked_with(uid uuid) returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from blocks where (blocker_id = auth.uid() and blocked_id = uid) or (blocker_id = uid and blocked_id = auth.uid()))
$$;
create function public.are_friends(a uuid, b uuid) returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from friendships where user_a = least(a, b) and user_b = greatest(a, b))
$$;

-- Un profil bloqué (dans un sens ou dans l'autre) n'est plus visible
create or replace function public.profile_visible(uid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select uid = auth.uid() or (
    exists (select 1 from profiles p where p.id = uid and not p.is_private)
    and not public.is_blocked_with(uid))
$$;

-- Demande d'ami (si l'autre personne m'en avait déjà envoyé une : amitié immédiate)
create function public.friend_request_send(p_to uuid) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n int;
begin
  if me is null or p_to is null or p_to = me then raise exception 'Utilisateur invalide'; end if;
  if is_blocked_with(p_to) then raise exception 'Action impossible avec cet utilisateur'; end if;
  if are_friends(me, p_to) then raise exception 'Vous êtes déjà amis'; end if;
  if exists (select 1 from friend_requests where sender_id = p_to and receiver_id = me) then
    delete from friend_requests where sender_id = p_to and receiver_id = me;
    insert into friendships (user_a, user_b) values (least(me, p_to), greatest(me, p_to)) on conflict do nothing;
    insert into notifications (user_id, actor_id, type) values (p_to, me, 'friend_accept');
    return 'friends';
  end if;
  insert into friend_requests (sender_id, receiver_id) values (me, p_to) on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then insert into notifications (user_id, actor_id, type) values (p_to, me, 'friend_request'); end if;
  return 'sent';
end $$;

create function public.friend_request_accept(p_from uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n int;
begin
  if me is null then raise exception 'Utilisateur invalide'; end if;
  if is_blocked_with(p_from) then raise exception 'Action impossible avec cet utilisateur'; end if;
  delete from friend_requests where sender_id = p_from and receiver_id = me;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Cette demande n’existe plus'; end if;
  insert into friendships (user_a, user_b) values (least(me, p_from), greatest(me, p_from)) on conflict do nothing;
  insert into notifications (user_id, actor_id, type) values (p_from, me, 'friend_accept');
end $$;

create function public.friend_remove(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Utilisateur invalide'; end if;
  delete from friendships where user_a = least(me, p_user) and user_b = greatest(me, p_user);
  delete from close_friends where (owner_id = me and friend_id = p_user) or (owner_id = p_user and friend_id = me);
end $$;

-- Bloquer : supprime amitié, abonnements, demandes et amis proches entre les deux
create function public.block_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or p_user is null or p_user = me then raise exception 'Utilisateur invalide'; end if;
  insert into blocks (blocker_id, blocked_id) values (me, p_user) on conflict do nothing;
  delete from follows where (follower_id = me and following_id = p_user) or (follower_id = p_user and following_id = me);
  delete from friendships where user_a = least(me, p_user) and user_b = greatest(me, p_user);
  delete from friend_requests where (sender_id = me and receiver_id = p_user) or (sender_id = p_user and receiver_id = me);
  delete from close_friends where (owner_id = me and friend_id = p_user) or (owner_id = p_user and friend_id = me);
end $$;

revoke execute on function public.friend_request_send(uuid), public.friend_request_accept(uuid),
  public.friend_remove(uuid), public.block_user(uuid) from public, anon;
grant execute on function public.friend_request_send(uuid), public.friend_request_accept(uuid),
  public.friend_remove(uuid), public.block_user(uuid) to authenticated;

-- Sécurité (RLS) : les créations passent par les fonctions ci-dessus
alter table public.blocks enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.close_friends enable row level security;

create policy "voir mes blocages" on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy "debloquer" on public.blocks for delete to authenticated using (blocker_id = auth.uid());

create policy "voir mes demandes" on public.friend_requests for select to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());
create policy "annuler ou refuser" on public.friend_requests for delete to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());

create policy "voir les amis" on public.friendships for select to authenticated
  using (user_a = auth.uid() or user_b = auth.uid() or (public.profile_visible(user_a) and public.profile_visible(user_b)));

create policy "voir mes proches" on public.close_friends for select to authenticated using (owner_id = auth.uid());
create policy "ajouter un proche" on public.close_friends for insert to authenticated
  with check (owner_id = auth.uid() and public.are_friends(owner_id, friend_id));
create policy "retirer un proche" on public.close_friends for delete to authenticated using (owner_id = auth.uid());

-- Notifications : nouveaux types
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like', 'comment', 'follow', 'reaction', 'reply', 'friend_request', 'friend_accept'));

-- Effets du blocage sur l'existant
drop policy "suivre" on public.follows;
create policy "suivre" on public.follows for insert to authenticated
  with check (follower_id = auth.uid() and not public.is_blocked_with(following_id));

drop policy "lecture stories" on public.stories;
create policy "lecture stories" on public.stories for select to authenticated using (not public.is_blocked_with(user_id));

drop policy "écrire un message" on public.messages;
create policy "écrire un message" on public.messages for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(conversation_id) and not exists (
    select 1 from public.conversations c
    join public.conversation_members m on m.conversation_id = c.id
    where c.id = messages.conversation_id and not c.is_group
      and m.user_id <> auth.uid() and public.is_blocked_with(m.user_id)));

create or replace function public.create_conversation(p_members uuid[], p_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); others uuid[]; cid uuid; grp boolean;
begin
  if me is null then raise exception 'Non connecté'; end if;
  select array_agg(distinct m) into others from unnest(p_members) m where m <> me;
  if others is null then raise exception 'Choisissez au moins une personne'; end if;
  if exists (select 1 from public.blocks b
             where (b.blocker_id = me and b.blocked_id = any(others)) or (b.blocked_id = me and b.blocker_id = any(others))) then
    raise exception 'Action impossible avec cet utilisateur';
  end if;
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
