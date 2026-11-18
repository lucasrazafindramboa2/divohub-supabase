'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Avatar from './Avatar'

type Suggestion = { user_id: string; username: string; avatar_url: string | null; nationality: string | null; mutual_count: number; from_search: boolean }
type Found = Omit<Suggestion, 'from_search'> & { relation: 'none' | 'sent' | 'received' | 'friend' }

const mutualText = (n: number) => `${n} ami${n > 1 ? 's' : ''} en commun`

// Suggestions d'amis intégrées au fil d'actualité + recherche de personnes
export default function Suggestions({ userId, onProfile, refreshKey }: {
  userId: string; onProfile: (id: string) => void; refreshKey: number
}) {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<Suggestion[]>([])
  const [sent, setSent] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Found[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('friend_suggestions', { p_limit: 10 })
    setItems((data as Suggestion[]) ?? [])
  }, [supabase])

  // Actualisation : à l'ouverture, après chaque interaction (refreshKey), toutes les 5 minutes et au retour sur l'onglet
  useEffect(() => { load() }, [load, refreshKey])
  useEffect(() => {
    const timer = setInterval(load, 5 * 60 * 1000)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [load])

  // Envoie la demande directement ; la carte disparaît à l'actualisation suivante
  async function add(id: string, fromSearch = false) {
    setError('')
    const { data, error } = await supabase.rpc('friend_request_send', { p_to: id })
    if (error) return setError(error.message)
    if (fromSearch) setResults(list => list?.map(r => (r.user_id === id ? { ...r, relation: data === 'friends' ? 'friend' : 'sent' } : r)) ?? null)
    else setSent(s => [...s, id])
    setTimeout(load, 1500)
  }

  async function dismiss(id: string) {
    setItems(list => list.filter(s => s.user_id !== id))
    await supabase.from('suggestion_dismissals').insert({ dismissed_id: id })
  }

  async function search(e: React.FormEvent) {
    e.preventDefault()
    const term = q.trim()
    if (term.length < 2) return setError('Saisissez au moins 2 caractères.')
    setBusy(true); setError('')
    const { data, error } = await supabase.rpc('people_search', { p_query: term })
    setBusy(false)
    if (error) return setError(error.message)
    setResults((data as Found[]) ?? [])
    load() // la recherche enrichit les suggestions
  }

  async function clearHistory() {
    if (!confirm('Effacer votre historique de recherche ?')) return
    await supabase.from('user_searches').delete().eq('user_id', userId)
    load()
  }

  return (
    <section className="card sugg">
      <h2>Personnes que vous pourriez connaître</h2>
      <form className="row" onSubmit={search}>
        <input type="search" placeholder="Rechercher une personne par nom" value={q} maxLength={40}
          onChange={e => { setQ(e.target.value); if (!e.target.value) setResults(null) }} />
        <button className="go" disabled={busy}>{busy ? '…' : 'Rechercher'}</button>
      </form>
      {error && <p className="error">{error}</p>}

      {results && (
        <ul className="people">
          {results.length === 0 && <li className="sub">Aucune personne trouvée.</li>}
          {results.map(r => (
            <li key={r.user_id}>
              <span className="who">
                <Avatar url={r.avatar_url} name={r.username} size={34} uid={r.user_id} />
                <span>
                  <button className="plain" onClick={() => onProfile(r.user_id)}>{r.username}</button>
                  {r.mutual_count > 0 && <><br /><span className="sub">{mutualText(r.mutual_count)}</span></>}
                </span>
              </span>
              {r.relation === 'none' && <button className="go" onClick={() => add(r.user_id, true)}>Ajouter</button>}
              {r.relation === 'sent' && <span className="tag">Demande envoyée</span>}
              {r.relation === 'friend' && <span className="tag ok">Ami</span>}
              {r.relation === 'received' && <button className="ghost" onClick={() => onProfile(r.user_id)}>Voir la demande</button>}
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 ? (
        <p className="sub">Aucune suggestion pour le moment. Elles s’adaptent à vos amis, vos recherches et vos interactions.</p>
      ) : (
        <div className="sugg-row">
          {items.map(s => {
            const done = sent.includes(s.user_id)
            return (
              <div key={s.user_id} className="sugg-card">
                <button className="x" onClick={() => dismiss(s.user_id)} title="Ignorer cette suggestion" aria-label="Ignorer cette suggestion">×</button>
                <Avatar url={s.avatar_url} name={s.username} size={56} uid={s.user_id} />
                <button className="plain" onClick={() => onProfile(s.user_id)}>{s.username}</button>
                <span className="sub">
                  {s.mutual_count > 0 ? mutualText(s.mutual_count) : s.from_search ? 'Correspond à votre recherche' : 'Suggestion pour vous'}
                </span>
                <button className={done ? 'ghost' : 'go'} disabled={done} onClick={() => add(s.user_id)}>
                  {done ? 'Demande envoyée' : 'Ajouter'}
                </button>
              </div>
            )
          })}
        </div>
      )}
      <button className="link small" onClick={clearHistory}>Effacer mon historique de recherche</button>
    </section>
  )
}
