import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'
import { CURRENCY, MAX_CENTS, MIN_CENTS } from '@/lib/wallet-config'

export const runtime = 'nodejs'

// Crée une session de paiement Stripe pour recharger le portefeuille
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const amount = Number(body?.amount) // en centimes
  if (!Number.isInteger(amount) || amount < MIN_CENTS || amount > MAX_CENTS)
    return NextResponse.json({ error: 'Montant invalide' }, { status: 400 })

  try {
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: { currency: CURRENCY, unit_amount: amount, product_data: { name: 'Recharge du portefeuille' } },
      }],
      client_reference_id: user.id,
      metadata: { user_id: user.id },
      success_url: `${origin}/?wallet=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?wallet=cancel`,
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    })
    // Transaction « en attente » : elle ne crédite rien tant que Stripe n'a pas confirmé
    const { error } = await createAdminClient().from('wallet_transactions').insert({
      user_id: user.id, type: 'topup', amount_cents: amount, currency: CURRENCY,
      status: 'pending', stripe_session_id: session.id,
    })
    if (error) throw error
    return NextResponse.json({ url: session.url })
  } catch (e) {
    console.error('wallet/checkout', e)
    return NextResponse.json({ error: 'Impossible de démarrer le paiement' }, { status: 500 })
  }
}
