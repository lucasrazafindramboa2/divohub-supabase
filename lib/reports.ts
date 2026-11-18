export const REPORT_REASONS = [
  ['harassment', 'Harcèlement'],
  ['spam', 'Spam'],
  ['inappropriate', 'Contenu inapproprié'],
  ['impersonation', 'Usurpation d’identité'],
  ['hate', 'Discours haineux'],
  ['violence', 'Violence ou menaces'],
  ['scam', 'Arnaque ou fraude'],
  ['privacy', 'Atteinte à la vie privée'],
  ['other', 'Autre'],
] as const

export const reasonLabel = (reason: string) => REPORT_REASONS.find(([k]) => k === reason)?.[1] ?? reason
