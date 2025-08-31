// no explicit React import needed with modern TSX settings
import { useEffect, useMemo, useRef, useState } from 'react'
import { getActiveTab, isSpotifyUrl } from '../utils/tabs'
import { Play as PlayIcon, Pause as PauseIcon } from 'lucide-react'
import { timeToMs } from '../utils/time'
import { SongInfo } from '@/types'

interface Props {
  song: SongInfo | null
}


export default function NowPlaying({ song }: Props) {
  const durationMs = useMemo(
    () => (typeof song?.durationMs === 'number' ? song!.durationMs : timeToMs(song?.duration ?? '0')),
    [song?.durationMs, song?.duration]
  )
  const positionMs = useMemo(
    () => (typeof song?.positionMs === 'number' ? song!.positionMs : timeToMs(song?.position ?? '0')),
    [song?.positionMs, song?.position]
  )

  const [sliderMs, setSliderMs] = useState<number>(positionMs)
  const [isSeeking, setIsSeeking] = useState(false)
  const [isPlaying, setIsPlaying] = useState<boolean>(Boolean(song?.isPlaying))
  const prevPosRef = useRef<number>(positionMs)
  const prevTsRef = useRef<number>(Date.now())

  // keep slider in sync with incoming song updates unless user is actively seeking
  useEffect(() => {
    if (!isSeeking) setSliderMs(positionMs)
  }, [positionMs, isSeeking])

  // prefer explicit flag from content script; fall back to position delta only if undefined
  useEffect(() => {
    if (typeof song?.isPlaying === 'boolean') {
      setIsPlaying(song.isPlaying)
      prevPosRef.current = positionMs
      prevTsRef.current = Date.now()
      return
    }
    const now = Date.now()
    const deltaReported = positionMs - prevPosRef.current
    const deltaTime = now - prevTsRef.current
    if (deltaTime > 0) {
      if (deltaReported >= 800 && deltaReported <= 2000) setIsPlaying(true)
      else if (Math.abs(deltaReported) <= 200) setIsPlaying(false)
    }
    prevPosRef.current = positionMs
    prevTsRef.current = now
  }, [song?.isPlaying, positionMs])

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
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={song.title}>
            {song.title}
          </div>
          <div style={{ fontSize: 13, color: '#b0b4b9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={song.artist}>
            {song.artist}
          </div>
        </div>
      </div>

      {/* progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#9aa0a6', fontSize: 12 }}>
          {song.position}
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
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', marginTop: 4 }}>
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
          onClick={() => void send('TOGGLE')}
          title={isPlaying ? 'Pause' : 'Play'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          style={{
            padding: '8px 12px',
            background: isPlaying ? '#2a2a2a' : '#1db954',
            color: isPlaying ? '#fff' : '#000',
            border: isPlaying ? '1px solid #3a3a3a' : 'none',
            borderRadius: 999,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 44,
          }}
        >
          {isPlaying ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
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
