import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { settleSession } from '@/lib/wallet'

export const runtime = 'nodejs'

// Appelé par Stripe uniquement : la signature est vérifiée avant tout traitement
export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!signature || !secret) return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(await req.text(), signature, secret)
  } catch {
    return NextResponse.json({ error: 'Signature invalide' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.expired':
        await settleSession(event.data.object as Stripe.Checkout.Session)
        break
      case 'checkout.session.async_payment_failed':
        await settleSession(event.data.object as Stripe.Checkout.Session, true)
        break
    }
  } catch (e) {
    console.error('stripe/webhook', e)
    return NextResponse.json({ error: 'Traitement échoué' }, { status: 500 }) // Stripe réessaiera
  }
  return NextResponse.json({ received: true })
}
