import { useState, useEffect } from 'react'
import { Toaster, toast } from 'react-hot-toast'
import { Music } from 'lucide-react'
import StatusIndicator from './components/StatusIndicator'
import IdleControls from './components/IdleControls'
import HostView from './components/HostView'
import JoinedView from './components/JoinedView'
import './App.css'

type SessionState = 'idle' | 'hosting' | 'joined'
type ConnectionStatus = 'connected' | 'disconnected' | 'connecting'

export default function App() {
  const [sessionState, setSessionState] = useState<SessionState>('idle')
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [sessionCode, setSessionCode] = useState<string>('')
  // joinCode moved into IdleControls component state
  const [connectedPeers, setConnectedPeers] = useState<number>(0)

  // Load saved state when popup opens
  useEffect(() => {
    const loadSavedState = async () => {
      try {
        const result = await chrome.storage.local.get([
          'sessionState',
          'sessionCode', 
          'connectionStatus',
          'connectedPeers'
        ])
        
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
            const statusResponse = await chrome.runtime.sendMessage({ type: 'GET_STATUS' })
            if (statusResponse?.connected) {
              setConnectionStatus('connected')
            } else {
              // Session is no longer active, reset state
              setSessionState('idle')
              setConnectionStatus('disconnected')
              setSessionCode('')
              setConnectedPeers(0)
              await chrome.storage.local.clear()
            }
          } catch (error) {
            console.log('Could not verify session status:', error)
            // Assume disconnected if we can't verify
            setConnectionStatus('disconnected')
          }
        }
      } catch (error) {
        console.error('Error loading saved state:', error)
      }
    }

    loadSavedState()
  }, [])

  // Save state whenever it changes
  useEffect(() => {
    const saveState = async () => {
      try {
        await chrome.storage.local.set({
          sessionState,
          sessionCode,
          connectionStatus,
          connectedPeers
        })
      } catch (error) {
        console.error('Error saving state:', error)
      }
    }

    saveState()
  }, [sessionState, sessionCode, connectionStatus, connectedPeers])

  const startSession = async () => {
    if (connectionStatus === 'connecting') return
    
    setConnectionStatus('connecting')
    
    try {
      // Send message to background script which forwards to offscreen document
      const response = await chrome.runtime.sendMessage({ type: 'START_SESSION' })
      
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
    if (!/^\d{6}$/.test(code)) {
      toast.error('Enter a valid 6-digit code')
      return
    }

    setConnectionStatus('connecting')

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'JOIN_SESSION',
        code
      })
      if (response?.success) {
        setSessionState('joined')
        setConnectionStatus('connected')
        toast.success('Joined session successfully!')
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
      await chrome.runtime.sendMessage({ type: 'LEAVE_SESSION' });
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
    try {
      await chrome.storage.local.clear()
    } catch (error) {
      console.error('Error clearing saved state:', error)
    }
    
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
    const messageListener = (message: any) => {
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
  <StatusIndicator connectionStatus={connectionStatus} />
      </div>

      <div className="main-content">
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
