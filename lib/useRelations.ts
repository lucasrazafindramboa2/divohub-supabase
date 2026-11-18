'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Result = PromiseLike<{ error: { message: string } | null }>

// Relations de l'utilisateur connecté : demandes d'ami, amis, blocages, amis proches
export function useRelations(userId: string, onChanged: () => void) {
  const supabase = useMemo(() => createClient(), [])
  const [incoming, setIncoming] = useState<string[]>([])
  const [outgoing, setOutgoing] = useState<string[]>([])
  const [friends, setFriends] = useState<string[]>([])
  const [blocked, setBlocked] = useState<string[]>([])
  const [close, setClose] = useState<string[]>([])
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [rq, fr, bl, cf] = await Promise.all([
      supabase.from('friend_requests').select('sender_id,receiver_id'),
      supabase.from('friendships').select('user_a,user_b').or(`user_a.eq.${userId},user_b.eq.${userId}`),
      supabase.from('blocks').select('blocked_id'),
      supabase.from('close_friends').select('friend_id'),
    ])
    const r = rq.data ?? []
    setIncoming(r.filter(x => x.receiver_id === userId).map(x => x.sender_id))
    setOutgoing(r.filter(x => x.sender_id === userId).map(x => x.receiver_id))
    setFriends((fr.data ?? []).map(x => (x.user_a === userId ? x.user_b : x.user_a)))
    setBlocked((bl.data ?? []).map(x => x.blocked_id))
    setClose((cf.data ?? []).map(x => x.friend_id))
    setVersion(v => v + 1)
  }, [supabase, userId])
  useEffect(() => { load() }, [load])

  // Exécute une action, affiche l'erreur éventuelle, puis recharge
  async function run(p: Result) {
    const { error } = await p
    setError(!error ? '' : error.message.includes('row-level security')
      ? 'Seuls vos amis peuvent être ajoutés aux proches.' : error.message)
    await load(); onChanged()
  }

  return {
    incoming, outgoing, friends, blocked, close, version, error,
    sendRequest: (id: string) => run(supabase.rpc('friend_request_send', { p_to: id })),
    accept: (id: string) => run(supabase.rpc('friend_request_accept', { p_from: id })),
    refuse: (id: string) => run(supabase.from('friend_requests').delete().match({ sender_id: id, receiver_id: userId })),
    cancel: (id: string) => run(supabase.from('friend_requests').delete().match({ sender_id: userId, receiver_id: id })),
    removeFriend: (id: string) => confirm('Retirer cette personne de vos amis ?') ? run(supabase.rpc('friend_remove', { p_user: id })) : undefined,
    block: (id: string) => confirm('Bloquer cet utilisateur ? Vous ne serez plus amis ni abonnés l’un de l’autre.') ? run(supabase.rpc('block_user', { p_user: id })) : undefined,
    unblock: (id: string) => run(supabase.from('blocks').delete().match({ blocker_id: userId, blocked_id: id })),
    toggleClose: (id: string) => close.includes(id)
      ? run(supabase.from('close_friends').delete().match({ owner_id: userId, friend_id: id }))
      : run(supabase.from('close_friends').insert({ friend_id: id })),
  }
}
