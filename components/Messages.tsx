'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Names } from '@/lib/types'

type Conv = { id: string; name: string | null; is_group: boolean; conversation_members: { user_id: string }[] }
type Msg = { id: number; conversation_id: string; user_id: string; content: string; created_at: string }

export default function Messages({ userId, names, onlineIds, active, dmRequest, onUnread }: {
  userId: string; names: Names; onlineIds: string[]; active: boolean
  dmRequest: { id: string; n: number } | null; onUnread: (n: number) => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [convs, setConvs] = useState<Conv[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const currentRef = useRef<string | null>(null)
  const activeRef = useRef(active)
  const [messages, setMessages] = useState<Msg[]>([])
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [text, setText] = useState('')
  const [picking, setPicking] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [groupName, setGroupName] = useState('')
  const [error, setError] = useState('')
  const bottom = useRef<HTMLDivElement>(null)

  const loadConvs = async () => {
    const { data } = await supabase.from('conversations')
      .select('id,name,is_group,conversation_members(user_id)')
      .order('created_at', { ascending: false })
    setConvs((data as Conv[]) ?? [])
  }

  // Nouvelles conversations et nouveaux messages en direct
  useEffect(() => {
    loadConvs()
    const ch = supabase.channel('inbox')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversation_members', filter: `user_id=eq.${userId}` },
        () => loadConvs())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => {
        const m = p.new as Msg
        const isCurrent = m.conversation_id === currentRef.current
        if (isCurrent) setMessages(l => (l.some(x => x.id === m.id) ? l : [...l, m]))
        if (m.user_id !== userId && !(isCurrent && activeRef.current))
          setUnread(u => ({ ...u, [m.conversation_id]: (u[m.conversation_id] ?? 0) + 1 }))
        setConvs(l => {
          const c = l.find(x => x.id === m.conversation_id)
          return c ? [c, ...l.filter(x => x !== c)] : l
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Historique de la conversation ouverte
  useEffect(() => {
    currentRef.current = currentId
    setMessages([])
    if (!currentId) return
    supabase.from('messages').select('*').eq('conversation_id', currentId).order('created_at').limit(200)
      .then(({ data }) => {
        const old = data ?? []
        const ids = new Set(old.map(m => m.id))
        setMessages(prev => [...old, ...prev.filter(m => !ids.has(m.id))])
      })
  }, [supabase, currentId])

  useEffect(() => {
    activeRef.current = active
    if (active && currentId) setUnread(u => ({ ...u, [currentId]: 0 }))
  }, [active, currentId])

  useEffect(() => { onUnread(Object.values(unread).reduce((a, b) => a + b, 0)) }, [unread, onUnread])
  useEffect(() => { if (active) bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, active])
  useEffect(() => { if (dmRequest) start([dmRequest.id]) }, [dmRequest]) // eslint-disable-line react-hooks/exhaustive-deps

  const nameOf = (id: string) => (id === userId ? 'Vous' : names[id] ?? '…')
  const otherId = (c: Conv) => c.conversation_members.find(m => m.user_id !== userId)?.user_id
  const title = (c: Conv) => (c.is_group ? c.name ?? 'Groupe' : nameOf(otherId(c) ?? ''))
  const current = convs.find(c => c.id === currentId)

  async function start(members: string[], name?: string) {
    setError('')
    const { data, error } = await supabase.rpc('create_conversation', { p_members: members, p_name: name ?? null })
    if (error) return setError(error.message)
    await loadConvs()
    setCurrentId(data as string)
    setPicking(false); setSelected([]); setGroupName('')
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const content = text.trim()
    if (!content || !currentId) return
    setText('')
    const { error } = await supabase.from('messages').insert({ conversation_id: currentId, content })
    if (error) setError(error.message)
  }

  const fmt = (d: string) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const people = Object.entries(names).filter(([id]) => id !== userId)

  return (
    <div className="msgs">
      <section className="card msgs-list">
        <div className="side-head">
          <h2>Conversations</h2>
          <button className="go" onClick={() => setPicking(true)}>+ Nouvelle</button>
        </div>
        {convs.length === 0 && <p className="sub">Aucune conversation. Cliquez sur « Nouvelle ».</p>}
        {convs.map(c => {
          const o = otherId(c)
          return (
            <button key={c.id} className={c.id === currentId ? 'conv active' : 'conv'} onClick={() => setCurrentId(c.id)}>
              {!c.is_group && <span className={o && onlineIds.includes(o) ? 'dot' : 'dot off'} />}
              <span className="label">{title(c)}{c.is_group && ` (${c.conversation_members.length})`}</span>
              {!!unread[c.id] && <span className="badge">{unread[c.id]}</span>}
            </button>
          )
        })}
      </section>

      <section className="card msgs-view">
        {current ? (
          <>
            <h2>{title(current)}</h2>
            {current.is_group && <p className="sub">{current.conversation_members.map(m => nameOf(m.user_id)).join(', ')}</p>}
            <div className="messages">
              {messages.length === 0 && <p className="empty">Aucun message. Écrivez le premier.</p>}
              {messages.map(m => (
                <div key={m.id} className={m.user_id === userId ? 'msg mine' : 'msg'}>
                  <div className="meta">{nameOf(m.user_id)} · {fmt(m.created_at)}</div>
                  <div className="bubble">{m.content}</div>
                </div>
              ))}
              <div ref={bottom} />
            </div>
            {error && <p className="error">{error}</p>}
            <form className="row" onSubmit={send}>
              <input value={text} onChange={e => setText(e.target.value)} placeholder="Écrire un message" maxLength={2000} />
              <button className="go">Envoyer</button>
            </form>
          </>
        ) : (
          <p className="empty">Choisissez une conversation ou créez-en une nouvelle.</p>
        )}
      </section>

      {picking && (
        <div className="overlay" onClick={() => setPicking(false)}>
          <div className="picker" onClick={e => e.stopPropagation()}>
            <h2>Nouvelle conversation</h2>
            <p className="sub">Une personne : conversation privée. Plusieurs : groupe.</p>
            <ul>
              {people.length === 0 && <li className="sub">Aucun autre utilisateur pour l’instant.</li>}
              {people.map(([id, name]) => (
                <li key={id}>
                  <label>
                    <input type="checkbox" checked={selected.includes(id)}
                      onChange={() => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]))} />
                    <span className={onlineIds.includes(id) ? 'dot' : 'dot off'} />{name}
                  </label>
                </li>
              ))}
            </ul>
            {selected.length > 1 && (
              <input placeholder="Nom du groupe" value={groupName} onChange={e => setGroupName(e.target.value)} maxLength={40} />
            )}
            {error && <p className="error">{error}</p>}
            <div className="actions">
              <button className="ghost" onClick={() => setPicking(false)}>Annuler</button>
              <button className="go" disabled={selected.length === 0} onClick={() => start(selected, groupName)}>
                {selected.length > 1 ? 'Créer le groupe' : 'Démarrer la conversation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
