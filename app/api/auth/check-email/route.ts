import { NextRequest, NextResponse } from 'next/server'
import { promises as dns } from 'dns'
import { isValidEmailFormat, normalizeEmail } from '@/lib/email'

export const runtime = 'nodejs'

const missing = (e: unknown) => ['ENODATA', 'ENOTFOUND'].includes((e as NodeJS.ErrnoException).code ?? '')

// Le domaine peut-il recevoir du courrier ? (enregistrement MX, ou à défaut une adresse IP)
async function domainCanReceiveMail(domain: string) {
  try { if ((await dns.resolveMx(domain)).length > 0) return true } catch (e) { if (!missing(e)) return true }
  try { return (await dns.resolve4(domain)).length > 0 } catch (e) { return !missing(e) }
  // Un DNS momentanément injoignable ne bloque personne : la confirmation par code reste obligatoire.
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const email = normalizeEmail(body?.email)
  if (!isValidEmailFormat(email)) return NextResponse.json({ valid: false, error: 'Adresse e-mail invalide.' })
  const domain = email.split('@')[1]
  if (!(await domainCanReceiveMail(domain)))
    return NextResponse.json({ valid: false, error: `Le domaine « ${domain} » ne peut pas recevoir d’e-mails.` })
  return NextResponse.json({ valid: true })
}
