'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ago, type Names } from '@/lib/types'
import { reasonLabel } from '@/lib/reports'

type Report = {
  id: string; reporter_id: string; target_type: 'user' | 'post'; reported_user_id: string; post_id: string | null
  post_snapshot: string | null; post_image: string | null; reason: string; details: string | null
  status: 'pending' | 'in_review' | 'resolved' | 'dismissed'; resolution: string | null; admin_note: string | null
  handled_by: string | null; handled_at: string | null; created_at: string
}
type Act = { id: string; admin_id: string | null; action: string; target_user_id: string; note: string | null; until: string | null; created_at: string }

const STATUS = { pending: 'En attente', in_review: 'En cours', resolved: 'Traité', dismissed: 'Rejeté' }
const STATUS_TAG = { pending: 'tag warn', in_review: 'tag', resolved: 'tag ok', dismissed: 'tag' }
const ACTION: Record<string, string> = {
  review: 'Prise en charge', dismiss: 'Rejet', warn: 'Avertissement', remove_post: 'Publication supprimée',
  suspend: 'Suspension', ban: 'Bannissement', unban: 'Sanction levée',
}
const CONFIRM: Record<string, string> = {
  dismiss: 'Rejeter ce signalement ?', warn: 'Envoyer un avertissement à l’utilisateur ?',
  remove_post: 'Supprimer définitivement cette publication ?', suspend: 'Suspendre ce compte pendant 7 jours ?',
  ban: 'Bannir définitivement ce compte ?', unban: 'Lever la sanction de ce compte ?',
}
const FILTERS = [['open', 'À traiter'], ['resolved', 'Traités'], ['dismissed', 'Rejetés'], ['all', 'Tous']] as const
const fmt = (d: string) => new Date(d).toLocaleDateString('fr-FR', { dateStyle: 'medium' })

