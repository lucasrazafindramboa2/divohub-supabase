import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'
import { settleSession } from '@/lib/wallet'

export const runtime = 'nodejs'

// Au retour de Stripe : revérifie le paiement directement auprès de Stripe (côté serveur)
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const sessionId = typeof body?.session_id === 'string' ? body.session_id : ''
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return NextResponse.json({ error: 'Session invalide' }, { status: 400 })

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId)
    if (session.metadata?.user_id !== user.id) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    return NextResponse.json({ status: await settleSession(session) })
  } catch (e) {
    console.error('wallet/verify', e)
    return NextResponse.json({ error: 'Vérification impossible' }, { status: 500 })
  }
}
