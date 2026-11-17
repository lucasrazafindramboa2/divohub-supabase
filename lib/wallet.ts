import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { CURRENCY } from '@/lib/wallet-config'

// Applique l'état réel d'une session Stripe au portefeuille (idempotent).
// Le montant crédité est celui confirmé par Stripe, jamais celui envoyé par le navigateur.
export async function settleSession(session: Stripe.Checkout.Session, forceFail = false) {
  const admin = createAdminClient()
  const userId = session.metadata?.user_id
  if (!userId) return 'ignored' as const

  if (session.payment_status === 'paid') {
    const intent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null
    const { error } = await admin.rpc('wallet_credit', {
      p_session: session.id, p_user: userId, p_amount: session.amount_total ?? 0,
      p_currency: session.currency ?? CURRENCY, p_intent: intent,
    })
    if (error) throw error
    return 'completed' as const
  }
  if (session.status === 'expired' || forceFail) {
    const { error } = await admin.rpc('wallet_fail', { p_session: session.id })
    if (error) throw error
    return 'failed' as const
  }
  return 'pending' as const
}
