// Configuration partagée client / serveur (aucun secret ici)
export const CURRENCY = (process.env.NEXT_PUBLIC_WALLET_CURRENCY ?? 'eur').toLowerCase()
export const MIN_CENTS = 500     // recharge minimale
export const MAX_CENTS = 50000   // recharge maximale
