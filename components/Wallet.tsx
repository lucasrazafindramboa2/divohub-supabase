'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CURRENCY, MAX_CENTS, MIN_CENTS } from '@/lib/wallet-config'

type Tx = { id: string; type: string; amount_cents: number; currency: string; status: 'pending' | 'completed' | 'failed'; created_at: string }
type Notice = { kind: 'info' | 'ok' | 'error'; text: string }
const STATUS = { pending: 'En attente', completed: 'Confirmé', failed: 'Échoué' }
const PRESETS = [500, 1000, 2000, 5000]
const money = (cents: number, currency = CURRENCY) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)

export default function Wallet({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [balance, setBalance] = useState(0)
  const [txs, setTxs] = useState<Tx[]>([])
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  const load = useCallback(async () => {
    const [w, t] = await Promise.all([
      supabase.from('wallets').select('balance_cents').eq('user_id', userId).maybeSingle(),
      supabase.from('wallet_transactions').select('id,type,amount_cents,currency,status,created_at')
        .order('created_at', { ascending: false }).limit(50),
    ])
    setBalance(w.data?.balance_cents ?? 0)
    setTxs((t.data as Tx[]) ?? [])
  }, [supabase, userId])

  // Retour de Stripe : le serveur revérifie le paiement avant d'afficher le résultat
  async function verify(sessionId: string) {
    setNotice({ kind: 'info', text: 'Vérification du paiement…' })
    try {
      const res = await fetch('/api/wallet/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setNotice(data.status === 'completed' ? { kind: 'ok', text: 'Paiement confirmé. Votre solde a été mis à jour.' }
        : data.status === 'failed' ? { kind: 'error', text: 'Le paiement a échoué ou a expiré.' }
        : { kind: 'info', text: 'Paiement en cours de traitement. Le solde sera mis à jour automatiquement.' })
    } catch {
      setNotice({ kind: 'error', text: 'Vérification impossible. Le solde sera mis à jour dès que Stripe confirmera.' })
    }
    load()
  }

  useEffect(() => {
    load()
    const params = new URLSearchParams(window.location.search)
    const status = params.get('wallet'), sessionId = params.get('session_id')
    if (status) window.history.replaceState(null, '', window.location.pathname)
    if (status === 'cancel') setNotice({ kind: 'info', text: 'Paiement annulé. Aucun montant n’a été débité.' })
    if (status === 'success' && sessionId) verify(sessionId)

    const ch = supabase.channel('wallet')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_transactions' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function topUp(cents: number) {
    if (!Number.isInteger(cents) || cents < MIN_CENTS || cents > MAX_CENTS)
      return setNotice({ kind: 'error', text: `Montant autorisé : de ${money(MIN_CENTS)} à ${money(MAX_CENTS)}.` })
    setBusy(true); setNotice(null)
    try {
      const res = await fetch('/api/wallet/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: cents }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Impossible de démarrer le paiement')
      window.location.href = data.url
    } catch (e) {
      setBusy(false); setNotice({ kind: 'error', text: (e as Error).message })
    }
  }

  const customCents = Math.round(parseFloat(custom.replace(',', '.')) * 100)

  return (
    <div className="wallet">
      {notice && <p className={`notice ${notice.kind}`}>{notice.text}</p>}

      <section className="card balance">
        <span className="sub">Solde disponible</span>
        <b>{money(balance)}</b>
      </section>

      <section className="card">
        <h2>Ajouter de l’argent</h2>
        <p className="sub">Paiement sécurisé par Stripe. De {money(MIN_CENTS)} à {money(MAX_CENTS)} par recharge.</p>
        <div className="amounts">
          {PRESETS.map(c => <button key={c} disabled={busy} onClick={() => topUp(c)}>{money(c)}</button>)}
        </div>
        <form className="row" onSubmit={e => { e.preventDefault(); topUp(customCents) }}>
          <input inputMode="decimal" placeholder="Autre montant" value={custom} onChange={e => setCustom(e.target.value)} />
          <button className="go" disabled={busy || !custom}>{busy ? 'Redirection…' : 'Recharger'}</button>
        </form>
      </section>

      <section className="card">
        <h2>Historique des transactions</h2>
        <ul className="people">
          {txs.length === 0 && <li className="sub">Aucune transaction pour l’instant.</li>}
          {txs.map(t => (
            <li key={t.id}>
              <span>
                <strong>Recharge</strong><br />
                <span className="sub">{new Date(t.created_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </span>
              <span className="tx-right">
                <span className={t.status === 'completed' ? 'tx-amount plus' : 'tx-amount'}>
                  {t.status === 'completed' ? '+' : ''}{money(t.amount_cents, t.currency)}
                </span>
                <span className="tag">{STATUS[t.status]}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
