-- ============================================================
-- Nationalité et drapeau.
-- La nationalité devient une donnée publique du profil (comme le nom et
-- la photo) : elle s'affiche en drapeau à côté de la photo, saisie à
-- l'inscription, et sert de critère de ciblage géographique publicitaire.
-- À exécuter UNE FOIS, après social_relations.sql.
-- ============================================================

alter table public.profiles add column nationality text check (nationality ~ '^[A-Z]{2}$');
comment on column public.profiles.nationality is
  'Code pays ISO 3166-1 alpha-2 (ex. FR), déclaré par l''utilisateur. Affiché publiquement sous forme de drapeau ; critère de ciblage géographique publicitaire.';

-- Reprise de l'existant : la colonne de profile_details est déplacée
update public.profiles p set nationality = d.nationality
from public.profile_details d where d.user_id = p.id and d.nationality is not null;
alter table public.profile_details drop column nationality;

create index on public.profiles (nationality) where nationality is not null;

-- Inscription : lit la nationalité choisie (une valeur invalide est ignorée)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare nat text := upper(new.raw_user_meta_data->>'nationality');
begin
  insert into public.profiles (id, username, nationality)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
          case when nat ~ '^[A-Z]{2}$' then nat end);
  return new;
end $$;

-- Taille de l'audience par pays, pour préparer les futures campagnes (serveur uniquement)
create function public.audience_by_country() returns table (country text, users bigint)
language sql security definer stable set search_path = public as $$
  select nationality, count(*) from profiles where nationality is not null group by nationality order by count(*) desc
$$;
revoke execute on function public.audience_by_country() from public, anon, authenticated;
grant execute on function public.audience_by_country() to service_role;
