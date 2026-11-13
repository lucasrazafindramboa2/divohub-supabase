-- ============================================================
-- Groupes publics / privés, rôles (admin, membre), demandes
-- d'adhésion. À exécuter UNE FOIS, après schema.sql,
-- messaging.sql et reactions.sql.
-- ============================================================

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  description text check (char_length(description) <= 300),
  is_private boolean not null default false,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz default now()
);
create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz default now(),
  primary key (group_id, user_id)
);
create table public.group_requests (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (group_id, user_id)
);
alter table public.posts add column group_id uuid references public.groups(id) on delete cascade;
create index on public.posts (group_id, created_at desc);

-- Fonctions de contrôle d'accès
create function public.is_group_member(gid uuid) returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid())
$$;
create function public.is_group_admin(gid uuid) returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid() and role = 'admin')
$$;
-- Publication hors groupe, groupe public, ou groupe dont on est membre
create function public.can_view_group(gid uuid) returns boolean language sql security definer stable set search_path = public as $$
  select gid is null or exists (
    select 1 from groups g where g.id = gid and (
      not g.is_private or exists (select 1 from group_members m where m.group_id = g.id and m.user_id = auth.uid())))
$$;
create function public.can_view_post(pid uuid) returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from posts p where p.id = pid and public.can_view_group(p.group_id))
$$;

-- Le créateur devient automatiquement admin
create function public.add_group_creator() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into group_members (group_id, user_id, role) values (new.id, new.created_by, 'admin');
  return new;
end $$;
create trigger t_group_creator after insert on public.groups for each row execute function public.add_group_creator();

-- Sécurité (RLS) : groupes, membres, demandes
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_requests enable row level security;

create policy "voir les groupes" on public.groups for select to authenticated using (true);
create policy "creer un groupe" on public.groups for insert to authenticated with check (created_by = auth.uid());
create policy "modifier son groupe" on public.groups for update to authenticated using (public.is_group_admin(id));
create policy "supprimer son groupe" on public.groups for delete to authenticated using (created_by = auth.uid());

create policy "voir les membres" on public.group_members for select to authenticated
  using (user_id = auth.uid() or public.can_view_group(group_id));
create policy "rejoindre ou ajouter" on public.group_members for insert to authenticated
  with check (public.is_group_admin(group_id) or (
    user_id = auth.uid() and role = 'member'
    and exists (select 1 from public.groups g where g.id = group_members.group_id and not g.is_private)));
create policy "changer un role" on public.group_members for update to authenticated using (public.is_group_admin(group_id));
create policy "quitter ou retirer" on public.group_members for delete to authenticated
  using (user_id = auth.uid() or public.is_group_admin(group_id));

create policy "voir les demandes" on public.group_requests for select to authenticated
  using (user_id = auth.uid() or public.is_group_admin(group_id));
create policy "demander a rejoindre" on public.group_requests for insert to authenticated
  with check (user_id = auth.uid() and not public.is_group_member(group_id)
    and exists (select 1 from public.groups g where g.id = group_requests.group_id and g.is_private));
create policy "annuler ou refuser" on public.group_requests for delete to authenticated
  using (user_id = auth.uid() or public.is_group_admin(group_id));

-- Contenu protégé : publications, commentaires, votes, réactions
drop policy "lecture posts" on public.posts;
create policy "lecture posts" on public.posts for select to authenticated using (public.can_view_group(group_id));
drop policy "publier" on public.posts;
create policy "publier" on public.posts for insert to authenticated
  with check (user_id = auth.uid() and (group_id is null or public.is_group_member(group_id)));

do $$ declare t text; begin
  foreach t in array array['poll_options', 'poll_votes', 'comments', 'post_reactions'] loop
    execute format('drop policy "lecture %1$s" on public.%1$I', t);
    execute format('create policy "lecture %1$s" on public.%1$I for select to authenticated using (public.can_view_post(post_id))', t);
  end loop;
end $$;
drop policy "lecture comment_reactions" on public.comment_reactions;
create policy "lecture comment_reactions" on public.comment_reactions for select to authenticated
  using (exists (select 1 from public.comments c where c.id = comment_reactions.comment_id));

alter publication supabase_realtime add table public.groups, public.group_members, public.group_requests;
