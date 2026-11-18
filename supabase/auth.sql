-- ============================================================
-- Authentification : activation du compte après confirmation de
-- l'e-mail, et profil créé aussi pour les comptes Google.
-- À exécuter UNE FOIS, après privacy.sql.
-- ============================================================

-- Le profil n'est créé que lorsque l'adresse e-mail est confirmée :
--  - inscription classique : à la saisie du code de confirmation ;
--  - Google : à la première connexion (l'adresse est déjà vérifiée).
-- Tant que l'e-mail n'est pas confirmé, le compte n'existe pas dans l'application.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  nat text := upper(meta->>'nationality');
  pic text := coalesce(nullif(meta->>'avatar_url', ''), nullif(meta->>'picture', ''));
begin
  if new.email_confirmed_at is null then return new; end if;
  insert into public.profiles (id, username, nationality, avatar_url)
  values (
    new.id,
    left(coalesce(nullif(trim(meta->>'username'), ''), nullif(trim(meta->>'full_name'), ''), split_part(new.email, '@', 1)), 40),
    case when nat ~ '^[A-Z]{2}$' then nat end,
    case when pic ~ '^https://' then pic end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_new_user();
