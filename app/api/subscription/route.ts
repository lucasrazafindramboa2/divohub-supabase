import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CURRENCY } from '@/lib/wallet-config'
import { SUBSCRIPTION_PRICE_CENTS } from '@/lib/subscription-config'

export const runtime = 'nodejs'

const ERRORS: Record<string, [string, number]> = {
  INSUFFICIENT_FUNDS: ['Solde insuffisant. Rechargez votre portefeuille.', 402],
  ALREADY_ACTIVE: ['Vous avez déjà un abonnement actif.', 409],
  CURRENCY_MISMATCH: ['La devise de votre portefeuille ne correspond pas à celle de l’abonnement.', 409],
}

// Souscrire, désactiver ou réactiver le renouvellement automatique
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const action = body?.action
  if (!['subscribe', 'cancel', 'resume'].includes(action)) return NextResponse.json({ error: 'Action invalide' }, { status: 400 })

  const admin = createAdminClient()
  try {
    if (action === 'subscribe') {
      // Le prix vient de la configuration serveur, jamais du navigateur
      const { error } = await admin.rpc('subscription_start', {
        p_user: user.id, p_price: SUBSCRIPTION_PRICE_CENTS, p_currency: CURRENCY,
      })
      if (error) {
        const known = Object.entries(ERRORS).find(([code]) => error.message.includes(code))
        if (known) return NextResponse.json({ error: known[1][0] }, { status: known[1][1] })
        throw error
      }
      return NextResponse.json({ ok: true })
    }

    // Le renouvellement ne se règle que sur un abonnement encore actif
    const { data, error } = await admin.from('subscriptions')
      .update({ auto_renew: action === 'resume', updated_at: new Date().toISOString() })
      .eq('user_id', user.id).gt('current_period_end', new Date().toISOString()).select('user_id')
    if (error) throw error
    if (!data?.length) return NextResponse.json({ error: 'Aucun abonnement actif' }, { status: 409 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('subscription', e)
    return NextResponse.json({ error: 'Opération impossible' }, { status: 500 })
  }
}
