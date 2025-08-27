export function timeToMs(t: string): number {
  if (!t) return 0
  const parts = t.split(':').map((p) => Number.parseInt(p, 10))
  if (parts.some((n) => Number.isNaN(n))) return 0
  // supports mm:ss or hh:mm:ss
  let ms = 0
  if (parts.length === 3) {
    const [hh, mm, ss] = parts
    ms = ((hh * 60 + mm) * 60 + ss) * 1000
  } else if (parts.length === 2) {
    const [mm, ss] = parts
    ms = (mm * 60 + ss) * 1000
  } else if (parts.length === 1) {
    ms = parts[0] * 1000
  }
  return ms
}

export function msToTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`
}
