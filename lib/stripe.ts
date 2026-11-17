import Stripe from 'stripe'

let client: Stripe | null = null

// Création à la demande : ne plante pas au build si la clé est absente
export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY manquante')
  return (client ??= new Stripe(key))
}
