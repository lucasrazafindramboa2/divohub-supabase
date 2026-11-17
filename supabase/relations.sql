-- ============================================================
-- Profil : publications et relations (amis, groupes, abonnés).
-- À exécuter UNE FOIS, après profile.sql.
-- "Amis" = deux personnes abonnées l'une à l'autre (pas de nouvelle table).
-- ============================================================

create index if not exists follows_following_idx on public.follows (following_id);

-- Les abonnements d'un profil privé ne sont visibles que par les personnes concernées
drop policy "lecture follows" on public.follows;
create policy "lecture follows" on public.follows for select to authenticated
  using (follower_id = auth.uid() or following_id = auth.uid()
    or (public.profile_visible(follower_id) and public.profile_visible(following_id)));

-- Les publications hors groupe d'un profil privé ne sont visibles que par leur auteur
create or replace function public.can_view_post(pid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from posts p
    where p.id = pid and public.can_view_group(p.group_id)
      and (p.group_id is not null or public.profile_visible(p.user_id)))
$$;
drop policy "lecture posts" on public.posts;
create policy "lecture posts" on public.posts for select to authenticated
  using (public.can_view_group(group_id) and (group_id is not null or public.profile_visible(user_id)));
