'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function Login() {
  const supabase = createClient()
  const router = useRouter()
  const [signup, setSignup] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setInfo('')
    if (signup) {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username } } })
      if (error) return setError(error.message)
      if (!data.session) return setInfo('Compte créé. Confirmez votre email puis connectez-vous.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return setError(error.message)
    }
    router.push('/'); router.refresh()
  }

  return (
    <main className="login">
      <form onSubmit={submit}>
        <h1>{signup ? 'Créer un compte' : 'Se connecter'}</h1>
        {signup && <input placeholder="Nom d'utilisateur" value={username} onChange={e => setUsername(e.target.value)} required />}
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" placeholder="Mot de passe (6 caractères min.)" minLength={6} value={password} onChange={e => setPassword(e.target.value)} required />
        {error && <p className="error">{error}</p>}
        {info && <p className="info">{info}</p>}
        <button type="submit">{signup ? 'Créer mon compte' : 'Se connecter'}</button>
        <button type="button" className="link" onClick={() => setSignup(!signup)}>
          {signup ? 'J’ai déjà un compte' : 'Pas de compte ? Inscrivez-vous'}
        </button>
      </form>
    </main>
  )
}
