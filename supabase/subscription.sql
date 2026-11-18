-- ============================================================
-- Abonnement mensuel payé avec le wallet.
-- À exécuter UNE FOIS, après wallet.sql.
-- Le prix est défini dans la configuration de l'application ; il est
-- mémorisé à la souscription et réutilisé pour les renouvellements.
-- ============================================================

-- Les débits du wallet apparaissent dans l'historique
alter table public.wallet_transactions drop constraint if exists wallet_transactions_type_check;
alter table public.wallet_transactions add constraint wallet_transactions_type_check
  check (type in ('topup', 'subscription', 'subscription_renewal'));

create table public.subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  price_cents bigint not null check (price_cents > 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  started_at timestamptz not null default now(),
  current_period_end timestamptz not null,
  auto_renew boolean not null default true,
  last_error text,
  updated_at timestamptz default now()
);
create index on public.subscriptions (current_period_end) where auto_renew;

-- Lecture de son propre abonnement uniquement ; aucune écriture depuis le navigateur
alter table public.subscriptions enable row level security;
create policy "voir mon abonnement" on public.subscriptions for select to authenticated using (user_id = auth.uid());

-- Souscription : débit du wallet + activation pour 1 mois (atomique, appelée par le serveur)
create function public.subscription_start(p_user uuid, p_price bigint, p_currency text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare w wallets%rowtype; s subscriptions%rowtype; v_end timestamptz;
begin
  if p_price <= 0 then raise exception 'INVALID_PRICE'; end if;
  -- Le wallet est verrouillé en premier : deux clics simultanés sont traités l'un après l'autre
  select * into w from wallets where user_id = p_user for update;
  if not found or w.balance_cents < p_price then raise exception 'INSUFFICIENT_FUNDS'; end if;
  if w.currency <> lower(p_currency) then raise exception 'CURRENCY_MISMATCH'; end if;
  select * into s from subscriptions where user_id = p_user for update;
  if found and s.current_period_end > now() then raise exception 'ALREADY_ACTIVE'; end if;

  update wallets set balance_cents = balance_cents - p_price, updated_at = now() where user_id = p_user;
  insert into wallet_transactions (user_id, type, amount_cents, currency, status, completed_at)
  values (p_user, 'subscription', p_price, w.currency, 'completed', now());

  v_end := now() + interval '1 month';
  insert into subscriptions (user_id, price_cents, currency, started_at, current_period_end, auto_renew, last_error)
  values (p_user, p_price, w.currency, now(), v_end, true, null)
  on conflict (user_id) do update
    set price_cents = excluded.price_cents, currency = excluded.currency, started_at = now(),
        current_period_end = v_end, auto_renew = true, last_error = null, updated_at = now();
  return v_end;
end $$;

-- Renouvellement des abonnements arrivés à échéance (planifié ci-dessous)
create function public.process_subscription_renewals() returns int
language plpgsql security definer set search_path = public as $$
declare u uuid; s subscriptions%rowtype; w wallets%rowtype; has_w boolean; v_from timestamptz; n int := 0;
begin
  for u in select user_id from subscriptions where auto_renew and current_period_end <= now() loop
    select * into w from wallets where user_id = u for update;
    has_w := found;
    select * into s from subscriptions where user_id = u for update;
    if not found or not s.auto_renew or s.current_period_end > now() then continue; end if;

    if has_w and w.balance_cents >= s.price_cents and w.currency = s.currency then
      update wallets set balance_cents = balance_cents - s.price_cents, updated_at = now() where user_id = u;
      insert into wallet_transactions (user_id, type, amount_cents, currency, status, completed_at)
      values (u, 'subscription_renewal', s.price_cents, s.currency, 'completed', now());
      -- Garde la date d'anniversaire, sauf si le retard dépasse 24 h
      v_from := case when s.current_period_end > now() - interval '1 day' then s.current_period_end else now() end;
      update subscriptions set current_period_end = v_from + interval '1 month', last_error = null, updated_at = now()
      where user_id = u;
      n := n + 1;
    else
      -- Solde insuffisant : l'abonnement expire et ne sera plus débité automatiquement
      update subscriptions set auto_renew = false, last_error = 'INSUFFICIENT_FUNDS', updated_at = now() where user_id = u;
    end if;
  end loop;
  return n;
end $$;

-- Pour réserver des fonctionnalités aux abonnés (usage futur, ex. dans une règle RLS)
create function public.has_active_subscription() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from subscriptions where user_id = auth.uid() and current_period_end > now())
$$;

revoke execute on function public.subscription_start(uuid, bigint, text) from public, anon, authenticated;
revoke execute on function public.process_subscription_renewals() from public, anon, authenticated;
grant execute on function public.subscription_start(uuid, bigint, text) to service_role;
grant execute on function public.process_subscription_renewals() to service_role;

alter publication supabase_realtime add table public.subscriptions;

-- Planification automatique toutes les 15 minutes (extension pg_cron)
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('subscription-renewals', '*/15 * * * *', 'select public.process_subscription_renewals()');
exception when others then
  raise notice 'pg_cron indisponible (%). Activez-le dans Database > Extensions puis relancez ce dernier bloc.', sqlerrm;
end $$;
