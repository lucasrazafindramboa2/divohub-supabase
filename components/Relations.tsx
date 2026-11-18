'use client'
import type { useRelations } from '@/lib/useRelations'
import Avatar from './Avatar'

type Rel = ReturnType<typeof useRelations>

// Actions de relation affichées sur le profil d'un autre utilisateur
export function RelationBar({ profileId, rel, follows, onFollow }: {
  profileId: string; rel: Rel; follows: string[]; onFollow: (id: string) => void
}) {
  const following = follows.includes(profileId)
  return (
    <div className="relbar">
      {rel.blocked.includes(profileId) ? (
        <button className="go" onClick={() => rel.unblock(profileId)}>Débloquer</button>
      ) : (
        <>
          {rel.friends.includes(profileId) ? (
            <>
              <button className="ghost" onClick={() => rel.toggleClose(profileId)}>
                {rel.close.includes(profileId) ? '★ Ami proche' : '☆ Ami proche'}
              </button>
              <button className="ghost" onClick={() => rel.removeFriend(profileId)}>Retirer des amis</button>
            </>
          ) : rel.incoming.includes(profileId) ? (
            <>
              <button className="go" onClick={() => rel.accept(profileId)}>Accepter</button>
              <button className="ghost" onClick={() => rel.refuse(profileId)}>Refuser</button>
            </>
          ) : rel.outgoing.includes(profileId) ? (
            <button className="ghost" onClick={() => rel.cancel(profileId)}>Demande envoyée · Annuler</button>
          ) : (
            <button className="go" onClick={() => rel.sendRequest(profileId)}>Ajouter en ami</button>
          )}
          <button className={following ? 'ghost' : 'go'} onClick={() => onFollow(profileId)}>{following ? 'Abonné' : 'Suivre'}</button>
          <button className="ghost danger" onClick={() => rel.block(profileId)}>Bloquer</button>
        </>
      )}
      {rel.error && <p className="error">{rel.error}</p>}
    </div>
  )
}

// Actions sur une ligne de la liste de ses propres amis
export function FriendActions({ id, rel }: { id: string; rel: Rel }) {
  return (
    <span className="btns">
      <button className="ghost" onClick={() => rel.toggleClose(id)} title="Ami proche">{rel.close.includes(id) ? '★' : '☆'}</button>
      <button className="ghost" onClick={() => rel.removeFriend(id)}>Retirer</button>
    </span>
  )
}

// Onglets réservés à son propre profil : Demandes, Proches, Bloqués
export function RelationLists({ tab, rel, names, avatars, onProfile }: {
  tab: string; rel: Rel; names: Record<string, string>; avatars: Record<string, string | null>; onProfile: (id: string) => void
}) {
  const row = (id: string, actions: React.ReactNode) => (
    <li key={id}>
      <span className="who">
        <Avatar url={avatars[id]} name={names[id] ?? '?'} size={34} uid={id} />
        <button className="plain" onClick={() => onProfile(id)}>{names[id] ?? '…'}</button>
      </span>
      <span className="btns">{actions}</span>
    </li>
  )
  const err = rel.error && <p className="error">{rel.error}</p>

  if (tab === 'requests') return (
    <div className="profile-posts">
      <section className="card rel-card">
        <h2>Demandes reçues</h2>{err}
        <ul className="people">
          {rel.incoming.length === 0 && <li className="sub">Aucune demande reçue.</li>}
          {rel.incoming.map(id => row(id, <>
            <button className="go" onClick={() => rel.accept(id)}>Accepter</button>
            <button className="ghost" onClick={() => rel.refuse(id)}>Refuser</button>
          </>))}
        </ul>
      </section>
      <section className="card rel-card">
        <h2>Demandes envoyées</h2>
        <ul className="people">
          {rel.outgoing.length === 0 && <li className="sub">Aucune demande en attente.</li>}
          {rel.outgoing.map(id => row(id, <button className="ghost" onClick={() => rel.cancel(id)}>Annuler</button>))}
        </ul>
      </section>
    </div>
  )
  if (tab === 'close') return (
    <section className="card rel-card">
      <h2>Amis proches</h2>
      <p className="sub">Liste privée, réservée à vos amis. Ajoutez-en depuis l’onglet Amis avec l’étoile.</p>{err}
      <ul className="people">
        {rel.close.length === 0 && <li className="sub">Aucun ami proche.</li>}
        {rel.close.map(id => row(id, <button className="ghost" onClick={() => rel.toggleClose(id)}>Retirer</button>))}
      </ul>
    </section>
  )
  if (tab === 'blocked') return (
    <section className="card rel-card">
      <h2>Utilisateurs bloqués</h2>{err}
      <ul className="people">
        {rel.blocked.length === 0 && <li className="sub">Aucun utilisateur bloqué.</li>}
        {rel.blocked.map(id => row(id, <button className="ghost" onClick={() => rel.unblock(id)}>Débloquer</button>))}
      </ul>
    </section>
  )
  return null
}
