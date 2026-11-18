'use client'
import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { REPORT_REASONS } from '@/lib/reports'

// Fenêtre de signalement d'un compte ou d'une publication
export default function ReportDialog({ type, targetId, label, onClose }: {
  type: 'user' | 'post'; targetId: string; label: string; onClose: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!reason) return setError('Choisissez un motif.')
    setBusy(true); setError('')
    const { error } = await supabase.rpc('report_submit', {
      p_type: type, p_target: targetId, p_reason: reason, p_details: details.trim() || null,
    })
    setBusy(false)
    if (error) return setError(error.message)
    setDone(true)
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="picker" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h2>Signaler {label}</h2>
        {done ? (
          <>
            <p className="notice ok">Merci. Votre signalement a été transmis à la modération. La personne signalée n’en sera pas informée.</p>
            <div className="actions"><button type="button" className="go" onClick={onClose}>Fermer</button></div>
          </>
        ) : (
          <>
            <div className="reasons">
              {REPORT_REASONS.map(([key, text]) => (
                <label key={key} className="reason-row">
                  <input type="radio" name="reason" checked={reason === key} onChange={() => setReason(key)} />{text}
                </label>
              ))}
            </div>
            <textarea rows={3} maxLength={1000} value={details} onChange={e => setDetails(e.target.value)}
              placeholder={reason === 'other' ? 'Expliquez votre signalement (obligatoire)' : 'Précisions (facultatif)'} />
            {error && <p className="error">{error}</p>}
            <div className="actions">
              <button type="button" className="ghost" onClick={onClose}>Annuler</button>
              <button className="go" disabled={busy || !reason}>{busy ? 'Envoi…' : 'Envoyer le signalement'}</button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
