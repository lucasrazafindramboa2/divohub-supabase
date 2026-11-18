export type Names = Record<string, string>
export type Reaction = { user_id: string; emoji: string }
export type Post = {
  id: string; user_id: string; kind: 'post' | 'poll' | 'vote'; content: string
  image_url: string | null; created_at: string
  post_reactions: Reaction[]
  comments: { count: number }[]
  poll_options: { id: string; label: string; position: number }[]
  poll_votes: { user_id: string; option_id: string }[]
}
export type Story = {
  id: string; user_id: string; image_url: string; caption: string | null; created_at: string
  story_views: { viewer_id: string }[]
  story_reactions: { user_id: string; emoji: string }[]
}
export type Notif = {
  id: string; actor_id: string; type: 'like' | 'comment' | 'follow' | 'reaction' | 'reply' | 'friend_request' | 'friend_accept' | 'moderation'
  emoji: string | null; message: string | null; post_id: string | null; read: boolean; created_at: string
}

export const ago = (d: string) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000
  if (s < 60) return "à l'instant"
  if (s < 3600) return `${Math.floor(s / 60)} min`
  if (s < 86400) return `${Math.floor(s / 3600)} h`
  return `${Math.floor(s / 86400)} j`
}

export type Group = {
  id: string; name: string; description: string | null; is_private: boolean
  created_by: string; created_at: string
}
export const POST_SELECT =
  '*, post_reactions(user_id,emoji), comments(count), poll_options(id,label,position), poll_votes(user_id,option_id)'
