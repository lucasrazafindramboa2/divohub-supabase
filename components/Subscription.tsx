'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CURRENCY } from '@/lib/wallet-config'
import { SUBSCRIPTION_PRICE_CENTS } from '@/lib/subscription-config'

type Sub = { price_cents: number; currency: string; current_period_end: string; auto_renew: boolean; last_error: string | null }
type Action = 'subscribe' | 'cancel' | 'resume'
const money = (cents: number, currency = CURRENCY) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
const fmtDate = (d: string) => new Date(d).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })

export default function Subscription({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [sub, setSub] = useState<Sub | null>(null)
  const [balance, setBalance] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    const [s, w] = await Promise.all([
      supabase.from('subscriptions').select('price_cents,currency,current_period_end,auto_renew,last_error').eq('user_id', userId).maybeSingle(),
      supabase.from('wallets').select('balance_cents').eq('user_id', userId).maybeSingle(),
    ])
    setSub(s.data as Sub | null)
    setBalance(w.data?.balance_cents ?? 0)
  }, [supabase, userId])

  useEffect(() => {
    load()
    const ch = supabase.channel('subscription')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, load)
      .subscribe()
    const t = setInterval(() => setNow(Date.now()), 30000) // l'expiration s'affiche sans recharger la page
    return () => { supabase.removeChannel(ch); clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function act(action: Action) {
    if (action === 'subscribe' && !confirm(`Souscrire pour ${money(SUBSCRIPTION_PRICE_CENTS)} (1 mois), payé avec votre portefeuille ?`)) return
    setBusy(true); setNotice(null)
    try {
      const res = await fetch('/api/subscription', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Opération impossible')
      setNotice({
        kind: 'ok',
        text: action === 'subscribe' ? 'Abonnement activé.' : action === 'cancel' ? 'Renouvellement automatique désactivé.' : 'Renouvellement automatique réactivé.',
      })
      await load()
    } catch (e) {
      setNotice({ kind: 'error', text: (e as Error).message })
    } finally { setBusy(false) }
  }

  const active = !!sub && new Date(sub.current_period_end).getTime() > now
  const daysLeft = sub ? Math.max(0, Math.ceil((new Date(sub.current_period_end).getTime() - now) / 864e5)) : 0
  const enough = balance >= SUBSCRIPTION_PRICE_CENTS

  return (
    <section className="card">
      <header className="sub-head">
        <h2>Abonnement mensuel</h2>
        <span className={active ? 'tag ok' : 'tag off'}>{active ? 'Actif' : sub ? 'Expiré' : 'Non abonné'}</span>
      </header>
      {notice && <p className={`notice ${notice.kind}`}>{notice.text}</p>}

      {active && sub ? (
        <>
          <p>Expire le <strong>{fmtDate(sub.current_period_end)}</strong> ({daysLeft} jour{daysLeft > 1 ? 's' : ''} restant{daysLeft > 1 ? 's' : ''}).</p>
          <p className="sub">
            {sub.auto_renew
              ? `Renouvellement automatique : ${money(sub.price_cents, sub.currency)} seront prélevés sur votre portefeuille à cette date.`
              : 'Renouvellement automatique désactivé : l’abonnement prendra fin à cette date.'}
          </p>
          <div className="actions">
            <button className="ghost" disabled={busy} onClick={() => act(sub.auto_renew ? 'cancel' : 'resume')}>
              {sub.auto_renew ? 'Désactiver le renouvellement' : 'Réactiver le renouvellement'}
            </button>
          </div>
        </>
      ) : (
        <>
          {sub && (
            <p className="sub">
              Expiré le {fmtDate(sub.current_period_end)}.
              {sub.last_error === 'INSUFFICIENT_FUNDS' && ' Le renouvellement a échoué faute de solde suffisant.'}
            </p>
          )}
          <p>{money(SUBSCRIPTION_PRICE_CENTS)} pour 1 mois, payé avec votre portefeuille.</p>
          {!enough && <p className="sub">Solde insuffisant ({money(balance)}). Rechargez votre portefeuille ci-dessous.</p>}
          <div className="actions">
            <button className="go" disabled={busy || !enough} onClick={() => act('subscribe')}>
              {busy ? 'Traitement…' : sub ? 'Se réabonner' : 'S’abonner'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
