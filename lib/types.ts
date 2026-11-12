export type Names = Record<string, string>
export type Post = {
  id: string; user_id: string; kind: 'post' | 'poll' | 'vote'; content: string
  image_url: string | null; created_at: string
  likes: { user_id: string }[]
  comments: { count: number }[]
  poll_options: { id: string; label: string; position: number }[]
  poll_votes: { user_id: string; option_id: string }[]
}
export type Story = {
  id: string; user_id: string; image_url: string; caption: string | null; created_at: string
  story_views: { viewer_id: string }[]
  story_reactions: { user_id: string; emoji: string }[]
}
export type Notif = { id: string; actor_id: string; type: 'like' | 'comment' | 'follow'; post_id: string | null; read: boolean; created_at: string }

export const ago = (d: string) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000
  if (s < 60) return "à l'instant"
  if (s < 3600) return `${Math.floor(s / 60)} min`
  if (s < 86400) return `${Math.floor(s / 3600)} h`
  return `${Math.floor(s / 86400)} j`
}
