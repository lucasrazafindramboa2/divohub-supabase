'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Group, Names } from '@/lib/types'
import GroupView from './GroupView'

export default function Groups({ userId, names, follows, onFollow, ver, onPending, openRequest }: {
  userId: string; names: Names; follows: string[]; onFollow: (id: string) => void
  ver: number; onPending: (n: number) => void; openRequest: { id: string; n: number } | null
}) {
  const supabase = useMemo(() => createClient(), [])
  const [groups, setGroups] = useState<Group[]>([])
  const [roles, setRoles] = useState<Record<string, string>>({})
  const [reqs, setReqs] = useState<{ group_id: string; user_id: string }[]>([])
  const [gver, setGver] = useState(0)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [priv, setPriv] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    const [g, m, r] = await Promise.all([
      supabase.from('groups').select('*').order('created_at', { ascending: false }),
      supabase.from('group_members').select('group_id,role').eq('user_id', userId),
      supabase.from('group_requests').select('group_id,user_id'),
    ])
    setGroups((g.data as Group[]) ?? [])
    setRoles(Object.fromEntries((m.data ?? []).map(x => [x.group_id, x.role])))
    setReqs(r.data ?? [])
    setGver(v => v + 1)
  }

  useEffect(() => {
    load()
    const ch = supabase.channel('groups-feed')
    for (const table of ['groups', 'group_members', 'group_requests'])
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, load)
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Demandes en attente dans les groupes que j'administre
  const pendingBy = (gid: string) => (roles[gid] === 'admin' ? reqs.filter(r => r.group_id === gid).length : 0)
  const pending = groups.reduce((n, g) => n + pendingBy(g.id), 0)
  useEffect(() => { onPending(pending) }, [pending, onPending])
  useEffect(() => { if (openRequest) setCurrentId(openRequest.id) }, [openRequest])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const { data, error } = await supabase.from('groups')
      .insert({ name: name.trim(), description: desc.trim() || null, is_private: priv, created_by: userId })
      .select().single()
    if (error) return setError(error.message)
    setName(''); setDesc(''); setPriv(false); setCreating(false)
    await load(); setCurrentId(data.id)
  }

  const mine = groups.filter(g => roles[g.id])
  const others = groups.filter(g => !roles[g.id])
  const current = groups.find(g => g.id === currentId)
  const row = (g: Group) => (
    <button key={g.id} className={g.id === currentId ? 'conv active' : 'conv'} onClick={() => setCurrentId(g.id)}>
      <span className="label">{g.name}</span>
      {g.is_private && <span className="tag">Privé</span>}
      {pendingBy(g.id) > 0 && <span className="badge">{pendingBy(g.id)}</span>}
    </button>
  )

  return (
    <div className="msgs">
      <section className="card msgs-list">
        <div className="side-head">
          <h2>Mes groupes</h2>
          <button className="go" onClick={() => setCreating(true)}>+ Créer</button>
        </div>
        {mine.length === 0 && <p className="sub">Vous n’êtes dans aucun groupe.</p>}
        {mine.map(row)}
        <h2 className="side-sub">Découvrir</h2>
        {others.length === 0 && <p className="sub">Aucun autre groupe.</p>}
        {others.map(row)}
      </section>

      {current ? (
        <GroupView key={current.id} group={current} role={roles[current.id] ?? null}
          requested={reqs.some(r => r.group_id === current.id && r.user_id === userId)}
          userId={userId} names={names} follows={follows} onFollow={onFollow}
          ver={ver + gver} onChanged={load} onClose={() => setCurrentId(null)} />
      ) : (
        <section className="card"><p className="empty">Choisissez un groupe ou créez-en un.</p></section>
      )}

      {creating && (
        <div className="overlay" onClick={() => setCreating(false)}>
          <form className="picker" onClick={e => e.stopPropagation()} onSubmit={create}>
            <h2>Nouveau groupe</h2>
            <input placeholder="Nom du groupe" value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={60} required />
            <textarea placeholder="Description (facultative)" value={desc} onChange={e => setDesc(e.target.value)} maxLength={300} rows={3} />
            <label className="choice-row"><input type="radio" checked={!priv} onChange={() => setPriv(false)} />
              <span><strong>Public</strong><br /><span className="sub">Tout le monde voit les publications et peut rejoindre.</span></span></label>
            <label className="choice-row"><input type="radio" checked={priv} onChange={() => setPriv(true)} />
              <span><strong>Privé</strong><br /><span className="sub">Seuls les membres voient le contenu. Adhésion sur demande.</span></span></label>
            {error && <p className="error">{error}</p>}
            <div className="actions">
              <button type="button" className="ghost" onClick={() => setCreating(false)}>Annuler</button>
              <button className="go">Créer le groupe</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
