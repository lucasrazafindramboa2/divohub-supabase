'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { COUNTRIES } from '@/lib/countries'

// Étape unique pour les comptes sans nationalité (ex. première connexion avec Google)
export default function CompleteProfile({ userId, username }: { userId: string; username: string }) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [name, setName] = useState(username)
  const [nationality, setNationality] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await supabase.from('profiles').update({ username: name.trim(), nationality }).eq('id', userId)
    setBusy(false)
    if (error) return setError(error.message)
    router.refresh()
  }
  async function logout() {
    await supabase.auth.signOut()
    router.push('/login'); router.refresh()
  }

  return (
    <main className="login">
      <form onSubmit={submit}>
        <h1>Compléter votre profil</h1>
        <input placeholder="Nom d'utilisateur" value={name} maxLength={40} onChange={e => setName(e.target.value)} required />
        <select value={nationality} onChange={e => setNationality(e.target.value)} required>
          <option value="">Nationalité</option>
          {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <p className="sub">Votre nationalité s’affiche sous forme de drapeau à côté de votre photo et pourra servir à adapter les publicités.</p>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Continuer'}</button>
        <button type="button" className="link" onClick={logout}>Se déconnecter</button>
      </form>
    </main>
  )
}
