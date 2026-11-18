'use client'
import { useCountry } from '@/lib/countryContext'
import { countryName, flagUrl } from '@/lib/countries'

// Photo de profil + drapeau de la nationalité (si `uid` est fourni)
export default function Avatar({ url, name, size = 32, uid }: { url?: string | null; name: string; size?: number; uid?: string }) {
  const country = useCountry(uid)
  const style = { width: size, height: size, fontSize: size * 0.42 }
  const flagWidth = Math.max(14, Math.round(size * 0.46))
  return (
    <span className="av" style={{ width: size, height: size }}>
      {url
        ? <img className="avatar" src={url} alt="" style={style} />
        : <span className="avatar" style={style}>{(name || '?')[0].toUpperCase()}</span>}
      {country && (
        <img className="av-flag" src={flagUrl(country, 40)} srcSet={`${flagUrl(country, 80)} 2x`}
          alt={countryName(country)} title={countryName(country)} width={flagWidth} height={Math.round(flagWidth * 0.75)} />
      )}
    </span>
  )
}
