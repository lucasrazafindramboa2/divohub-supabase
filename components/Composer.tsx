'use client'
import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadImage } from '@/lib/upload'

type Kind = 'post' | 'poll' | 'vote'
const LABELS: Record<Kind, string> = { post: 'Publication', poll: 'Sondage oui / non', vote: 'Vote personnalisé' }

export default function Composer({ userId, onDone }: { userId: string; onDone: () => void }) {
  const supabase = useMemo(() => createClient(), [])
  const [kind, setKind] = useState<Kind>('post')
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileKey, setFileKey] = useState(0)
  const [opts, setOpts] = useState(['', ''])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    const labels = kind === 'poll' ? ['Oui', 'Non'] : kind === 'vote' ? opts.map(o => o.trim()).filter(Boolean) : []
    if (kind === 'vote' && labels.length < 2) return setError('Ajoutez au moins 2 choix.')
    setBusy(true); setError('')
    try {
      const image_url = file ? await uploadImage(file, userId) : null
      const { data, error } = await supabase.from('posts')
        .insert({ kind, content: content.trim(), image_url }).select('id').single()
      if (error) throw error
      if (labels.length) {
        const r = await supabase.from('poll_options').insert(labels.map((label, position) => ({ post_id: data.id, label, position })))
        if (r.error) throw r.error
      }
      setContent(''); setFile(null); setFileKey(k => k + 1); setOpts(['', '']); onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <form className="card composer" onSubmit={submit}>
      <div className="kinds">
        {(Object.keys(LABELS) as Kind[]).map(k => (
          <button type="button" key={k} className={k === kind ? 'on' : ''} onClick={() => setKind(k)}>{LABELS[k]}</button>
        ))}
      </div>
      <textarea value={content} onChange={e => setContent(e.target.value)} maxLength={2000} rows={3}
        placeholder={kind === 'post' ? 'Quoi de neuf ?' : 'Posez votre question'} />
      {kind === 'vote' && (
        <div className="opts">
          {opts.map((o, i) => (
            <input key={i} value={o} placeholder={`Choix ${i + 1}`} maxLength={80}
              onChange={e => setOpts(list => list.map((x, j) => (j === i ? e.target.value : x)))} />
          ))}
          {opts.length < 6 && <button type="button" className="ghost" onClick={() => setOpts(o => [...o, ''])}>+ Ajouter un choix</button>}
        </div>
      )}
      <div className="row">
        <input key={fileKey} type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        <button className="go" disabled={busy || !content.trim()}>{busy ? 'Envoi…' : 'Publier'}</button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  )
}
