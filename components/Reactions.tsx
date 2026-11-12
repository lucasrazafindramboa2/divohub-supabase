'use client'
import { useState } from 'react'
import type { Names, Reaction } from '@/lib/types'

export const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡']

export default function Reactions({ reactions, userId, names, onReact }: {
  reactions: Reaction[]; userId: string; names: Names; onReact: (emoji: string | null) => void
}) {
  const [pick, setPick] = useState(false)
  const [who, setWho] = useState(false)
  const mine = reactions.find(r => r.user_id === userId)?.emoji
  const groups = EMOJIS.map(e => ({ e, list: reactions.filter(r => r.emoji === e) })).filter(g => g.list.length > 0)

  return (
    <span className="reacts">
      <span className="react-wrap">
        <button className={mine ? 'react on' : 'react'} onClick={() => setPick(!pick)}>
          {mine ?? '♡'} {mine ? 'Réagi' : 'Réagir'}
        </button>
        {pick && (
          <span className="emoji-pop">
            {EMOJIS.map(e => (
              <button key={e} className={e === mine ? 'on' : ''}
                onClick={() => { onReact(e === mine ? null : e); setPick(false) }}>{e}</button>
            ))}
          </span>
        )}
      </span>
      {reactions.length > 0 && (
        <button className="react-sum" onClick={() => setWho(true)} title="Voir qui a réagi">
          {groups.map(g => g.e).join('')} {reactions.length}
        </button>
      )}
      {who && (
        <div className="overlay" onClick={() => setWho(false)}>
          <div className="picker" onClick={e => e.stopPropagation()}>
            <h2>Réactions ({reactions.length})</h2>
            <ul className="who-list">
              {groups.map(g => (
                <li key={g.e}>
                  <strong>{g.e} {g.list.length}</strong>
                  <span>{g.list.map(r => (r.user_id === userId ? 'Vous' : names[r.user_id] ?? '…')).join(', ')}</span>
                </li>
              ))}
            </ul>
            <div className="actions"><button className="ghost" onClick={() => setWho(false)}>Fermer</button></div>
          </div>
        </div>
      )}
    </span>
  )
}
