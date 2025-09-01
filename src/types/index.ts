export type SongInfo = {
  title: string
  artist: string
  position: string
  duration: string
  isPlaying?: boolean
  positionMs?: number
  durationMs?: number
  coverUrl?: string
}

export type SessionState = 'idle' | 'hosting' | 'joined'
export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting'

export type SavedState = {
	sessionState?: SessionState
	sessionCode?: string
	connectionStatus?: ConnectionStatus
  connectedPeers?: number
  lastJoinedName?: string
}