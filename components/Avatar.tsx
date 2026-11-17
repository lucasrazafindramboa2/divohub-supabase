export default function Avatar({ url, name, size = 32 }: { url?: string | null; name: string; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.42 }
  return url
    ? <img className="avatar" src={url} alt="" style={style} />
    : <span className="avatar" style={style}>{(name || '?')[0].toUpperCase()}</span>
}
