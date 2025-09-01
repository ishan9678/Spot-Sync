import { io, Socket } from "socket.io-client"
import { SESSION_EVENTS } from "@/constants"
import type { SessionState, ConnectionStatus } from "@/types"

const URL = import.meta.env.VITE_SERVER_URL

let socket: Socket | null = null
let currentSessionCode: string = ''
let sessionState: SessionState = 'idle'
let connectionStatus: ConnectionStatus = 'disconnected'
let connectedPeers: number = 0
let displayName: string = ''
let hostName: string = ''
let lastJoinedName: string = ''
let intentionalDisconnect: boolean = false

// -------------------- Helpers -------------------- //

// Initialize background state from storage
async function initializeState() {
  try {
    const result = await chrome.storage.local.get([
      'sessionState',
      'sessionCode',
      'connectionStatus',
      'connectedPeers',
      'displayName',
      'hostName',
      'lastJoinedName'
    ])

    sessionState = result.sessionState || 'idle'
    currentSessionCode = result.sessionCode || ''
    connectionStatus = result.connectionStatus || 'disconnected'
    connectedPeers = result.connectedPeers || 0
  displayName = result.displayName || ''
  hostName = result.hostName || ''
  lastJoinedName = result.lastJoinedName || ''

    // If we had an active session, try to reconnect
    if (sessionState !== 'idle' && currentSessionCode) {
      initSocket()
    }
  } catch (error) {
    console.error('[BG] Failed to initialize state:', error)
  }
}

// Save state to storage
async function saveState() {
  try {
    await chrome.storage.local.set({
      sessionState,
      sessionCode: currentSessionCode,
      connectionStatus,
      connectedPeers,
      displayName,
      hostName,
      lastJoinedName
    })
  } catch (error) {
    console.error('[BG] Failed to save state:', error)
  }
}

function notifyPopup(type: string, payload?: any) {
  chrome.runtime.sendMessage({ type, ...payload }).catch(() => {
    // Popup may not be open
  })
}

function setConnectionStatus(status: ConnectionStatus) {
  connectionStatus = status
  saveState()
}

function resetSessionState() {
  currentSessionCode = ''
  sessionState = 'idle'
  connectedPeers = 0
  saveState()
}

function ensureSocketConnecting() {
  initSocket()
  setConnectionStatus('connecting')
}

// -------------------- Socket Handling -------------------- //

function initSocket() {
  if (socket) return

  socket = io(URL, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  })

  socket.on("connect", () => {
    console.log("[BG] Connected:", socket?.id)
    const wasDisconnected = connectionStatus === 'disconnected'
    setConnectionStatus('connected')
    
    // Only notify about restoration if we were previously connected and active
    if (wasDisconnected && sessionState !== 'idle') {
      notifyPopup('CONNECTION_RESTORED')
    }
  })

  socket.on("disconnect", (reason) => {
    console.log("[BG] Disconnected:", reason)
    setConnectionStatus('disconnected')
    
    // Don't show "connection lost" if this was an intentional disconnect
    if (!intentionalDisconnect) {
      // This is an unexpected disconnect (server issues, network problems, etc.)
      if (sessionState !== 'idle') {
        notifyPopup('CONNECTION_LOST')
      }
    }
    
    // Reset the flag after handling
    intentionalDisconnect = false
  })

  socket.on("connect_error", (err) => {
    console.error("[BG] Connection error:", err)
    setConnectionStatus('disconnected')
  })

  socket.on("peer_count", (count: number) => {
    connectedPeers = count
    saveState()
    notifyPopup('PEER_COUNT_UPDATE', { count })
  })

  socket.on(SESSION_EVENTS.CLIENT_JOINED, (data) => {
    console.log('[BG] Client joined:', data)
    if (data?.name) {
      lastJoinedName = data.name
      saveState()
    }
    notifyPopup('CLIENT_JOINED', data)
  })

  socket.on(SESSION_EVENTS.END, (data) => {
    console.log('[BG] Session ended:', data.message)
    // Reset state when session ends
    resetSessionState()
    notifyPopup('SESSION_ENDED', data)
  })

  socket.on(SESSION_EVENTS.UPDATE, (data) => {
        notifyPopup('SONG_INFO_UPDATED', { payload: data.data })
        
        // Forward host song to content script for sync checking (only if joined)
        if (sessionState === 'joined') {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
              chrome.tabs.sendMessage(tabs[0].id, {
                type: 'HOST_SONG_UPDATE',
                song: data.data
              }).catch(() => {
                // Content script may not be ready or on wrong page
              })
            }
          })
        }
  })

  // When host, receive CONTROL and forward to content script for execution
  socket.on(SESSION_EVENTS.CONTROL, ({ command, payload }) => {
    if (sessionState !== 'hosting') return
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        const tabId = tabs[0].id
        switch (command) {
          case 'PLAY':
          case 'PAUSE':
          case 'TOGGLE':
            chrome.tabs.sendMessage(tabId, { type: command }).catch(() => {})
            break
          case 'SEEK':
            chrome.tabs.sendMessage(tabId, { type: 'SEEK', ms: payload?.ms }).catch(() => {})
            break
        }
      }
    })
  })
}

