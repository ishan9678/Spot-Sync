import { useState, useEffect } from 'react'
import { Toaster, toast } from 'react-hot-toast'
import { Music } from 'lucide-react'
import StatusIndicator from './components/StatusIndicator'
import IdleControls from './components/IdleControls'
import HostView from './components/HostView'
import JoinedView from './components/JoinedView'
import NowPlaying from './components/NowPlaying'
import './App.css'
import {
  getSavedState,
  saveStateSnapshot,
  getStatus,
  startHostSession,
  joinSessionRequest,
  leaveSessionRequest,
  isValidSessionCode
} from './utils/session'
import { getActiveTabUrl, isSpotifyUrl } from './utils/tabs'
import type { SessionState, ConnectionStatus } from '@/types'

export default function App() {
  const [sessionState, setSessionState] = useState<SessionState>('idle')
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [sessionCode, setSessionCode] = useState<string>('')

  const [connectedPeers, setConnectedPeers] = useState<number>(0)
  const [onSpotify, setOnSpotify] = useState<boolean>(false)
  const [songInfo, setSongInfo] = useState<{ title: string; artist: string; position: string; duration: string } | null>(null)

  // Load saved state when popup opens
  useEffect(() => {
    const loadSavedState = async () => {
      try {
        const result = await getSavedState()
        
        if (result.sessionState) {
          setSessionState(result.sessionState)
        }
        if (result.sessionCode) {
          setSessionCode(result.sessionCode)
        }
        if (result.connectionStatus) {
          setConnectionStatus(result.connectionStatus)
        }
        if (result.connectedPeers !== undefined) {
          setConnectedPeers(result.connectedPeers)
        }

        // If we have an active session, verify it's still connected
        if (result.sessionState !== 'idle' && result.sessionCode) {
          try {
            // Request current status from offscreen document
            const statusResponse = await getStatus()
            if (statusResponse?.connected) {
              setConnectionStatus('connected')
            } else {
              // Session is no longer active, reset state
              setSessionState('idle')
              setConnectionStatus('disconnected')
              setSessionCode('')
              setConnectedPeers(0)
              await saveStateSnapshot({ sessionState: 'idle', sessionCode: '', connectionStatus: 'disconnected', connectedPeers: 0 })
            }
          } catch (error) {
            console.log('Could not verify session status:', error)
            // Assume disconnected if we can't verify
            setConnectionStatus('disconnected')
          }
        } else {
          // No active session; ensure we don't stick in a stale 'connecting' state
          if (result.connectionStatus === 'connecting') {
            setConnectionStatus('disconnected')
            await saveStateSnapshot({ connectionStatus: 'disconnected' as ConnectionStatus })
          }
        }
      } catch (error) {
        console.error('Error loading saved state:', error)
      }
    }

    loadSavedState()
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

  // Save state whenever it changes
  useEffect(() => {
  saveStateSnapshot({
      sessionState,
      sessionCode,
      connectionStatus,
      connectedPeers
  }).catch((err: unknown) => console.error('Error saving state:', err))
  }, [sessionState, sessionCode, connectionStatus, connectedPeers])

  const startSession = async () => {
    if (connectionStatus === 'connecting') return
    
    setConnectionStatus('connecting')
    
  try {
    const response = await startHostSession()
    if (response.error) {
      setConnectionStatus('disconnected')
      toast.error(response.error)
    } else if (response.sessionId) {
      setSessionCode(response.sessionId)
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
    if (!code) {
      toast.error('Please enter a session code')
      return
    }
  if (!isValidSessionCode(code)) {
      toast.error('Enter a valid 6-digit code')
      return
    }

    setConnectionStatus('connecting')

    try {
  const response = await joinSessionRequest(code)
      if (response?.success) {
        setSessionState('joined')
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

  const leaveSession = async () => {
    try {
      // Send message to background script which forwards to offscreen document
  await leaveSessionRequest()
    } catch (error) {
      console.error('Error leaving session:', error);
    }
    
    // Clear local state
    setSessionState('idle')
    setConnectionStatus('disconnected')
    setSessionCode('')
  // joinCode handled inside IdleControls, nothing to clear here
    setConnectedPeers(0)
    
    // Clear saved state
  await saveStateSnapshot({ sessionState: 'idle', sessionCode: '', connectionStatus: 'disconnected', connectedPeers: 0 })
    
    toast.success('Left session')
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(sessionCode)
      toast.success('Session code copied!')
    } catch (error) {
      toast.error('Failed to copy code')
    }
  }

  // Listen for connection updates from offscreen document via background script
  useEffect(() => {
    const lastMismatchRef = { key: '', ts: 0 }
    const messageListener = (message: any) => {
      if (message?.type === 'SONG_INFO' && message.payload) {
        setSongInfo(message.payload)
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
      }
    }

    chrome.runtime.onMessage.addListener(messageListener)
    return () => chrome.runtime.onMessage.removeListener(messageListener)
  }, [])

  // StatusIndicator moved to component

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
            onLeave={leaveSession}
          />
        )}

        {sessionState === 'joined' && (
          <JoinedView
            connectedPeers={connectedPeers}
            onLeave={leaveSession}
          />
        )}
      </div>
    </div>
  )
}
