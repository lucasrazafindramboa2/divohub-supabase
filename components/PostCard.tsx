'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ago, type Names, type Post } from '@/lib/types'

type Comment = { id: string; user_id: string; content: string; created_at: string }
const KIND = { post: '', poll: 'Sondage', vote: 'Vote' }

export default function PostCard({ post, userId, names, follows, onFollow, onChange }: {
  post: Post; userId: string; names: Names; follows: string[]
  onFollow: (id: string) => void; onChange: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [text, setText] = useState('')
  const liked = post.likes.some(l => l.user_id === userId)
  const nComments = post.comments[0]?.count ?? 0
  const myVote = post.poll_votes.find(v => v.user_id === userId)?.option_id
  const total = post.poll_votes.length

  useEffect(() => {
    if (!open) return
    supabase.from('comments').select('*').eq('post_id', post.id).order('created_at')
      .then(({ data }) => setComments((data as Comment[]) ?? []))
  }, [open, nComments, post.id, supabase])

  async function like() {
    if (liked) await supabase.from('likes').delete().match({ post_id: post.id, user_id: userId })
    else await supabase.from('likes').insert({ post_id: post.id })
    onChange()
  }
  async function vote(option_id: string) {
    await supabase.from('poll_votes').insert({ post_id: post.id, option_id })
    onChange()
  }
  async function comment(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    await supabase.from('comments').insert({ post_id: post.id, content: text.trim() })
    setText(''); onChange()
  }
  async function remove() {
    if (!confirm('Supprimer cette publication ?')) return
    await supabase.from('posts').delete().eq('id', post.id)
    onChange()
  }

  return (
    <article className="card">
      <header className="post-head">
        <div>
          <strong>{names[post.user_id] ?? '…'}</strong>
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
        <button className={liked ? 'like on' : 'like'} onClick={like}>{liked ? '♥' : '♡'} {post.likes.length}</button>
        <button className="ghost" onClick={() => setOpen(!open)}>Commentaires ({nComments})</button>
      </footer>

      {open && (
        <div className="comments">
          {comments.map(c => (
            <p key={c.id}><strong>{names[c.user_id] ?? '…'}</strong> {c.content} <span className="sub">{ago(c.created_at)}</span></p>
          ))}
          <form onSubmit={comment} className="row">
            <input value={text} onChange={e => setText(e.target.value)} placeholder="Écrire un commentaire" maxLength={1000} />
            <button className="go">Envoyer</button>
          </form>
        </div>
      )}
    </article>
  )
}
