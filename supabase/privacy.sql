-- ============================================================
-- Confidentialité du profil : Public ou Privé (amis acceptés).
-- À exécuter UNE FOIS, après nationality.sql.
-- ============================================================

-- Un profil est visible par : son propriétaire ; sinon, hors blocage,
-- tout le monde s'il est public, ou uniquement ses amis acceptés s'il est privé.
-- Cette fonction protège déjà les informations du profil, la galerie,
-- les listes d'abonnements et d'amis, et les publications hors groupe.
create or replace function public.profile_visible(uid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select uid = auth.uid() or (
    not public.is_blocked_with(uid)
    and (exists (select 1 from profiles p where p.id = uid and not p.is_private)
         or public.are_friends(auth.uid(), uid)))
$$;

-- Les stories suivent la confidentialité du profil de leur auteur
drop policy "lecture stories" on public.stories;
create policy "lecture stories" on public.stories for select to authenticated
  using (public.profile_visible(user_id));