function cleanupSocket() {
  if (socket) {
    intentionalDisconnect = true
    socket.disconnect()
    socket = null
  }
  setConnectionStatus('disconnected')
}

// -------------------- Runtime Message Handling -------------------- //

chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  switch (msg.type) {
    case SESSION_EVENTS.STATUS: {
      sendResponse({
        connected: socket?.connected || false,
        peerCount: connectedPeers,
        peerId: socket?.id || null,
        sessionCode: currentSessionCode,
  sessionState,
  lastJoinedName
      })
      return false
    }

    case SESSION_EVENTS.START: {
      ensureSocketConnecting()

      // load name from storage if not present
      if (!displayName) {
        // best-effort sync retrieval
        chrome.storage.local.get(['displayName']).then((res) => {
          displayName = res.displayName || ''
          saveState()
        })
      }

      socket?.emit(SESSION_EVENTS.START, { name: displayName }, (ack: { sessionCode?: string; error?: string }) => {
        if (ack.error) {
          setConnectionStatus('disconnected')
          sendResponse({ error: ack.error })
        } else if (ack.sessionCode) {
          currentSessionCode = ack.sessionCode
          sessionState = 'hosting'
          setConnectionStatus('connected')
          sendResponse({ sessionCode: ack.sessionCode })
        }
      })
      return true
    }

    case SESSION_EVENTS.JOIN: {
      ensureSocketConnecting()

      // load name from storage if not present
      if (!displayName) {
        chrome.storage.local.get(['displayName']).then((res) => {
          displayName = res.displayName || ''
          saveState()
        })
      }

      socket?.emit(
        SESSION_EVENTS.JOIN,
        { sessionCode: msg.sessionCode, name: displayName },
    (ack: { success?: boolean; error?: string; hostName?: string }) => {
          if (ack.success) {
            currentSessionCode = msg.sessionCode
            sessionState = 'joined'
            hostName = ack.hostName || ''
            setConnectionStatus('connected')
      sendResponse({ success: true, hostName })
          } else {
            setConnectionStatus('disconnected')
            sendResponse({ error: ack.error || 'Failed to join session' })
          }
        }
      )
      return true
    }

    case SESSION_EVENTS.LEAVE: {
      if (!socket || !socket.connected) {
        // Socket not connected, just clean up locally
        resetSessionState()
        cleanupSocket()
        sendResponse({ success: true })
        return true
      }

      socket.emit(
        SESSION_EVENTS.LEAVE,
        { sessionCode: currentSessionCode },
        (ack: { success?: boolean }) => {
          sendResponse({ success: ack.success || true })
          // Clean up after sending response
          resetSessionState()
          cleanupSocket()
        }
      )
      return true
    }

    case SESSION_EVENTS.END: {
      socket?.emit(SESSION_EVENTS.END, { sessionCode: currentSessionCode })
      resetSessionState()
      cleanupSocket()
      break
    }

    // Save display name from popup
    case 'SET_NAME': {
      displayName = (msg.name || '').toString().trim()
      saveState()
      sendResponse?.({ success: true })
      return true
    }

    case 'SONG_INFO': {      
      // Only forward song info to popup if we're hosting
      // Joined clients should only see host's song info from server
      if (sessionState === "hosting") {
        socket?.emit(SESSION_EVENTS.UPDATE, { 
          sessionCode: currentSessionCode,
          data: msg.song
        })
        notifyPopup('SONG_INFO', { payload: msg.song })
      }
      break
    }

    case 'SYNC_MISMATCH': {
      console.log("[BG] Forwarding sync mismatch from content script")
      notifyPopup('SYNC_MISMATCH', { hostSong: msg.hostSong, currentSong: msg.currentSong })
      break
    }

    // Client control: when joined, send control to host via server; when hosting, execute locally
    case 'CONTROL': {
      const { command, payload } = msg
      if (sessionState === 'joined') {
  socket?.emit(SESSION_EVENTS.CONTROL, { sessionCode: currentSessionCode, command, payload }, () => {})
      } else if (sessionState === 'hosting') {
        // Execute locally (route to content script)
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            const tabId = tabs[0].id
            switch (command) {
              case 'PLAY':
              case 'PAUSE':
              case 'TOGGLE':
                chrome.tabs.sendMessage(tabId, { type: command }).catch(() => {})
                break
              case 'SEEK':
                chrome.tabs.sendMessage(tabId, { type: 'SEEK', ms: payload?.ms }).catch(() => {})
                break
            }
          }
        })
      }
      break
    }

    default:
      break
  }
})

// Initialize state on load
initializeState()