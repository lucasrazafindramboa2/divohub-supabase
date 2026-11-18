-- ============================================================
-- Signalements (comptes et publications), modération, comptes
-- administrateurs. À exécuter UNE FOIS, après auth.sql.
-- ============================================================

-- Comptes administrateurs : AUCUNE écriture possible depuis l'application.
-- On les crée uniquement ici, en SQL (voir la fin du script).
create table public.admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz default now()
);
create function public.is_admin() returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid())
$$;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('user', 'post')),
  reported_user_id uuid not null references public.profiles(id) on delete cascade,  -- le compte, ou l'auteur de la publication
  post_id uuid references public.posts(id) on delete set null,
  post_snapshot text,   -- copie du texte au moment du signalement (preuve)
  post_image text,
  reason text not null check (reason in ('harassment', 'spam', 'inappropriate', 'impersonation', 'hate', 'violence', 'scam', 'privacy', 'other')),
  details text check (char_length(details) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'in_review', 'resolved', 'dismissed')),
  resolution text check (resolution in ('dismiss', 'warn', 'remove_post', 'suspend', 'ban')),
  admin_note text check (char_length(admin_note) <= 500),
  handled_by uuid references public.profiles(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  check (target_type = 'post' or post_id is null)
);
create index on public.reports (status, created_at desc);
create index on public.reports (reporter_id, created_at desc);
-- Un seul signalement ouvert par personne et par cible
create unique index reports_open_once on public.reports (reporter_id, target_type, coalesce(post_id, reported_user_id))
  where status in ('pending', 'in_review');

-- Historique des décisions (traçabilité)
create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports(id) on delete set null,
  admin_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('review', 'dismiss', 'warn', 'remove_post', 'suspend', 'ban', 'unban')),
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  note text,
  until timestamptz,
  created_at timestamptz not null default now()
);
create index on public.moderation_actions (target_user_id, created_at desc);

-- Notifications de modération (avertissement, publication supprimée)
alter table public.notifications add column message text;
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like', 'comment', 'follow', 'reaction', 'reply', 'friend_request', 'friend_accept', 'moderation'));

create function public.report_reason_label(r text) returns text language sql immutable as $$
  select case r when 'harassment' then 'harcèlement' when 'spam' then 'spam' when 'inappropriate' then 'contenu inapproprié'
    when 'impersonation' then 'usurpation d’identité' when 'hate' then 'discours haineux' when 'violence' then 'violence ou menaces'
    when 'scam' then 'arnaque ou fraude' when 'privacy' then 'atteinte à la vie privée' else 'autre' end
$$;

-- Créer un signalement (seul moyen : aucune écriture directe dans la table)
create function public.report_submit(p_type text, p_target uuid, p_reason text, p_details text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); v_user uuid; v_post uuid; v_snapshot text; v_image text;
  v_recent int; v_dismissed int; v_upheld int; rid uuid;
begin
  if me is null then raise exception 'Non connecté'; end if;
  if p_type not in ('user', 'post') then raise exception 'Type de signalement invalide'; end if;
  if p_reason = 'other' and char_length(trim(coalesce(p_details, ''))) < 10 then
    raise exception 'Expliquez brièvement votre signalement (10 caractères minimum)';
  end if;

  -- Anti-abus : plafond quotidien
  select count(*) into v_recent from reports where reporter_id = me and created_at > now() - interval '24 hours';
  if v_recent >= 10 then raise exception 'Limite de 10 signalements par jour atteinte'; end if;
  -- Anti-abus : signalements systématiquement rejetés
  select count(*) filter (where status = 'dismissed'), count(*) filter (where status = 'resolved')
    into v_dismissed, v_upheld from reports where reporter_id = me and created_at > now() - interval '30 days';
  if v_dismissed >= 5 and v_upheld = 0 then
    raise exception 'Vos derniers signalements ont été rejetés : les nouveaux signalements sont suspendus temporairement';
  end if;

  if p_type = 'user' then
    if p_target = me then raise exception 'Vous ne pouvez pas vous signaler vous-même'; end if;
    if not exists (select 1 from profiles where id = p_target) then raise exception 'Utilisateur introuvable'; end if;
    v_user := p_target;
  else
    -- On ne peut signaler qu'une publication que l'on a le droit de voir
    select p.user_id, left(p.content, 500), p.image_url into v_user, v_snapshot, v_image
    from posts p where p.id = p_target and public.can_view_post(p.id);
    if v_user is null then raise exception 'Publication introuvable'; end if;
    if v_user = me then raise exception 'Vous ne pouvez pas signaler votre propre publication'; end if;
    v_post := p_target;
  end if;

  insert into reports (reporter_id, target_type, reported_user_id, post_id, post_snapshot, post_image, reason, details)
  values (me, p_type, v_user, v_post, v_snapshot, v_image, p_reason, nullif(trim(coalesce(p_details, '')), ''))
  returning id into rid;
  return rid;
