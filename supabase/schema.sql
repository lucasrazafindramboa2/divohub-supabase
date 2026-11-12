-- ============================================================
-- Réseau social : publications, sondages, votes, likes,
-- commentaires, abonnements, notifications, stories
-- À exécuter AVANT messaging.sql. Efface les tables du réseau social
-- (pas la messagerie). Les comptes sont conservés.
-- ============================================================

drop table if exists public.story_reactions, public.story_views, public.stories,
  public.notifications, public.follows, public.comments, public.likes,
  public.poll_votes, public.poll_options, public.posts cascade;

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

-- Publications : 'post' (texte + photo), 'poll' (oui/non), 'vote' (choix personnalisés)
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null default 'post' check (kind in ('post', 'poll', 'vote')),
  content text not null check (char_length(content) between 1 and 2000),
  image_url text,
  created_at timestamptz default now()
);
create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  position int not null default 0
);
create table public.poll_votes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  primary key (post_id, user_id)
);
create table public.likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  primary key (post_id, user_id)
);
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz default now()
);
create table public.follows (
  follower_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('like', 'comment', 'follow')),
  post_id uuid references public.posts(id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz default now()
);
-- Stories (visibles 24 h côté application), vues et réactions
create table public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  image_url text not null,
  caption text,
  created_at timestamptz default now()
);
create table public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  primary key (story_id, viewer_id)
);
create table public.story_reactions (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  emoji text not null,
  primary key (story_id, user_id)
);

-- Notifications automatiques (j'aime, commentaire, abonnement)
create function public.notify_like() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, actor_id, type, post_id)
  select p.user_id, new.user_id, 'like', new.post_id from posts p where p.id = new.post_id and p.user_id <> new.user_id;
  return new;
end $$;
create function public.notify_comment() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, actor_id, type, post_id)
  select p.user_id, new.user_id, 'comment', new.post_id from posts p where p.id = new.post_id and p.user_id <> new.user_id;
  return new;
end $$;
create function public.notify_follow() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, actor_id, type) values (new.following_id, new.follower_id, 'follow');
  return new;
end $$;
create trigger t_like after insert on public.likes for each row execute function public.notify_like();
create trigger t_comment after insert on public.comments for each row execute function public.notify_comment();
create trigger t_follow after insert on public.follows for each row execute function public.notify_follow();

-- Sécurité (RLS)
do $$ declare t text; begin
  foreach t in array array['profiles','posts','poll_options','poll_votes','likes','comments','follows','notifications','stories','story_views','story_reactions'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['posts','poll_options','poll_votes','likes','comments','follows','stories'] loop
    execute format('create policy "lecture %1$s" on public.%1$I for select to authenticated using (true)', t);
  end loop;
end $$;

drop policy if exists "profils lisibles" on public.profiles;
drop policy if exists "modifier son profil" on public.profiles;
create policy "profils lisibles" on public.profiles for select to authenticated using (true);
create policy "modifier son profil" on public.profiles for update to authenticated using (id = auth.uid());

create policy "publier" on public.posts for insert to authenticated with check (user_id = auth.uid());
create policy "supprimer sa publication" on public.posts for delete to authenticated using (user_id = auth.uid());
create policy "ajouter des choix" on public.poll_options for insert to authenticated
  with check (exists (select 1 from public.posts p where p.id = poll_options.post_id and p.user_id = auth.uid()));
create policy "voter" on public.poll_votes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.poll_options o where o.id = poll_votes.option_id and o.post_id = poll_votes.post_id));
create policy "aimer" on public.likes for insert to authenticated with check (user_id = auth.uid());
create policy "ne plus aimer" on public.likes for delete to authenticated using (user_id = auth.uid());
create policy "commenter" on public.comments for insert to authenticated with check (user_id = auth.uid());
create policy "supprimer son commentaire" on public.comments for delete to authenticated using (user_id = auth.uid());
create policy "suivre" on public.follows for insert to authenticated with check (follower_id = auth.uid());
create policy "ne plus suivre" on public.follows for delete to authenticated using (follower_id = auth.uid());
create policy "mes notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "marquer comme lues" on public.notifications for update to authenticated using (user_id = auth.uid());
create policy "publier une story" on public.stories for insert to authenticated with check (user_id = auth.uid());
create policy "supprimer sa story" on public.stories for delete to authenticated using (user_id = auth.uid());
create policy "enregistrer une vue" on public.story_views for insert to authenticated with check (viewer_id = auth.uid());
create policy "voir les vues" on public.story_views for select to authenticated
  using (viewer_id = auth.uid() or exists (select 1 from public.stories s where s.id = story_id and s.user_id = auth.uid()));
create policy "reagir" on public.story_reactions for insert to authenticated with check (user_id = auth.uid());
create policy "changer sa reaction" on public.story_reactions for update to authenticated using (user_id = auth.uid());
create policy "voir les reactions" on public.story_reactions for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.stories s where s.id = story_id and s.user_id = auth.uid()));

-- Photos (stockage public en lecture, envoi dans son propre dossier)
insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict (id) do nothing;
drop policy if exists "media lecture" on storage.objects;
drop policy if exists "media envoi" on storage.objects;
create policy "media lecture" on storage.objects for select using (bucket_id = 'media');
create policy "media envoi" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- Temps réel
alter publication supabase_realtime add table public.posts, public.likes, public.comments,
  public.poll_votes, public.notifications, public.stories;
