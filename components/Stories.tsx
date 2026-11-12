'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadImage } from '@/lib/upload'
import { ago, type Names, type Story } from '@/lib/types'

const EMOJIS = ['❤️', '😂', '😮', '😢', '🔥']

export default function Stories({ userId, names, stories, follows, onChange }: {
  userId: string; names: Names; stories: Story[]; follows: string[]; onChange: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState<{ uid: string; idx: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const groups = [userId, ...follows]
    .map(uid => ({ uid, list: stories.filter(s => s.user_id === uid) }))
    .filter(g => g.list.length > 0)
  const list = open ? groups.find(g => g.uid === open.uid)?.list ?? [] : []
  const story = open ? list[open.idx] : undefined

  useEffect(() => {
    if (!story || !open) return
    if (story.user_id !== userId && !story.story_views.some(v => v.viewer_id === userId))
      supabase.from('story_views').insert({ story_id: story.id }).then(() => onChange())
    const t = setTimeout(() => setOpen(open.idx + 1 < list.length ? { uid: open.uid, idx: open.idx + 1 } : null), 6000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id])

  async function add(file: File | undefined) {
    if (!file) return
    const caption = prompt('Légende (facultative)') || null
    setBusy(true)
    try {
      const image_url = await uploadImage(file, userId)
      await supabase.from('stories').insert({ image_url, caption })
      onChange()
    } finally { setBusy(false) }
  }
  async function react(emoji: string) {
    if (!story) return
    await supabase.from('story_reactions').upsert({ story_id: story.id, emoji }, { onConflict: 'story_id,user_id' })
    onChange()
  }

  const mine = story?.story_reactions.find(r => r.user_id === userId)?.emoji

  return (
    <>
      <div className="stories">
        <label className="story add">
          <span className="ring">{busy ? '…' : '+'}</span>
          <small>Ma story</small>
          <input type="file" accept="image/*" hidden onChange={e => add(e.target.files?.[0])} />
        </label>
        {groups.map(g => (
          <button key={g.uid} className="story" onClick={() => setOpen({ uid: g.uid, idx: 0 })}>
            <span className="ring on">{(names[g.uid] ?? '?')[0]?.toUpperCase()}</span>
            <small>{g.uid === userId ? 'Vous' : names[g.uid] ?? '…'}</small>
          </button>
        ))}
      </div>

      {story && open && (
        <div className="overlay" onClick={() => setOpen(null)}>
          <div className="story-view" onClick={e => e.stopPropagation()}>
            <div className="story-bars">
              {list.map((s, i) => <i key={s.id} className={i <= open.idx ? 'on' : ''} />)}
            </div>
            <p className="story-head">
              <strong>{story.user_id === userId ? 'Vous' : names[story.user_id]}</strong>
              <span> · {ago(story.created_at)}</span>
            </p>
            <img src={story.image_url} alt="" />
            {story.caption && <p className="story-cap">{story.caption}</p>}
            {story.user_id === userId ? (
              <div className="story-foot">
                <p>{story.story_views.length} vue{story.story_views.length > 1 ? 's' : ''}</p>
                {story.story_reactions.map(r => <p key={r.user_id}>{r.emoji} {names[r.user_id]}</p>)}
              </div>
            ) : (
              <div className="story-foot emojis">
                {EMOJIS.map(e => <button key={e} className={e === mine ? 'on' : ''} onClick={() => react(e)}>{e}</button>)}
              </div>
            )}
            <div className="story-nav">
              <button onClick={() => open.idx > 0 && setOpen({ uid: open.uid, idx: open.idx - 1 })} aria-label="Précédente" />
              <button onClick={() => setOpen(open.idx + 1 < list.length ? { uid: open.uid, idx: open.idx + 1 } : null)} aria-label="Suivante" />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
