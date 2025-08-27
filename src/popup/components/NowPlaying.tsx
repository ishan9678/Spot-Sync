// no explicit React import needed with modern TSX settings

type SongInfo = {
  title: string
  artist: string
  position: string
  duration: string
}

interface Props {
  song: SongInfo | null
}

export default function NowPlaying({ song }: Props) {
  if (!song || !song.title) return null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
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
    </div>
  )
}
