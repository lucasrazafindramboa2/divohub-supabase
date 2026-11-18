'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { COUNTRIES } from '@/lib/countries'

// Étape unique pour les comptes auxquels il manque la nationalité ou la date de naissance
export default function CompleteProfile({ userId, username, needsNationality, needsBirthDate }: {
  userId: string; username: string; needsNationality: boolean; needsBirthDate: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [name, setName] = useState(username)
  const [nationality, setNationality] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const today = new Date().toISOString().slice(0, 10)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (needsBirthDate && (!birthDate || birthDate > today || birthDate < '1900-01-01')) return setError('Date de naissance invalide.')
    setBusy(true)
    const { error: e1 } = await supabase.from('profiles')
      .update({ username: name.trim(), ...(needsNationality ? { nationality } : {}) }).eq('id', userId)
    if (e1) { setBusy(false); return setError(e1.message) }
    if (needsBirthDate) {
      const { error: e2 } = await supabase.from('user_private').insert({ user_id: userId, birth_date: birthDate })
      if (e2) { setBusy(false); return setError(e2.message) }
    }
    setBusy(false)
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
        {needsNationality && (
          <>
            <select value={nationality} onChange={e => setNationality(e.target.value)} required>
              <option value="">Nationalité</option>
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
            <p className="sub">Votre nationalité s’affiche sous forme de drapeau à côté de votre photo et pourra servir à adapter les publicités.</p>
          </>
        )}
        {needsBirthDate && (
          <>
            <label className="field">Date de naissance
              <input type="date" value={birthDate} min="1900-01-01" max={today} onChange={e => setBirthDate(e.target.value)} required />
            </label>
            <p className="sub">Votre date de naissance reste privée : elle sert à protéger les mineurs. Elle ne pourra pas être modifiée ensuite.</p>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Continuer'}</button>
        <button type="button" className="link" onClick={logout}>Se déconnecter</button>
      </form>
    </main>
  )
}
