'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ago, type Names, type Notif, type Post, type Story } from '@/lib/types'
import Composer from './Composer'
import PostCard from './PostCard'
import Stories from './Stories'
import Messages from './Messages'
import Groups from './Groups'
import Profile from './Profile'
import Wallet from './Wallet'
import Avatar from './Avatar'

const TEXT: Record<string, string> = { like: 'a aimé votre publication', comment: 'a commenté votre publication', follow: 'a commencé à vous suivre', reply: 'a répondu à votre commentaire' }
const label = (n: Notif) => (n.type === 'reaction' ? `a réagi ${n.emoji ?? ''} à votre publication` : TEXT[n.type])
type Tab = 'feed' | 'notifs' | 'messages' | 'groups' | 'profile' | 'wallet'

export default function App({ userId, username }: { userId: string; username: string }) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('feed')
  const [names, setNames] = useState<Names>({})
  const [posts, setPosts] = useState<Post[]>([])
  const [follows, setFollows] = useState<string[]>([])
  const [stories, setStories] = useState<Story[]>([])
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [onlineIds, setOnlineIds] = useState<string[]>([])
  const [msgUnread, setMsgUnread] = useState(0)
  const [tick, setTick] = useState(0)
  const [ver, setVer] = useState(0)
  const [avatars, setAvatars] = useState<Record<string, string | null>>({})
  const [profileId, setProfileId] = useState(userId)
  const [groupOpen, setGroupOpen] = useState<{ id: string; n: number } | null>(null)
  const [pending, setPending] = useState(0)
  const [dm, setDm] = useState<{ id: string; n: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const loadFeed = async () => {
    const [p, n] = await Promise.all([
      supabase.from('posts')
        .select('*, post_reactions(user_id,emoji), comments(count), poll_options(id,label,position), poll_votes(user_id,option_id)')
        .is('group_id', null).order('created_at', { ascending: false }).limit(50),
      supabase.from('profiles').select('id,username,avatar_url'),
    ])
    setPosts((p.data as Post[]) ?? [])
    setNames(Object.fromEntries((n.data ?? []).map(x => [x.id, x.username])))
    setAvatars(Object.fromEntries((n.data ?? []).map(x => [x.id, x.avatar_url])))
  }
  const loadFollows = async () => {
    const { data } = await supabase.from('follows').select('following_id').eq('follower_id', userId)
    setFollows((data ?? []).map(f => f.following_id))
  }
  const loadStories = async () => {
    const since = new Date(Date.now() - 864e5).toISOString()
    const { data } = await supabase.from('stories')
      .select('*, story_views(viewer_id), story_reactions(user_id,emoji)')
      .gte('created_at', since).order('created_at')
    setStories((data as Story[]) ?? [])
  }
  const loadNotifs = async () => {
    const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(40)
    setNotifs((data as Notif[]) ?? [])
  }
  const refresh = () => { clearTimeout(timer.current); timer.current = setTimeout(() => { loadFeed(); setVer(v => v + 1) }, 250) }

  useEffect(() => {
    loadFeed(); loadFollows(); loadStories(); loadNotifs()
    const ch = supabase.channel('social')
    for (const table of ['posts', 'post_reactions', 'comments', 'poll_votes'])
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, refresh)
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'comment_reactions' }, () => setTick(t => t + 1))
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, loadStories)
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, loadNotifs)
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Présence : qui est en ligne
  useEffect(() => {
    const ch = supabase.channel('presence:global', { config: { presence: { key: userId } } })
    ch.on('presence', { event: 'sync' }, () => setOnlineIds(Object.keys(ch.presenceState())))
      .subscribe(async status => { if (status === 'SUBSCRIBED') await ch.track({ username }) })
    return () => { supabase.removeChannel(ch) }
  }, [supabase, userId, username])

  // Retour de paiement Stripe : ouvre directement le portefeuille
  useEffect(() => { if (new URLSearchParams(window.location.search).has('wallet')) setTab('wallet') }, [])

  const unread = notifs.filter(n => !n.read).length
  useEffect(() => {
    if (tab === 'notifs' && unread > 0)
      supabase.from('notifications').update({ read: true }).eq('read', false).then(loadNotifs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, unread])

  async function toggleFollow(id: string) {
    if (follows.includes(id)) await supabase.from('follows').delete().match({ follower_id: userId, following_id: id })
    else await supabase.from('follows').insert({ following_id: id })
    loadFollows()
  }
  async function logout() {
    await supabase.auth.signOut()
    router.push('/login'); router.refresh()
  }
  const onUnread = useCallback((n: number) => setMsgUnread(n), [])
  const onPending = useCallback((n: number) => setPending(n), [])
  const openProfile = (id: string) => { setProfileId(id); setTab('profile') }
  const openGroup = (id: string) => { setGroupOpen({ id, n: Date.now() }); setTab('groups') }
  const openDm = (id: string) => { setTab('messages'); setDm({ id, n: Date.now() }) }

  const people = Object.entries(names).filter(([id]) => id !== userId)

  return (
    <div className="shell">
      <header className="top">
        <h1>Cercle</h1>
        <nav>
          <button className={tab === 'feed' ? 'on' : ''} onClick={() => setTab('feed')}>Fil</button>
          <button className={tab === 'messages' ? 'on' : ''} onClick={() => setTab('messages')}>
            Messages{msgUnread > 0 && <span className="badge">{msgUnread}</span>}
          </button>
          <button className={tab === 'groups' ? 'on' : ''} onClick={() => setTab('groups')}>
            Groupes{pending > 0 && <span className="badge">{pending}</span>}
          </button>
          <button className={tab === 'wallet' ? 'on' : ''} onClick={() => setTab('wallet')}>Portefeuille</button>
          <button className={tab === 'notifs' ? 'on' : ''} onClick={() => setTab('notifs')}>
            Notifications{unread > 0 && <span className="badge">{unread}</span>}
          </button>
        </nav>
        <button className="me" onClick={() => openProfile(userId)} title="Mon profil">
          <Avatar url={avatars[userId]} name={username} size={28} /><span className="me-name">{username}</span>
        </button>
        <button className="ghost" onClick={logout}>Déconnexion</button>
      </header>

      <div className={tab === 'messages' || tab === 'groups' ? 'cols wide' : 'cols'}>
        <main>
          {tab === 'feed' && (
            <>
              <Stories userId={userId} names={names} stories={stories} follows={follows} onChange={loadStories} />
              <Composer userId={userId} onDone={loadFeed} />
              {posts.length === 0 && <p className="empty">Aucune publication. Écrivez la première.</p>}
              {posts.map(p => (
                <PostCard key={p.id} post={p} userId={userId} names={names} follows={follows}
                  onFollow={toggleFollow} onChange={loadFeed} tick={tick}
                  avatars={avatars} onProfile={openProfile} />
              ))}
            </>
          )}
          {tab === 'profile' && (
            <Profile profileId={profileId} userId={userId} onChanged={loadFeed} names={names} avatars={avatars}
              follows={follows} onFollow={toggleFollow} onProfile={openProfile} onOpenGroup={openGroup} ver={ver} />
          )}
          {tab === 'wallet' && <Wallet userId={userId} />}
          {tab === 'notifs' && (
            <ul className="notifs">
              {notifs.length === 0 && <p className="empty">Aucune notification pour l’instant.</p>}
              {notifs.map(n => (
                <li key={n.id} className={n.read ? '' : 'new'}>
                  <strong>{names[n.actor_id] ?? '…'}</strong> {label(n)}
                  <span className="sub"> · {ago(n.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
          {/* Toujours monté pour recevoir les messages en direct */}
          <div hidden={tab !== 'messages'}>
            <Messages userId={userId} names={names} onlineIds={onlineIds} active={tab === 'messages'}
              dmRequest={dm} onUnread={onUnread} />
          </div>
          <div hidden={tab !== 'groups'}>
            <Groups userId={userId} names={names} follows={follows} onFollow={toggleFollow} ver={ver} onPending={onPending} openRequest={groupOpen} />
          </div>
        </main>
        {tab !== 'messages' && tab !== 'groups' && (
          <aside>
            <h2>Personnes ({onlineIds.length} en ligne)</h2>
            {people.length === 0 && <p className="sub">Invitez un ami à créer un compte.</p>}
            <ul>
              {people.map(([id, name]) => (
                <li key={id}>
                  <span className="who">
                    <span className={onlineIds.includes(id) ? 'dot' : 'dot off'} />
                    <Avatar url={avatars[id]} name={name} size={26} />
                    <button className="plain" onClick={() => openProfile(id)}>{name}</button>
                  </span>
                  <span className="btns">
                    <button className="ghost" onClick={() => openDm(id)}>Message</button>
                    <button className={follows.includes(id) ? 'ghost' : 'go'} onClick={() => toggleFollow(id)}>
                      {follows.includes(id) ? 'Abonné' : 'Suivre'}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </div>
  )
}
