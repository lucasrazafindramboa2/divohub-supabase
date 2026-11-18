import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Retour de Google : échange le code temporaire contre une session
export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin
  const code = req.nextUrl.searchParams.get('code')
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${base}/`)
  }
  return NextResponse.redirect(`${base}/login?error=oauth`)
}