exception when unique_violation then
  raise exception 'Vous avez déjà signalé cet élément : il est en cours de traitement';
end $$;

-- Mesures de modération (réservées aux administrateurs)
create function public.admin_handle_report(p_report uuid, p_action text, p_note text default null, p_days int default 7)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r reports%rowtype; v_until timestamptz; v_msg text;
begin
  if not public.is_admin() then raise exception 'Accès réservé aux administrateurs'; end if;
  if p_action not in ('review', 'dismiss', 'warn', 'remove_post', 'suspend', 'ban', 'unban') then raise exception 'Action invalide'; end if;
  select * into r from reports where id = p_report for update;
  if not found then raise exception 'Signalement introuvable'; end if;
  if p_action <> 'unban' and r.status in ('resolved', 'dismissed') then raise exception 'Ce signalement est déjà clos'; end if;
  if p_action in ('warn', 'remove_post', 'suspend', 'ban') and exists (select 1 from admins where user_id = r.reported_user_id) then
    raise exception 'Impossible d’agir sur un compte administrateur';
  end if;

  if p_action = 'review' then
    update reports set status = 'in_review', handled_by = me where id = p_report;
  elsif p_action = 'dismiss' then
    update reports set status = 'dismissed', resolution = 'dismiss', admin_note = p_note, handled_by = me, handled_at = now() where id = p_report;
  elsif p_action = 'unban' then
    update auth.users set banned_until = null where id = r.reported_user_id;
  else
    -- Clôture ce signalement et les autres signalements ouverts sur la même cible
    update reports set status = 'resolved', resolution = p_action, admin_note = coalesce(p_note, admin_note), handled_by = me, handled_at = now()
    where status in ('pending', 'in_review') and target_type = r.target_type and (
      id = p_report
      or (r.target_type = 'post' and post_id = r.post_id)
      or (r.target_type = 'user' and reported_user_id = r.reported_user_id));

    if p_action = 'warn' then
      v_msg := 'Vous avez reçu un avertissement de la modération (motif : ' || public.report_reason_label(r.reason) || '). Merci de respecter les règles de la communauté.';
    elsif p_action = 'remove_post' then
      if r.post_id is null then raise exception 'Cette publication a déjà été supprimée'; end if;
      delete from posts where id = r.post_id;
      v_msg := 'Une de vos publications a été supprimée par la modération (motif : ' || public.report_reason_label(r.reason) || ').';
    elsif p_action = 'suspend' then
      v_until := now() + make_interval(days => greatest(1, least(coalesce(p_days, 7), 365)));
      update auth.users set banned_until = v_until where id = r.reported_user_id;
    elsif p_action = 'ban' then
      v_until := timestamptz '2999-12-31';
      update auth.users set banned_until = v_until where id = r.reported_user_id;
    end if;
    if v_msg is not null then
      insert into notifications (user_id, actor_id, type, message) values (r.reported_user_id, r.reported_user_id, 'moderation', v_msg);
    end if;
  end if;

  insert into moderation_actions (report_id, admin_id, action, target_user_id, note, until)
  values (p_report, me, p_action, r.reported_user_id, p_note, v_until);
end $$;

revoke execute on function public.report_submit(text, uuid, text, text), public.admin_handle_report(uuid, text, text, int) from public, anon;
grant execute on function public.report_submit(text, uuid, text, text), public.admin_handle_report(uuid, text, text, int) to authenticated;

-- Sécurité (RLS) : lecture seule ; toutes les écritures passent par les fonctions ci-dessus
alter table public.admins enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;
create policy "voir mon statut" on public.admins for select to authenticated using (user_id = auth.uid());
create policy "voir les signalements" on public.reports for select to authenticated using (reporter_id = auth.uid() or public.is_admin());
create policy "voir l'historique" on public.moderation_actions for select to authenticated using (public.is_admin());

alter publication supabase_realtime add table public.reports;

-- ------------------------------------------------------------
-- CRÉER UN ADMINISTRATEUR (à exécuter à part, avec votre adresse) :
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'votre-adresse@exemple.com';
-- Pour retirer ses droits :
--   delete from public.admins where user_id = (select id from auth.users where email = 'votre-adresse@exemple.com');
-- ------------------------------------------------------------
