-- ============================================================
-- Wallet : solde, historique des transactions, recharge Stripe.
-- À exécuter UNE FOIS, après les scripts précédents.
-- Les soldes ne sont modifiables que par le serveur (clé service_role).
-- ============================================================

create table public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance_cents bigint not null default 0 check (balance_cents >= 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  updated_at timestamptz default now()
);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'topup' check (type in ('topup')),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  stripe_session_id text unique,
  stripe_payment_intent text,
  created_at timestamptz default now(),
  completed_at timestamptz
);
create index on public.wallet_transactions (user_id, created_at desc);

-- Lecture de ses propres données uniquement. Aucune règle d'écriture :
-- le navigateur ne peut ni créditer ni modifier une transaction.
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
create policy "voir mon solde" on public.wallets for select to authenticated using (user_id = auth.uid());
create policy "voir mes transactions" on public.wallet_transactions for select to authenticated using (user_id = auth.uid());

-- Crédite le portefeuille pour un paiement Stripe confirmé (idempotent et atomique)
create function public.wallet_credit(p_session text, p_user uuid, p_amount bigint, p_currency text, p_intent text)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_amount <= 0 then raise exception 'Montant invalide'; end if;

  insert into wallet_transactions (user_id, type, amount_cents, currency, status, stripe_session_id, stripe_payment_intent, completed_at)
  values (p_user, 'topup', p_amount, lower(p_currency), 'completed', p_session, p_intent, now())
  on conflict (stripe_session_id) do update
    set status = 'completed', amount_cents = excluded.amount_cents, currency = excluded.currency,
        stripe_payment_intent = excluded.stripe_payment_intent, completed_at = now()
    where wallet_transactions.status <> 'completed' and wallet_transactions.user_id = excluded.user_id;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;  -- déjà traité : jamais de double crédit

  insert into wallets (user_id, balance_cents, currency) values (p_user, p_amount, lower(p_currency))
  on conflict (user_id) do update
    set balance_cents = wallets.balance_cents + excluded.balance_cents, updated_at = now()
    where wallets.currency = excluded.currency;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Devise du portefeuille incompatible'; end if;
  return true;
end $$;

-- Marque un paiement abandonné ou refusé
create function public.wallet_fail(p_session text) returns void
language sql security definer set search_path = public as $$
  update wallet_transactions set status = 'failed' where stripe_session_id = p_session and status = 'pending'
$$;

-- Ces fonctions ne sont appelables que par le serveur
revoke execute on function public.wallet_credit(text, uuid, bigint, text, text) from public, anon, authenticated;
revoke execute on function public.wallet_fail(text) from public, anon, authenticated;
grant execute on function public.wallet_credit(text, uuid, bigint, text, text) to service_role;
grant execute on function public.wallet_fail(text) to service_role;

alter publication supabase_realtime add table public.wallets, public.wallet_transactions;
