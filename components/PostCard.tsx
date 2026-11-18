'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ago, type Names, type Post, type Reaction } from '@/lib/types'
import Reactions from './Reactions'
import Avatar from './Avatar'

type Comment = { id: string; user_id: string; parent_id: string | null; content: string; created_at: string; comment_reactions: Reaction[] }
const KIND = { post: '', poll: 'Sondage', vote: 'Vote' }

export default function PostCard({ post, userId, names, follows, onFollow, onChange, tick, avatars, onProfile }: {
  post: Post; userId: string; names: Names; follows: string[]
  onFollow: (id: string) => void; onChange: () => void; tick: number
  avatars?: Record<string, string | null>; onProfile?: (id: string) => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [text, setText] = useState('')
  const nComments = post.comments[0]?.count ?? 0
  const myVote = post.poll_votes.find(v => v.user_id === userId)?.option_id
  const total = post.poll_votes.length

  useEffect(() => {
    if (!open) return
    supabase.from('comments').select('*, comment_reactions(user_id,emoji)').eq('post_id', post.id).order('created_at')
      .then(({ data }) => setComments((data as Comment[]) ?? []))
  }, [open, nComments, tick, post.id, supabase])

  async function reactPost(emoji: string | null) {
    if (emoji === null) await supabase.from('post_reactions').delete().match({ post_id: post.id, user_id: userId })
    else await supabase.from('post_reactions').upsert({ post_id: post.id, emoji }, { onConflict: 'post_id,user_id' })
    onChange()
  }
  async function reactComment(id: string, emoji: string | null) {
    if (emoji === null) await supabase.from('comment_reactions').delete().match({ comment_id: id, user_id: userId })
    else await supabase.from('comment_reactions').upsert({ comment_id: id, emoji }, { onConflict: 'comment_id,user_id' })
    onChange()
  }
  async function vote(option_id: string) {
    await supabase.from('poll_votes').insert({ post_id: post.id, option_id })
    onChange()
  }
  async function comment(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    await supabase.from('comments').insert({ post_id: post.id, content: text.trim(), parent_id: replyTo?.id ?? null })
    setText(''); setReplyTo(null); onChange()
  }
  async function remove() {
    if (!confirm('Supprimer cette publication ?')) return
    await supabase.from('posts').delete().eq('id', post.id)
    onChange()
  }

  const item = (c: Comment, reply = false) => (
    <div key={c.id} className={reply ? 'comment reply' : 'comment'}>
      <p><strong>{names[c.user_id] ?? '…'}</strong> {c.content} <span className="sub">{ago(c.created_at)}</span></p>
      <div className="comment-actions">
        <Reactions reactions={c.comment_reactions} userId={userId} names={names} onReact={e => reactComment(c.id, e)} />
        {!reply && <button className="ghost" onClick={() => setReplyTo(c)}>Répondre</button>}
      </div>
    </div>
  )

  return (
    <article className="card">
      <header className="post-head">
        <div className="author">
          <Avatar url={avatars?.[post.user_id]} name={names[post.user_id] ?? '?'} size={34} uid={post.user_id} />
          {onProfile
            ? <button className="plain" onClick={() => onProfile(post.user_id)}>{names[post.user_id] ?? '…'}</button>
            : <strong>{names[post.user_id] ?? '…'}</strong>}
          <span className="sub"> · {ago(post.created_at)}{KIND[post.kind] && ` · ${KIND[post.kind]}`}</span>
        </div>
        {post.user_id === userId
          ? <button className="ghost" onClick={remove}>Supprimer</button>
          : <button className={follows.includes(post.user_id) ? 'ghost' : 'go'} onClick={() => onFollow(post.user_id)}>
              {follows.includes(post.user_id) ? 'Abonné' : 'Suivre'}
            </button>}
      </header>
      <p className="content">{post.content}</p>
      {post.image_url && <img className="photo" src={post.image_url} alt="" />}

      {post.poll_options.length > 0 && (
        <div className="poll">
          {[...post.poll_options].sort((a, b) => a.position - b.position).map(o => {
            const n = post.poll_votes.filter(v => v.option_id === o.id).length
            const pct = total ? Math.round((n * 100) / total) : 0
            return myVote ? (
              <div key={o.id} className={myVote === o.id ? 'result mine' : 'result'} style={{ '--p': `${pct}%` } as React.CSSProperties}>
                <span>{o.label}</span><b>{pct}%</b>
              </div>
            ) : (
              <button key={o.id} className="choice" onClick={() => vote(o.id)}>{o.label}</button>
            )
          })}
          <p className="sub">{total} vote{total > 1 ? 's' : ''}</p>
        </div>
      )}

      <footer className="actions">
        <Reactions reactions={post.post_reactions} userId={userId} names={names} onReact={reactPost} />
        <button className="ghost" onClick={() => setOpen(!open)}>Commentaires ({nComments})</button>
      </footer>

      {open && (
        <div className="comments">
          {comments.filter(c => !c.parent_id).map(c => (
            <div key={c.id}>
              {item(c)}
              {comments.filter(r => r.parent_id === c.id).map(r => item(r, true))}
            </div>
          ))}
          <form onSubmit={comment} className="row">
            <input value={text} onChange={e => setText(e.target.value)} maxLength={1000}
              placeholder={replyTo ? `Répondre à ${names[replyTo.user_id] ?? '…'}` : 'Écrire un commentaire'} />
            {replyTo && <button type="button" className="ghost" onClick={() => setReplyTo(null)}>Annuler</button>}
            <button className="go">Envoyer</button>
          </form>
        </div>
      )}
    </article>
  )
}
