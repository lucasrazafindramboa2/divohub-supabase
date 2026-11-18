-- ============================================================
-- Suggestions d'amis (amis en commun, visiteurs du profil, recherches)
-- + date de naissance privée pour séparer mineurs et majeurs.
-- À exécuter UNE FOIS, après reports.sql, AVANT de déployer le code.
-- ============================================================

-- Date de naissance : privée (lisible par son seul propriétaire) et non modifiable par l'utilisateur
create table public.user_private (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  birth_date date not null check (birth_date >= date '1900-01-01' and birth_date <= current_date)
);
alter table public.user_private enable row level security;
create policy "voir ma date de naissance" on public.user_private for select to authenticated using (user_id = auth.uid());
create policy "renseigner ma date de naissance" on public.user_private for insert to authenticated with check (user_id = auth.uid());
-- Aucune règle de modification ni de suppression : une correction se fait par un administrateur, en SQL.

-- Visites de profils (alimentent les suggestions ; jamais lisibles directement)
create table public.profile_views (
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_id uuid not null references public.profiles(id) on delete cascade,
  last_viewed_at timestamptz not null default now(),
  view_count int not null default 1,
  primary key (viewer_id, viewed_id), check (viewer_id <> viewed_id)
);
create index on public.profile_views (viewed_id, last_viewed_at desc);
alter table public.profile_views enable row level security;

-- Historique des recherches de noms (privé : visible et effaçable par son propriétaire)
create table public.user_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  term text not null check (char_length(term) between 2 and 40),
  searched_at timestamptz not null default now(),
  unique (user_id, term)
);
alter table public.user_searches enable row level security;
create policy "voir mon historique" on public.user_searches for select to authenticated using (user_id = auth.uid());
create policy "effacer mon historique" on public.user_searches for delete to authenticated using (user_id = auth.uid());

-- Suggestions ignorées
create table public.suggestion_dismissals (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  dismissed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, dismissed_id), check (user_id <> dismissed_id)
);
alter table public.suggestion_dismissals enable row level security;
create policy "voir mes suggestions ignorees" on public.suggestion_dismissals for select to authenticated using (user_id = auth.uid());
create policy "ignorer une suggestion" on public.suggestion_dismissals for insert to authenticated with check (user_id = auth.uid());
create policy "reafficher une suggestion" on public.suggestion_dismissals for delete to authenticated using (user_id = auth.uid());

-- Inscription : enregistre aussi la date de naissance (valeur invalide ignorée)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  nat text := upper(meta->>'nationality');
  pic text := coalesce(nullif(meta->>'avatar_url', ''), nullif(meta->>'picture', ''));
  bd date;
begin
  if new.email_confirmed_at is null then return new; end if;
  begin bd := (meta->>'birth_date')::date; exception when others then bd := null; end;
  if bd < date '1900-01-01' or bd > current_date then bd := null; end if;
  insert into public.profiles (id, username, nationality, avatar_url)
  values (
    new.id,
    left(coalesce(nullif(trim(meta->>'username'), ''), nullif(trim(meta->>'full_name'), ''), split_part(new.email, '@', 1)), 40),
    case when nat ~ '^[A-Z]{2}$' then nat end,
    case when pic ~ '^https://' then pic end
  )
  on conflict (id) do nothing;
  if bd is not null then
    insert into public.user_private (user_id, birth_date) values (new.id, bd) on conflict do nothing;
  end if;
  return new;
end $$;

