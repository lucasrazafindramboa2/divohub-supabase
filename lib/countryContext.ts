'use client'
import { createContext, useContext } from 'react'

// Nationalité de chaque utilisateur (code pays), fournie une fois par l'application
export const CountriesContext = createContext<Record<string, string | null>>({})
export const useCountry = (uid?: string) => {
  const countries = useContext(CountriesContext)
  return uid ? countries[uid] ?? null : null
}
