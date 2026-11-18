export const normalizeEmail = (value: unknown) => (typeof value === 'string' ? value.trim().toLowerCase() : '')

const FORMAT = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

// Format valide : partie locale, @, domaine avec au moins un point, longueurs limites
export const isValidEmailFormat = (email: string) => {
  const [local = ''] = email.split('@')
  return email.length <= 254 && local.length <= 64 && FORMAT.test(email)
}

const TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com', 'hotmial.com': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'yaho.com': 'yahoo.com', 'outlok.com': 'outlook.com',
}

// Correction proposée pour les fautes de frappe courantes (ex. gmial.com)
export const suggestEmail = (email: string) => {
  const [local, domain] = email.split('@')
  return domain && TYPOS[domain] ? `${local}@${TYPOS[domain]}` : null
}
