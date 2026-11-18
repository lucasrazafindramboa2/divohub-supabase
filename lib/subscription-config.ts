// Configuration de l'abonnement (aucun secret). Prix en centimes de la devise du wallet.
// Modifiable via NEXT_PUBLIC_SUBSCRIPTION_PRICE_CENTS (500 = 5,00).
const price = Number.parseInt(process.env.NEXT_PUBLIC_SUBSCRIPTION_PRICE_CENTS ?? '', 10)
export const SUBSCRIPTION_PRICE_CENTS = Number.isInteger(price) && price > 0 ? price : 500