-- Fonctions internes (non appelables depuis l'application)
create function public.mutual_friends_count(a uuid, b uuid) returns int
language sql security definer stable set search_path = public as $$
  select count(*)::int from (
    select case when user_a = a then user_b else user_a end from friendships where user_a = a or user_b = a
    intersect
    select case when user_a = b then user_b else user_a end from friendships where user_a = b or user_b = b
  ) t
$$;

-- Un compte suspendu ou banni n'est jamais suggéré
create function public.is_sanctioned(uid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((
    select l.action = 'ban' or (l.action = 'suspend' and l.until > now())
    from (select action, until from moderation_actions
          where target_user_id = uid and action in ('suspend', 'ban', 'unban') order by created_at desc limit 1) l
  ), false)
$$;

-- Enregistre la visite d'un profil (nettoyage des visites de plus de 60 jours)
create function public.profile_view_record(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or p_user is null or p_user = me or public.is_blocked_with(p_user) then return; end if;
  insert into profile_views (viewer_id, viewed_id) values (me, p_user)
  on conflict (viewer_id, viewed_id) do update set last_viewed_at = now(), view_count = profile_views.view_count + 1;
  delete from profile_views where viewer_id = me and last_viewed_at < now() - interval '60 days';
end $$;

-- Recherche de personnes par nom ; mémorise la recherche (20 dernières) si elle trouve quelqu'un
create function public.people_search(p_query text)
returns table (user_id uuid, username text, avatar_url text, nationality text, mutual_count int, relation text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare me uuid := auth.uid(); q text := lower(trim(coalesce(p_query, '')));
begin
  if me is null then raise exception 'Non connecté'; end if;
  if char_length(q) < 2 or char_length(q) > 40 then return; end if;

  if exists (select 1 from profiles p where p.id <> me and strpos(lower(p.username), q) > 0 and not public.is_blocked_with(p.id)) then
    insert into user_searches (user_id, term) values (me, q)
    on conflict (user_id, term) do update set searched_at = now();
    delete from user_searches where user_id = me
      and id not in (select s.id from user_searches s where s.user_id = me order by s.searched_at desc limit 20);
  end if;

  return query
  select p.id, p.username, p.avatar_url, p.nationality,
    case when public.profile_visible(p.id) then public.mutual_friends_count(me, p.id) else 0 end,
    case when public.are_friends(me, p.id) then 'friend'
         when exists (select 1 from friend_requests r where r.sender_id = me and r.receiver_id = p.id) then 'sent'
         when exists (select 1 from friend_requests r where r.sender_id = p.id and r.receiver_id = me) then 'received'
         else 'none' end
  from profiles p
  where p.id <> me and strpos(lower(p.username), q) > 0
    and not public.is_blocked_with(p.id) and not public.is_sanctioned(p.id)
  order by (lower(p.username) = q) desc, (strpos(lower(p.username), q) = 1) desc, p.username
  limit 20;
end $$;

-- Suggestions d'amis : amis en commun, visiteurs du profil, recherches de noms
create function public.friend_suggestions(p_limit int default 10)
returns table (user_id uuid, username text, avatar_url text, nationality text, mutual_count int, from_search boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare me uuid := auth.uid(); my_adult boolean; cutoff date := (current_date - interval '18 years')::date;
begin
  if me is null then raise exception 'Non connecté'; end if;
  select (up.birth_date <= cutoff) into my_adult from user_private up where up.user_id = me;
  if my_adult is null then return; end if;  -- âge inconnu : aucune suggestion

  return query
  with my_friends as (
    select case when f.user_a = me then f.user_b else f.user_a end as fid
    from friendships f where f.user_a = me or f.user_b = me
  ),
  fof as (
    select case when f.user_a = mf.fid then f.user_b else f.user_a end as cid
    from my_friends mf join friendships f on f.user_a = mf.fid or f.user_b = mf.fid
  ),
  viewers as (
    select pv.viewer_id as cid from profile_views pv
    where pv.viewed_id = me and pv.last_viewed_at > now() - interval '30 days'
  ),
  terms as (
    select us.term from user_searches us
    where us.user_id = me and us.searched_at > now() - interval '30 days' order by us.searched_at desc limit 20
  ),
  matches as (
    select p.id as cid from profiles p join terms t on strpos(lower(p.username), t.term) > 0
  ),
  pool as (
    select p.id, p.username, p.avatar_url, p.nationality, p.is_private,
      exists (select 1 from fof where fof.cid = p.id) as via_friends,
      exists (select 1 from viewers v where v.cid = p.id) as via_view,
      exists (select 1 from matches m where m.cid = p.id) as via_search
    from profiles p
    join user_private up on up.user_id = p.id
    where p.id <> me
      and (up.birth_date <= cutoff) = my_adult   -- jamais de mélange mineur / majeur
      and not exists (select 1 from friendships fr where fr.user_a = least(me, p.id) and fr.user_b = greatest(me, p.id))
      and not exists (select 1 from friend_requests r
                      where (r.sender_id = me and r.receiver_id = p.id) or (r.sender_id = p.id and r.receiver_id = me))
      and not public.is_blocked_with(p.id)
      and not public.is_sanctioned(p.id)
      and not exists (select 1 from suggestion_dismissals d
                      where d.user_id = me and d.dismissed_id = p.id and d.created_at > now() - interval '90 days')
  ),
  scored as (
    select pool.*, case when public.profile_visible(pool.id) then public.mutual_friends_count(me, pool.id) else 0 end as mutual
    from pool
    where (pool.via_friends and public.profile_visible(pool.id))   -- profils dont on ne voit pas les amis : exclus
       or (pool.via_view and not pool.is_private)                  -- un visiteur au profil privé reste discret
       or pool.via_search
  )
  select s.id, s.username, s.avatar_url, s.nationality, s.mutual, s.via_search
  from scored s
  order by (s.mutual * 10 + (case when s.via_search then 25 else 0 end) + (case when s.via_view and not s.is_private then 15 else 0 end)) desc,
           s.username
  limit greatest(1, least(coalesce(p_limit, 10), 30));
end $$;

revoke execute on function public.mutual_friends_count(uuid, uuid), public.is_sanctioned(uuid) from public, anon, authenticated;
revoke execute on function public.profile_view_record(uuid), public.people_search(text), public.friend_suggestions(int) from public, anon;
grant execute on function public.profile_view_record(uuid), public.people_search(text), public.friend_suggestions(int) to authenticated;
