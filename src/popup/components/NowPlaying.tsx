// no explicit React import needed with modern TSX settings
import { useEffect, useMemo, useRef, useState } from 'react'
import { getActiveTab, isSpotifyUrl } from '../utils/tabs'
import { Play as PlayIcon, Pause as PauseIcon } from 'lucide-react'

type SongInfo = {
  title: string
  artist: string
  position: string
  duration: string
}

interface Props {
  song: SongInfo | null
}

function timeToMs(t: string): number {
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

function msToTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`
}

export default function NowPlaying({ song }: Props) {
  const durationMs = useMemo(() => timeToMs(song?.duration ?? '0'), [song?.duration])
  const positionMs = useMemo(() => timeToMs(song?.position ?? '0'), [song?.position])

  const [sliderMs, setSliderMs] = useState<number>(positionMs)
  const [isSeeking, setIsSeeking] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const prevPosRef = useRef<number>(positionMs)
  const prevTsRef = useRef<number>(Date.now())

  // keep slider in sync with incoming song updates unless user is actively seeking
  useEffect(() => {
    if (!isSeeking) setSliderMs(positionMs)
  }, [positionMs, isSeeking])

  // infer playing state from position deltas (content script doesn't send isPlaying)
  useEffect(() => {
    const now = Date.now()
    const deltaReported = positionMs - prevPosRef.current
    const deltaTime = now - prevTsRef.current
    // consider ~1s ticks as playing; near-zero as paused; ignore negative (seek) and huge jumps
    if (deltaTime > 0) {
      if (deltaReported >= 800 && deltaReported <= 2000) {
        setIsPlaying(true)
      } else if (Math.abs(deltaReported) <= 200) {
        setIsPlaying(false)
      }
    }
    prevPosRef.current = positionMs
    prevTsRef.current = now
  }, [positionMs])

  if (!song || !song.title) return null

  const send = async (type: 'PLAY' | 'PAUSE' | 'TOGGLE' | 'SEEK', payload?: any) => {
    try {
      const tab = await getActiveTab()
      if (tab?.id && isSpotifyUrl(tab.url)) {
        await chrome.tabs.sendMessage(tab.id, { type, ...(payload ?? {}) })
        return
      }
    } catch {
      // fallback to runtime message
    }
    await chrome.runtime.sendMessage({ type, ...(payload ?? {}) })
  }

  const onSeekCommit = (value: number) => {
    const clamped = Math.max(0, Math.min(value, durationMs || 0))
    setSliderMs(clamped)
  void send('SEEK', { ms: clamped })
  }

  const disabled = durationMs <= 0

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 10,
        border: '1px solid #333',
        borderRadius: 8,
        background: '#101010',
      }}
      aria-label="Now Playing"
    >
      <div style={{ fontSize: 12, color: '#9aa0a6', letterSpacing: 0.4 }}>Now Playing</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={song.title}>
            {song.title}
          </div>
          <div style={{ fontSize: 13, color: '#b0b4b9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={song.artist}>
            {song.artist}
          </div>
        </div>
        <div style={{ fontVariantNumeric: 'tabular-nums', color: '#b0b4b9', fontSize: 12 }}>
          {song.position} / {song.duration}
        </div>
      </div>

      {/* progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#9aa0a6', fontSize: 12 }}>
          {msToTime(sliderMs)}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(0, durationMs)}
          step={500}
          value={Math.min(sliderMs, durationMs)}
          onChange={(e) => setSliderMs(Number(e.currentTarget.value))}
          onMouseDown={() => setIsSeeking(true)}
          onMouseUp={() => {
            setIsSeeking(false)
            onSeekCommit(sliderMs)
          }}
          onTouchStart={() => setIsSeeking(true)}
          onTouchEnd={() => {
            setIsSeeking(false)
            onSeekCommit(sliderMs)
          }}
          aria-label="Seek"
          style={{ flex: 1 }}
          disabled={disabled}
        />
        <span style={{ width: 40, fontVariantNumeric: 'tabular-nums', color: '#9aa0a6', fontSize: 12 }}>
          {song.duration}
        </span>
      </div>

      {/* controls */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
        <button
          onClick={() => void send('TOGGLE')}
          title={isPlaying ? 'Pause' : 'Play'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          style={{
            padding: '6px 10px',
            background: isPlaying ? '#2a2a2a' : '#1db954',
            color: isPlaying ? '#fff' : '#000',
            border: isPlaying ? '1px solid #3a3a3a' : 'none',
            borderRadius: 6,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {isPlaying ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
          <span style={{ display: 'inline-block' }}>{isPlaying ? 'Pause' : 'Play'}</span>
        </button>
        <button
          onClick={() => {
            const v = Math.max(0, Math.min((sliderMs || 0) - 10000, durationMs))
            setSliderMs(v)
            onSeekCommit(v)
          }}
          title="Back 10s"
          aria-label="Back 10 seconds"
          style={{
            padding: '6px 10px',
            background: '#2a2a2a',
            color: '#fff',
            border: '1px solid #3a3a3a',
            borderRadius: 6,
            cursor: 'pointer',
          }}
          disabled={disabled}
        >
          -10s
        </button>
        <button
          onClick={() => {
            const v = Math.max(0, Math.min((sliderMs || 0) + 10000, durationMs))
            setSliderMs(v)
            onSeekCommit(v)
          }}
          title="Forward 10s"
          aria-label="Forward 10 seconds"
          style={{
            padding: '6px 10px',
            background: '#2a2a2a',
            color: '#fff',
            border: '1px solid #3a3a3a',
            borderRadius: 6,
            cursor: 'pointer',
          }}
          disabled={disabled}
        >
          +10s
        </button>
      </div>
    </div>
  )
}
