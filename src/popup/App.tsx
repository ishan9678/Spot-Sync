import { useState, useEffect } from 'react'
import { Toaster, toast } from 'react-hot-toast'
import { Music } from 'lucide-react'
import StatusIndicator from './components/StatusIndicator'
import IdleControls from './components/IdleControls'
import HostView from './components/HostView'
import JoinedView from './components/JoinedView'
import NowPlaying from './components/NowPlaying'
import NamePrompt from './components/NamePrompt'
import './App.css'
import {
  getSavedState,
  getStatus,
  startHostSession,
  joinSessionRequest,
  leaveSessionRequest,
  endSessionRequest,
  isValidSessionCode,
  setDisplayName,
  getDisplayName,
} from './utils/session'
import { getActiveTabUrl, isSpotifyUrl } from './utils/tabs'
import type { SessionState, ConnectionStatus, SongInfo } from '@/types'

export default function App() {
  const [sessionState, setSessionState] = useState<SessionState>('idle')
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [sessionCode, setSessionCode] = useState<string>('')

  const [connectedPeers, setConnectedPeers] = useState<number>(0)
  const [onSpotify, setOnSpotify] = useState<boolean>(false)
  const [songInfo, setSongInfo] = useState<SongInfo | null>(null)
  const [_, setName] = useState<string>('')
  const [needsName, setNeedsName] = useState<boolean>(false)
  const [hostName, setHostName] = useState<string>('')
  const [lastJoinedName, setLastJoinedName] = useState<string>('')

  // Load current state from background script when popup opens
  useEffect(() => {
  const loadCurrentState = async () => {
      try {
        const status = await getStatus()
  if (status) {
          setSessionState(status.sessionState || 'idle')
          setSessionCode(status.sessionCode || '')
          setConnectionStatus(status.connected ? 'connected' : 'disconnected')
          setConnectedPeers(status.peerCount || 0)
          if ((status as any).lastJoinedName) setLastJoinedName((status as any).lastJoinedName)
        }
      } catch (error) {
        console.error('Error loading current state:', error)
        // Fallback to storage if background script fails
  const result = await getSavedState()
        setSessionState(result.sessionState)
        setSessionCode(result.sessionCode)
        setConnectionStatus(result.connectionStatus)
        setConnectedPeers(result.connectedPeers)
        if ((result as any).lastJoinedName) setLastJoinedName((result as any).lastJoinedName)
      }
    }

  loadCurrentState()
  }, [])

  // Check active tab once to indicate if user is on Spotify
  useEffect(() => {
    (async () => {
      try {
        const url = await getActiveTabUrl()
        setOnSpotify(isSpotifyUrl(url))
      } catch {
        setOnSpotify(false)
      }
    })()
  }, [])

  // Ask for name on first open and store it via UI component
  useEffect(() => {
    (async () => {
  const existing = await getDisplayName()
      if (existing) {
        setName(existing)
        setNeedsName(false)
      } else {
        setNeedsName(true)
      }
    })()
  }, [])

  const startSession = async () => {
    if (connectionStatus === 'connecting') return
    
    setConnectionStatus('connecting')
    
  try {
  const response = await startHostSession()
    if (response.error) {
      setConnectionStatus('disconnected')
      toast.error(response.error)
  } else if (response.sessionCode) {
      setSessionCode(response.sessionCode)
      setSessionState('hosting')
      setConnectionStatus('connected')
      toast.success('Session started!')
    }
    } catch (error) {
      console.error('Failed to start session:', error)
      setConnectionStatus('disconnected')
      const errorMessage = 'Failed to start session. Please check your internet connection and try again.'
      toast.error(errorMessage)
    }
  }

  const joinSession = async (code: string) => {
    if (!isValidSessionCode(code)) {
      toast.error('Enter a valid 6-digit code')
      return
    }

    setConnectionStatus('connecting')

    try {
    const response: any = await joinSessionRequest(code)
        if (response?.success) {
          setSessionState('joined')
          setHostName(response.hostName || '')
          setConnectionStatus('connected')
          toast.success('Joined session successfully!')
        } else {
          setConnectionStatus('disconnected')
          const msg = response?.error || 'Failed to join session'
          toast.error(msg)
        }
    } catch (error) {
      console.error('Failed to join session:', error)
      setConnectionStatus('disconnected')
      toast.error('Failed to join session')
    }
  }

  const endSession = async () => {
      try {
        await endSessionRequest()
        toast.success('Session ended')
      } catch (error) {
        console.error('Error ending session:', error)
        toast.error('Failed to end session')
      }
      
      // Update local UI state
      setSessionState('idle')
      setConnectionStatus('disconnected')
      setSessionCode('')
      setConnectedPeers(0)
  }

  const leaveSession = async () => {
    try {
      await leaveSessionRequest()
      toast.success('Left session')
    } catch (error) {
      console.error('Error leaving session:', error)
      // Still show success since we've already left locally
      toast.success('Left session')
    }

    // Update local UI state
    setSessionState('idle')
    setConnectionStatus('disconnected')
    setSessionCode('')
    setConnectedPeers(0)
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(sessionCode)
      toast.success('Session code copied!')
    } catch (error) {
      toast.error('Failed to copy code')
    }
  }

  useEffect(() => {
    const lastMismatchRef = { key: '', ts: 0 }
    
    const messageListener = (message: any) => {      
      if (message?.type === 'SONG_INFO' && message.payload) {        
        // If hosting, display this song info
        if (sessionState === 'hosting') {
          setSongInfo(message.payload)
        }
        return
      }
      
      if (message?.type === 'SONG_INFO_UPDATED' && message.payload) {        
        // If joined, display the host's song info
        if (sessionState === 'joined') {
          setSongInfo(message.payload)
        }
        return
      }
      
      if (message?.type === 'SYNC_MISMATCH' && message.hostSong) {
        const key = `${message.hostSong.title}—${message.hostSong.artist}`
        const now = Date.now()
        if (key !== lastMismatchRef.key || now - lastMismatchRef.ts > 5000) {
          lastMismatchRef.key = key
          lastMismatchRef.ts = now
          toast(() => (
            <div>
              Host is playing
              <div style={{ fontWeight: 600 }}>{message.hostSong.title}</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>{message.hostSong.artist}</div>
              <div style={{ marginTop: 6, fontSize: 12 }}>Switch to this track to sync.</div>
            </div>
          ), { id: 'sync-mismatch', duration: 4000 })
        } else {
          console.log('[POPUP] Skipping duplicate sync mismatch toast for:', key)
        }
        return
      }
      
      if (message.type === 'PEER_COUNT_UPDATE') {
        setConnectedPeers(message.count)
      } else if (message.type === 'CONNECTION_LOST') {
        setConnectionStatus('disconnected')
        toast.error('Connection lost')
      } else if (message.type === 'CONNECTION_RESTORED') {
        setConnectionStatus('connected')
        toast.success('Connection restored')
  } else if (message.type === 'SESSION_ENDED') {
        // Session ended by host or due to disconnect
        setSessionState('idle')
        setConnectionStatus('disconnected')
        setSessionCode('')
        setConnectedPeers(0)
        
        // Show different messages based on the reason
        const reason = message.message || 'Session ended'
        if (reason.includes('Host disconnected')) {
          toast.error('Host disconnected - session ended')
        } else if (reason.includes('ended by host')) {
          toast.error('Session ended by host')
        } else {
          toast.error(reason)
        }
      } else if (message.type === 'CLIENT_JOINED') {
        const who = message.name ? `${message.name}` : 'Someone'
        if (who && who !== 'Someone') setLastJoinedName(who)
        toast.success(message.message || `${who} joined the session`)
      }
    }

    chrome.runtime.onMessage.addListener(messageListener)
    return () => chrome.runtime.onMessage.removeListener(messageListener)
  }, [sessionState])

  return (
    <div className="app">
      <Toaster 
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1a1a1a',
            color: '#fff',
            border: '1px solid #333',
          },
        }}
      />
      
      <div className="header">
        <div className="logo-container">
          <Music className="app-logo" size={24} />
          <h1 className="app-title">Spot Sync</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="spotify-indicator" title={onSpotify ? 'On Spotify' : 'Not on Spotify'} aria-label={onSpotify ? 'On Spotify' : 'Not on Spotify'}>
            <span className={`dot ${onSpotify ? 'on' : 'off'}`} />
          </div>
          <StatusIndicator connectionStatus={connectionStatus} />
        </div>
      </div>

      <div className="main-content">
      {needsName && (
        <NamePrompt
          onSubmit={async (name) => {
            if (!name) return
            await setDisplayName(name)
            setName(name)
            setNeedsName(false)
            toast.success(`Hi ${name}!`)
          }}
        />
      )}
      <NowPlaying song={songInfo} />

        {sessionState === 'idle' && (
          <IdleControls
            connectionStatus={connectionStatus}
            onStart={startSession}
            onJoin={joinSession}
          />
        )}

  {sessionState === 'hosting' && (
          <HostView
            sessionCode={sessionCode}
            connectedPeers={connectedPeers}
            onCopy={copyToClipboard}
            onLeave={endSession}
            lastJoinedName={lastJoinedName}
          />
        )}

    {sessionState === 'joined' && (
          <JoinedView
            connectedPeers={connectedPeers}
      hostName={hostName}
            onLeave={leaveSession}
          />
        )}
      </div>
    </div>
  )
}
