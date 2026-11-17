'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadImage } from '@/lib/upload'
import { COUNTRIES, countryName, flagUrl } from '@/lib/countries'
import Avatar from './Avatar'

type Basic = { id: string; username: string; avatar_url: string | null; is_private: boolean }
type Details = { first_name: string | null; last_name: string | null; gender: string | null; nationality: string | null; cover_url: string | null }
type Photo = { id: string; kind: 'avatar' | 'cover'; url: string; created_at: string }
const GENDERS: Record<string, string> = { homme: 'Homme', femme: 'Femme', autre: 'Autre', non_precise: 'Non précisé' }

export default function Profile({ profileId, userId, onChanged }: { profileId: string; userId: string; onChanged: () => void }) {
  const supabase = useMemo(() => createClient(), [])
  const own = profileId === userId
  const [basic, setBasic] = useState<Basic | null>(null)
  const [d, setD] = useState<Details | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ first_name: '', last_name: '', gender: 'non_precise', nationality: '', is_private: false })
  const [filter, setFilter] = useState<'all' | 'avatar' | 'cover'>('all')
  const [view, setView] = useState<Photo | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [b, det, ph] = await Promise.all([
      supabase.from('profiles').select('id,username,avatar_url,is_private').eq('id', profileId).single(),
      supabase.from('profile_details').select('*').eq('user_id', profileId).maybeSingle(),
      supabase.from('profile_photos').select('id,kind,url,created_at').eq('user_id', profileId).order('created_at', { ascending: false }),
    ])
    setBasic(b.data as Basic | null); setD(det.data as Details | null); setPhotos((ph.data as Photo[]) ?? [])
  }, [profileId, supabase])
  useEffect(() => { setBasic(null); setEditing(false); setView(null); setError(''); load() }, [load])

  function startEdit() {
    setForm({
      first_name: d?.first_name ?? '', last_name: d?.last_name ?? '', gender: d?.gender ?? 'non_precise',
      nationality: d?.nationality ?? '', is_private: basic?.is_private ?? false,
    })
    setEditing(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const a = await supabase.from('profile_details').upsert({
      user_id: userId, first_name: form.first_name.trim() || null, last_name: form.last_name.trim() || null,
      gender: form.gender, nationality: form.nationality || null, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    const b = await supabase.from('profiles').update({ is_private: form.is_private }).eq('id', userId)
    setBusy(false)
    if (a.error || b.error) return setError((a.error ?? b.error)!.message)
    setEditing(false); await load(); onChanged()
  }

  // Définit la photo de profil ou de couverture actuelle (null = retirer)
  async function use(kind: 'avatar' | 'cover', url: string | null) {
    const r = kind === 'avatar'
      ? await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId)
      : await supabase.from('profile_details').upsert({ user_id: userId, cover_url: url }, { onConflict: 'user_id' })
    if (r.error) throw r.error
    await load(); onChanged()
  }

  async function addPhoto(kind: 'avatar' | 'cover', file: File | undefined) {
    if (!file) return
    setBusy(true); setError('')
    try {
      const url = await uploadImage(file, userId)
      const r = await supabase.from('profile_photos').insert({ kind, url })
      if (r.error) throw r.error
      await use(kind, url)
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  async function removePhoto(p: Photo) {
    if (!confirm('Supprimer cette photo ?')) return
    setError('')
    try {
      const wasCurrent = p.url === (p.kind === 'avatar' ? basic?.avatar_url : d?.cover_url)
      const r = await supabase.from('profile_photos').delete().eq('id', p.id)
      if (r.error) throw r.error
      const path = p.url.split('/media/')[1]
      if (path) await supabase.storage.from('media').remove([path])
      if (wasCurrent) await use(p.kind, null); else await load()
      setView(null)
    } catch (err) { setError((err as Error).message) }
  }

  if (!basic) return <p className="empty">Chargement…</p>
  const locked = !own && basic.is_private
  const fullName = [d?.first_name, d?.last_name].filter(Boolean).join(' ')
  const shown = photos.filter(p => filter === 'all' || p.kind === filter)
  const isCurrent = (p: Photo) => p.url === (p.kind === 'avatar' ? basic.avatar_url : d?.cover_url)
  const fileInput = (kind: 'avatar' | 'cover') => (
    <input type="file" accept="image/*" hidden onChange={e => { addPhoto(kind, e.target.files?.[0]); e.target.value = '' }} />
  )

  return (
    <div className="profile">
      <section className="card pcard">
        <div className="cover" style={d?.cover_url ? { backgroundImage: `url(${d.cover_url})` } : undefined}>
          {own && <label className="cover-btn">{busy ? 'Envoi…' : 'Modifier la couverture'}{fileInput('cover')}</label>}
        </div>
        <div className="pbody">
          <div className="pavatar">
            <Avatar url={basic.avatar_url} name={basic.username} size={96} />
            {own && <label className="avatar-btn" title="Changer la photo de profil">✎{fileInput('avatar')}</label>}
          </div>
          <div className="pinfo">
            <h2>{fullName || basic.username}</h2>
            <p className="sub">@{basic.username} · <span className="tag">{basic.is_private ? 'Profil privé' : 'Profil public'}</span></p>
            {d?.gender && d.gender !== 'non_precise' && <p className="sub">{GENDERS[d.gender]}</p>}
            {d?.nationality && (
              <p className="nat">
                <img className="flag" src={flagUrl(d.nationality)} srcSet={`${flagUrl(d.nationality, 80)} 2x`} alt="" width={24} height={18} />
                {countryName(d.nationality)}
              </p>
            )}
          </div>
          {own && !editing && <button className="go" onClick={startEdit}>Modifier le profil</button>}
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {locked && <p className="empty">Ce profil est privé. Seuls le nom et la photo de profil sont visibles.</p>}

      {own && editing && (
        <form className="card pform" onSubmit={save}>
          <h2>Modifier mes informations</h2>
          <div className="grid2">
            <label>Prénom<input value={form.first_name} maxLength={60} onChange={e => setForm({ ...form, first_name: e.target.value })} /></label>
            <label>Nom<input value={form.last_name} maxLength={60} onChange={e => setForm({ ...form, last_name: e.target.value })} /></label>
            <label>Genre
              <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
                {Object.entries(GENDERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>Nationalité
              <select value={form.nationality} onChange={e => setForm({ ...form, nationality: e.target.value })}>
                <option value="">Non renseignée</option>
                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </label>
          </div>
          <label className="choice-row"><input type="radio" checked={!form.is_private} onChange={() => setForm({ ...form, is_private: false })} />
            <span><strong>Profil public</strong><br /><span className="sub">Tout le monde voit vos informations et votre galerie.</span></span></label>
          <label className="choice-row"><input type="radio" checked={form.is_private} onChange={() => setForm({ ...form, is_private: true })} />
            <span><strong>Profil privé</strong><br /><span className="sub">Seuls votre nom et votre photo de profil restent visibles.</span></span></label>
          <div className="actions">
            <button type="button" className="ghost" onClick={() => setEditing(false)}>Annuler</button>
            <button className="go" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </form>
      )}

      {!locked && (
        <section className="card">
          <header className="post-head">
            <h2>Galerie ({photos.length})</h2>
            {own && (
              <div className="btns">
                <label className="go">+ Photo de profil{fileInput('avatar')}</label>
                <label className="go">+ Couverture{fileInput('cover')}</label>
              </div>
            )}
          </header>
          <div className="kinds">
            {(['all', 'avatar', 'cover'] as const).map(k => (
              <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
                {k === 'all' ? 'Toutes' : k === 'avatar' ? 'Profil' : 'Couverture'}
              </button>
            ))}
          </div>
          {shown.length === 0 && <p className="empty">Aucune photo.</p>}
          <div className="gallery">
            {shown.map(p => (
              <button key={p.id} className="thumb" onClick={() => setView(p)}>
                <img src={p.url} alt="" loading="lazy" />
                <span className="tag">{isCurrent(p) ? 'Actuelle' : p.kind === 'avatar' ? 'Profil' : 'Couverture'}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {view && (
        <div className="overlay" onClick={() => setView(null)}>
          <div className="lightbox" onClick={e => e.stopPropagation()}>
            <img src={view.url} alt="" />
            <p className="sub">{view.kind === 'avatar' ? 'Photo de profil' : 'Photo de couverture'} · {new Date(view.created_at).toLocaleDateString('fr-FR')}</p>
            <div className="actions">
              {own && !isCurrent(view) && (
                <button className="go" onClick={async () => { try { await use(view.kind, view.url); setView(null) } catch (e) { setError((e as Error).message) } }}>
                  Utiliser comme {view.kind === 'avatar' ? 'photo de profil' : 'couverture'}
                </button>
              )}
              {own && <button className="ghost" onClick={() => removePhoto(view)}>Supprimer</button>}
              <button className="ghost" onClick={() => setView(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
