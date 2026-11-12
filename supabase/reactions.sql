-- ============================================================
-- Réactions multiples (publications + commentaires)
-- et réponses aux commentaires.
-- À exécuter UNE FOIS, après schema.sql. Vos anciens j'aime sont
-- conservés (convertis en réaction ❤️).
-- ============================================================

create table public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);
create table public.comment_reactions (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz default now(),
  primary key (comment_id, user_id)
);

-- Reprise des anciens j'aime, puis suppression de la table likes
do $$ begin
  if to_regclass('public.likes') is not null then
    insert into public.post_reactions (post_id, user_id, emoji)
    select post_id, user_id, '❤️' from public.likes;
    drop table public.likes cascade;
  end if;
end $$;
drop function if exists public.notify_like();

-- Réponses aux commentaires (un seul niveau)
alter table public.comments add column parent_id uuid references public.comments(id) on delete cascade;
drop policy if exists "commenter" on public.comments;
create policy "commenter" on public.comments for insert to authenticated
  with check (
    user_id = auth.uid()
    and (parent_id is null or exists (
      select 1 from public.comments c
      where c.id = comments.parent_id and c.parent_id is null and c.post_id = comments.post_id))
  );

-- Notifications : nouveaux types
alter table public.notifications add column emoji text;
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like', 'comment', 'follow', 'reaction', 'reply'));

create function public.notify_reaction() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, actor_id, type, post_id, emoji)
  select p.user_id, new.user_id, 'reaction', new.post_id, new.emoji
  from posts p where p.id = new.post_id and p.user_id <> new.user_id;
  return new;
end $$;
create trigger t_reaction after insert on public.post_reactions for each row execute function public.notify_reaction();

create or replace function public.notify_comment() returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid; parent_author uuid;
begin
  select user_id into owner from posts where id = new.post_id;
  if new.parent_id is not null then
    select user_id into parent_author from comments where id = new.parent_id;
    if parent_author <> new.user_id then
      insert into notifications (user_id, actor_id, type, post_id) values (parent_author, new.user_id, 'reply', new.post_id);
    end if;
  end if;
  if owner <> new.user_id and owner is distinct from parent_author then
    insert into notifications (user_id, actor_id, type, post_id) values (owner, new.user_id, 'comment', new.post_id);
  end if;
  return new;
end $$;

-- Sécurité (RLS)
do $$ declare t text; begin
  foreach t in array array['post_reactions', 'comment_reactions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "lecture %1$s" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "ajout %1$s" on public.%1$I for insert to authenticated with check (user_id = auth.uid())', t);
    execute format('create policy "modif %1$s" on public.%1$I for update to authenticated using (user_id = auth.uid())', t);
    execute format('create policy "retrait %1$s" on public.%1$I for delete to authenticated using (user_id = auth.uid())', t);
  end loop;
end $$;

alter publication supabase_realtime add table public.post_reactions, public.comment_reactions;
