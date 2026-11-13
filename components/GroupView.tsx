'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { POST_SELECT, type Group, type Names, type Post } from '@/lib/types'
import Composer from './Composer'
import PostCard from './PostCard'

type Member = { user_id: string; role: string }

export default function GroupView({ group, role, requested, userId, names, follows, onFollow, ver, onChanged, onClose }: {
  group: Group; role: string | null; requested: boolean; userId: string; names: Names; follows: string[]
  onFollow: (id: string) => void; ver: number; onChanged: () => void; onClose: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [tab, setTab] = useState<'posts' | 'members' | 'requests'>('posts')
  const [posts, setPosts] = useState<Post[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [reqs, setReqs] = useState<string[]>([])
  const [error, setError] = useState('')
  const isAdmin = role === 'admin'
  const canView = !group.is_private || role !== null

  const loadPosts = async () => {
    if (!canView) return setPosts([])
    const { data } = await supabase.from('posts').select(POST_SELECT).eq('group_id', group.id)
      .order('created_at', { ascending: false }).limit(50)
    setPosts((data as Post[]) ?? [])
  }
  const loadPeople = async () => {
    const m = await supabase.from('group_members').select('user_id,role').eq('group_id', group.id).order('created_at')
    setMembers((m.data as Member[]) ?? [])
    if (isAdmin) {
      const r = await supabase.from('group_requests').select('user_id').eq('group_id', group.id).order('created_at')
      setReqs((r.data ?? []).map(x => x.user_id))
    } else setReqs([])
  }
  useEffect(() => { loadPosts(); loadPeople() }, [group.id, ver, canView, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  // Exécute une action puis recharge
  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await p
    setError(error?.message ?? '')
    onChanged()
  }
  const gid = group.id
  const join = () => run(supabase.from('group_members').insert({ group_id: gid, user_id: userId, role: 'member' }))
  const request = () => run(supabase.from('group_requests').insert({ group_id: gid }))
  const cancel = () => run(supabase.from('group_requests').delete().match({ group_id: gid, user_id: userId }))
  const leave = () => run(supabase.from('group_members').delete().match({ group_id: gid, user_id: userId }))
  const kick = (uid: string) => run(supabase.from('group_members').delete().match({ group_id: gid, user_id: uid }))
  const promote = (uid: string) => run(supabase.from('group_members').update({ role: 'admin' }).match({ group_id: gid, user_id: uid }))
  const reject = (uid: string) => run(supabase.from('group_requests').delete().match({ group_id: gid, user_id: uid }))
  async function accept(uid: string) {
    const { error } = await supabase.from('group_members').insert({ group_id: gid, user_id: uid, role: 'member' })
    if (error) return setError(error.message)
    await reject(uid)
  }
  async function removeGroup() {
    if (!confirm('Supprimer ce groupe et toutes ses publications ?')) return
    await run(supabase.from('groups').delete().eq('id', gid))
    onClose()
  }

  return (
    <div className="gview">
      <section className="card">
        <header className="post-head">
          <div>
            <h2>{group.name} <span className="tag">{group.is_private ? 'Privé' : 'Public'}</span></h2>
            {group.description && <p className="sub">{group.description}</p>}
            {canView && <p className="sub">{members.length} membre{members.length > 1 ? 's' : ''} · créé par {names[group.created_by] ?? '…'}</p>}
          </div>
          <div className="btns">
            {role === null && !requested && (
              <button className="go" onClick={group.is_private ? request : join}>
                {group.is_private ? 'Demander à rejoindre' : 'Rejoindre'}
              </button>
            )}
            {role === null && requested && <button className="ghost" onClick={cancel}>Demande envoyée · Annuler</button>}
            {role !== null && group.created_by !== userId && <button className="ghost" onClick={leave}>Quitter</button>}
            {group.created_by === userId && <button className="ghost" onClick={removeGroup}>Supprimer</button>}
          </div>
        </header>
        {error && <p className="error">{error}</p>}
        {canView && (
          <div className="kinds">
            <button className={tab === 'posts' ? 'on' : ''} onClick={() => setTab('posts')}>Publications</button>
            <button className={tab === 'members' ? 'on' : ''} onClick={() => setTab('members')}>Membres</button>
            {isAdmin && (
              <button className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>
                Demandes{reqs.length > 0 && <span className="badge">{reqs.length}</span>}
              </button>
            )}
          </div>
        )}
      </section>

      {!canView && (
        <p className="empty">
          {requested ? 'Votre demande est en attente de validation par un admin.'
            : 'Ce groupe est privé. Demandez à le rejoindre pour voir les publications.'}
        </p>
      )}

      {canView && tab === 'posts' && (
        <>
          {role !== null && <Composer userId={userId} groupId={group.id} onDone={loadPosts} />}
          {posts.length === 0 && <p className="empty">Aucune publication dans ce groupe.</p>}
          {posts.map(p => (
            <PostCard key={p.id} post={p} userId={userId} names={names} follows={follows}
              onFollow={onFollow} onChange={loadPosts} tick={ver} />
          ))}
        </>
      )}

      {canView && tab === 'members' && (
        <ul className="card people">
          {members.map(m => (
            <li key={m.user_id}>
              <span>{m.user_id === userId ? 'Vous' : names[m.user_id] ?? '…'} {m.role === 'admin' && <span className="tag">Admin</span>}</span>
              {isAdmin && m.user_id !== userId && (
                <span className="btns">
                  {m.role !== 'admin' && <button className="go" onClick={() => promote(m.user_id)}>Nommer admin</button>}
                  {m.user_id !== group.created_by && <button className="ghost" onClick={() => kick(m.user_id)}>Retirer</button>}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {canView && tab === 'requests' && isAdmin && (
        <ul className="card people">
          {reqs.length === 0 && <li className="sub">Aucune demande en attente.</li>}
          {reqs.map(uid => (
            <li key={uid}>
              <span>{names[uid] ?? '…'} souhaite rejoindre le groupe</span>
              <span className="btns">
                <button className="go" onClick={() => accept(uid)}>Accepter</button>
                <button className="ghost" onClick={() => reject(uid)}>Refuser</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