// Espace de modération : réservé aux administrateurs (contrôlé aussi côté base de données)
export default function Admin({ names, onPending, onProfile }: {
  names: Names; onPending: (n: number) => void; onProfile: (id: string) => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [reports, setReports] = useState<Report[]>([])
  const [acts, setActs] = useState<Act[]>([])
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('open')
  const [openId, setOpenId] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [r, a] = await Promise.all([
      supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('moderation_actions').select('*').order('created_at', { ascending: false }).limit(300),
    ])
    setReports((r.data as Report[]) ?? [])
    setActs((a.data as Act[]) ?? [])
  }, [supabase])

  useEffect(() => {
    load()
    const ch = supabase.channel('reports')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pending = reports.filter(r => r.status === 'pending').length
  useEffect(() => { onPending(pending) }, [pending, onPending])

  const isOpen = (r: Report) => r.status === 'pending' || r.status === 'in_review'
  const shown = reports.filter(r => filter === 'all' || (filter === 'open' ? isOpen(r) : r.status === filter))
  const count = (f: (typeof FILTERS)[number][0]) => reports.filter(r => f === 'all' || (f === 'open' ? isOpen(r) : r.status === f)).length
  const others = (r: Report) => reports.filter(x => x.id !== r.id && x.target_type === r.target_type &&
    (r.target_type === 'post' ? x.post_id === r.post_id : x.reported_user_id === r.reported_user_id)).length

  // Sanction en cours sur un compte, d'après l'historique
  const sanction = (uid: string) => {
    const last = acts.find(a => a.target_user_id === uid && ['suspend', 'ban', 'unban'].includes(a.action))
    if (!last || last.action === 'unban') return null
    if (last.action === 'suspend' && last.until && new Date(last.until) <= new Date()) return null
    return last
  }

  async function act(r: Report, action: string) {
    const note = notes[r.id]?.trim() || null
    if ((action === 'suspend' || action === 'ban') && !note) return setError('Ajoutez une note interne pour justifier la sanction.')
    if (CONFIRM[action] && !confirm(CONFIRM[action])) return
    setBusy(true); setError('')
    const { error } = await supabase.rpc('admin_handle_report', { p_report: r.id, p_action: action, p_note: note, p_days: 7 })
    setBusy(false)
    if (error) return setError(error.message)
    await load()
  }

  return (
    <div className="admin">
      <section className="card">
        <h2>Signalements</h2>
        <div className="kinds">
          {FILTERS.map(([k, label]) => (
            <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{label} ({count(k)})</button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {shown.length === 0 && <p className="empty">Aucun signalement dans cette catégorie.</p>}
      {shown.map(r => {
        const open = openId === r.id
        const s = sanction(r.reported_user_id)
        const n = others(r)
        const history = acts.filter(a => a.target_user_id === r.reported_user_id).slice(0, 5)
        return (
          <article key={r.id} className="card rcard">
            <button className="rhead" onClick={() => setOpenId(open ? null : r.id)}>
              <span>
                <strong>{reasonLabel(r.reason)}</strong>{' '}
                <span className="tag">{r.target_type === 'post' ? 'Publication' : 'Utilisateur'}</span>
                {n > 0 && <> <span className="tag warn">+{n} autre{n > 1 ? 's' : ''}</span></>}
              </span>
              <span className="sub">{names[r.reported_user_id] ?? '…'} · {ago(r.created_at)}</span>
              <span className={STATUS_TAG[r.status]}>{STATUS[r.status]}</span>
            </button>

            {open && (
              <div className="rbody">
                <p className="sub">Signalé par <button className="plain" onClick={() => onProfile(r.reporter_id)}>{names[r.reporter_id] ?? '…'}</button> le {fmt(r.created_at)}</p>
                {r.details && <p className="quote">{r.details}</p>}
                {r.target_type === 'post' && (
                  r.post_snapshot || r.post_image ? (
                    <div className="quote">
                      <p className="sub">Contenu signalé{r.post_id ? '' : ' (publication supprimée depuis)'} :</p>
                      {r.post_snapshot && <p>{r.post_snapshot}</p>}
                      {r.post_image && <img className="photo" src={r.post_image} alt="" />}
                    </div>
                  ) : <p className="sub">Contenu indisponible.</p>
                )}
                {s && <p className="notice error">Compte {s.action === 'ban' ? 'banni' : `suspendu jusqu’au ${fmt(s.until!)}`}.</p>}
                {history.length > 0 && (
                  <div>
                    <p className="sub">Historique de ce compte :</p>
                    <ul className="plain-list">
                      {history.map(a => <li key={a.id} className="sub">{fmt(a.created_at)} · {ACTION[a.action] ?? a.action}{a.note ? ` — ${a.note}` : ''}</li>)}
                    </ul>
                  </div>
                )}
                {!isOpen(r) && (
                  <p className="sub">
                    {r.status === 'dismissed' ? 'Rejeté' : `Traité (${ACTION[r.resolution ?? ''] ?? r.resolution})`}
                    {r.handled_by && ` par ${names[r.handled_by] ?? '…'}`}{r.handled_at && ` le ${fmt(r.handled_at)}`}
                    {r.admin_note && ` — ${r.admin_note}`}
                  </p>
                )}

                {isOpen(r) && (
                  <textarea rows={2} maxLength={500} value={notes[r.id] ?? ''} onChange={e => setNotes({ ...notes, [r.id]: e.target.value })}
                    placeholder="Note interne (obligatoire pour une suspension ou un bannissement)" />
                )}
                <div className="btns wrap">
                  {r.status === 'pending' && <button className="ghost" disabled={busy} onClick={() => act(r, 'review')}>Prendre en charge</button>}
                  {isOpen(r) && (
                    <>
                      <button className="ghost" disabled={busy} onClick={() => act(r, 'dismiss')}>Rejeter</button>
                      <button className="ghost" disabled={busy} onClick={() => act(r, 'warn')}>Avertir</button>
                      {r.target_type === 'post' && r.post_id && <button className="ghost danger" disabled={busy} onClick={() => act(r, 'remove_post')}>Supprimer la publication</button>}
                      <button className="ghost danger" disabled={busy} onClick={() => act(r, 'suspend')}>Suspendre 7 jours</button>
                      <button className="ghost danger" disabled={busy} onClick={() => act(r, 'ban')}>Bannir</button>
                    </>
                  )}
                  {s && <button className="go" disabled={busy} onClick={() => act(r, 'unban')}>Lever la sanction</button>}
                  <button className="ghost" onClick={() => onProfile(r.reported_user_id)}>Voir le profil</button>
                </div>
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}
