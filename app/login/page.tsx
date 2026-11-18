'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { COUNTRIES } from '@/lib/countries'
import { isValidEmailFormat, normalizeEmail, suggestEmail } from '@/lib/email'

type Mode = 'login' | 'signup' | 'verify'

export default function Login() {
  const supabase = createClient()
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [nationality, setNationality] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('error') === 'oauth') setError('La connexion avec Google a échoué. Réessayez.')
  }, [])
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const reset = () => { setError(''); setInfo(''); setSuggestion(null) }
  const goHome = () => { router.push('/'); router.refresh() }

  // Format, faute de frappe courante, puis domaine capable de recevoir des e-mails
  async function checkEmail(value: string) {
    if (!isValidEmailFormat(value)) { setError('Adresse e-mail invalide.'); return false }
    const fix = suggestEmail(value)
    if (fix) { setSuggestion(fix); setError(`Vouliez-vous dire ${fix} ?`); return false }
    try {
      const res = await fetch('/api/auth/check-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: value }),
      })
      const data = await res.json()
      if (!data.valid) { setError(data.error ?? 'Adresse e-mail invalide.'); return false }
    } catch { /* contrôle indisponible : le code de confirmation reste obligatoire */ }
    return true
  }

  async function resend(value = normalizeEmail(email)) {
    const { error } = await supabase.auth.resend({ type: 'signup', email: value })
    if (error) return setError('Impossible d’envoyer le code pour le moment. Réessayez dans un instant.')
    setInfo('Un nouveau code vient d’être envoyé.'); setCooldown(60)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    reset(); setBusy(true)
    try {
      const value = normalizeEmail(email)
      if (mode === 'signup') {
        if (!(await checkEmail(value))) return
        if (!birthDate || birthDate > new Date().toISOString().slice(0, 10) || birthDate < '1900-01-01') return setError('Date de naissance invalide.')
        const { data, error } = await supabase.auth.signUp({
          email: value, password, options: { data: { username: username.trim(), nationality, birth_date: birthDate } },
        })
        if (error) return setError(error.status === 429 ? 'Trop de tentatives. Patientez quelques minutes.' : error.message)
        // Adresse déjà inscrite : Supabase renvoie un utilisateur sans identité, sans erreur
        if (data.user && data.user.identities?.length === 0) return setError('Un compte existe déjà avec cette adresse. Connectez-vous.')
        if (data.session) return goHome() // confirmation désactivée côté Supabase
        setEmail(value); setCode(''); setMode('verify'); setCooldown(60)
        setInfo(`Un code de confirmation a été envoyé à ${value}.`)
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: value, password })
        if (error) {
          if (error.code === 'email_not_confirmed' || /not confirmed/i.test(error.message)) {
            setEmail(value); setMode('verify'); setInfo('Votre adresse n’est pas encore confirmée.'); await resend(value)
            return
          }
          if (error.code === 'user_banned') return setError('Ce compte est suspendu par la modération.')
          return setError('E-mail ou mot de passe incorrect.')
        }
        goHome()
      }
    } finally { setBusy(false) }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    reset(); setBusy(true)
    const { error } = await supabase.auth.verifyOtp({ email: normalizeEmail(email), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) return setError('Code invalide ou expiré.')
    goHome()
  }

  async function google() {
    reset()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setError('Connexion avec Google indisponible.')
  }

  if (mode === 'verify') {
    return (
      <main className="login">
        <form onSubmit={verify}>
          <h1>Confirmez votre e-mail</h1>
          <p className="sub">Saisissez le code reçu à l’adresse {email}. Pensez à vérifier vos courriers indésirables.</p>
          <input className="code-input" inputMode="numeric" autoComplete="one-time-code" placeholder="Code" maxLength={10}
            value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required />
          {error && <p className="error">{error}</p>}
          {info && <p className="info">{info}</p>}
          <button type="submit" disabled={busy || code.length < 6}>{busy ? 'Vérification…' : 'Valider'}</button>
          <button type="button" className="link" disabled={cooldown > 0} onClick={() => resend()}>
            {cooldown > 0 ? `Renvoyer le code (${cooldown} s)` : 'Renvoyer le code'}
          </button>
          <button type="button" className="link" onClick={() => { reset(); setMode('login') }}>Retour</button>
        </form>
      </main>
    )
  }

  const signup = mode === 'signup'
  return (
    <main className="login">
      <form onSubmit={submit}>
        <h1>{signup ? 'Créer un compte' : 'Se connecter'}</h1>

        <button type="button" className="google-btn" onClick={google}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
          Continuer avec Google
        </button>
        <p className="divider">ou avec votre e-mail</p>

        {signup && <input placeholder="Nom d'utilisateur" value={username} maxLength={40} onChange={e => setUsername(e.target.value)} required />}
        {signup && (
          <>
            <select value={nationality} onChange={e => setNationality(e.target.value)} required>
              <option value="">Nationalité</option>
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
            <p className="sub">Votre nationalité s’affiche sous forme de drapeau à côté de votre photo et pourra servir à adapter les publicités. Avec Google, vous la choisirez juste après.</p>
            <label className="field">Date de naissance
              <input type="date" value={birthDate} min="1900-01-01" max={new Date().toISOString().slice(0, 10)} onChange={e => setBirthDate(e.target.value)} required />
            </label>
            <p className="sub">Votre date de naissance reste privée : elle sert à protéger les mineurs. Elle ne pourra pas être modifiée ensuite.</p>
          </>
        )}
        <input type="email" placeholder="E-mail" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" placeholder={signup ? 'Mot de passe (8 caractères min.)' : 'Mot de passe'} minLength={signup ? 8 : undefined}
          autoComplete={signup ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} required />
        {error && <p className="error">{error}</p>}
        {suggestion && <button type="button" className="link" onClick={() => { setEmail(suggestion); reset() }}>Utiliser {suggestion}</button>}
        {info && <p className="info">{info}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Patientez…' : signup ? 'Créer mon compte' : 'Se connecter'}</button>
        <button type="button" className="link" onClick={() => { reset(); setMode(signup ? 'login' : 'signup') }}>
          {signup ? 'J’ai déjà un compte' : 'Pas de compte ? Inscrivez-vous'}
        </button>
      </form>
    </main>
  )
}
