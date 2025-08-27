import { Peer, PeerOptions } from "peerjs";

let peer: Peer | null = null;
let connections: Record<string, any> = {}; // store peer connections

console.log('[Spot Sync] Offscreen document loaded');

// Utility function to send message to runtime (background/popup)
const sendToRuntime = (message: any) => {
  chrome.runtime.sendMessage(message).catch(() => {
    // Extension context might be closed, ignore error
  });
};

// Generate a simple 6-digit numeric session code
function generateSessionCode(): string {
  // Ensures range 100000 - 999999
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Update peer count
const updatePeerCount = () => {
  const count = Object.keys(connections).length;
  sendToRuntime({ type: 'PEER_COUNT_UPDATE', count });
};

function createPeer(id?: string) {
  const options: PeerOptions = {
    host: "0.peerjs.com",
    port: 443,
    path: "/",
    secure: true, // use wss
    config: {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        {
          urls: [
            "stun:stun.openrelay.metered.ca:80",
            "turn:turn.openrelay.metered.ca:80",
            "turn:turn.openrelay.metered.ca:443",
            "turn:turn.openrelay.metered.ca:443?transport=tcp",
          ],
          username: "openrelayproject",
          credential: "openrelayproject",
        },
      ],
    },
    debug: 2,
  };

  try {
    return id ? new Peer(id, options) : new Peer(options);
  } catch (error) {
    console.error("[Offscreen] Failed to create peer:", error);
    throw error;
  }
}

// --- Sync logic state ---
type SongInfo = {
  title: string
  artist: string
  position: string
  duration: string
  isPlaying?: boolean
  positionMs?: number
  durationMs?: number
}

let role: 'host' | 'client' | null = null;
let lastLocalSong: SongInfo | null = null;
let lastHostBroadcastAt = 0;
let lastClientAutoSyncAt = 0;

const nowMs = () => Date.now();

function projectHostPosition(payload: Required<Pick<SongInfo, 'positionMs' | 'durationMs' | 'isPlaying'>> & { ts: number }) {
  const { positionMs, durationMs, isPlaying, ts } = payload;
  if (!isPlaying) return Math.min(positionMs, durationMs);
  const elapsed = Math.max(0, nowMs() - ts);
  const projected = Math.min(positionMs + elapsed, durationMs);
  return projected;
}

function broadcastToPeers(data: any) {
  Object.values(connections).forEach((conn: any) => {
    try { conn.open && conn.send(data); } catch {}
  });
}

function titlesMatch(a?: string, b?: string) {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
}

function artistsMatch(a?: string, b?: string) {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  console.log('[Offscreen] Received message:', msg);

  if (msg.type === "START_SESSION") {
    try {
      let attempts = 0;
      const maxAttempts = 5;

      const tryStart = () => {
        attempts += 1;
        // Clean up any existing peer before retrying
        if (peer) {
          try { peer.destroy(); } catch {}
          peer = null;
        }

        const code = generateSessionCode();
        const p = createPeer(code);
        peer = p;

        const timeout = setTimeout(() => {
          console.error('[Offscreen] Peer connection timeout');
          try { p.destroy(); } catch {}
          if (attempts < maxAttempts) {
            tryStart();
          } else {
            sendResponse({ error: 'Connection timeout - unable to reach PeerJS server' });
          }
        }, 10000);

        p.on('open', (id) => {
          clearTimeout(timeout);
          console.log('[Offscreen] Host started session with ID:', id);
          role = 'host';
          // Attach common listeners for incoming connections
          p.on('connection', (conn) => {
            console.log('[Offscreen] Client connected:', conn.peer);
            connections[conn.peer] = conn;
            updatePeerCount();

            conn.on('data', (data) => {
              console.log('[Offscreen] Received from client:', data);
            });

            conn.on('close', () => {
              console.log('[Offscreen] Client disconnected:', conn.peer);
              delete connections[conn.peer];
              updatePeerCount();
            });

            conn.on('error', (error) => {
              console.error('[Offscreen] Connection error:', error);
              delete connections[conn.peer];
              updatePeerCount();
              sendToRuntime({ type: 'CONNECTION_LOST' });
            });
          });

          p.on('disconnected', () => {
            console.log('[Offscreen] Peer disconnected');
            sendToRuntime({ type: 'CONNECTION_LOST' });
          });

          sendResponse({ sessionId: id });
        });

        p.on('error', (error: any) => {
          clearTimeout(timeout);
          console.error('[Offscreen] Peer error:', error);
          const msg = String(error?.message || 'Unknown error');
          // Retry on unavailable/taken id
          if (/unavailable|taken/i.test(msg) && attempts < maxAttempts) {
            try { p.destroy(); } catch {}
            tryStart();
            return;
          }
          let errorMessage = msg;
          if (errorMessage.includes('server')) {
            errorMessage = 'Unable to connect to PeerJS server. Please check your internet connection.';
          } else if (errorMessage.includes('WebRTC')) {
            errorMessage = 'WebRTC connection failed. Your browser may not support peer-to-peer connections.';
          }
          sendToRuntime({ type: 'CONNECTION_LOST' });
          sendResponse({ error: errorMessage });
        });
      };

      tryStart();
    } catch (error) {
      console.error('[Offscreen] Failed to create peer:', error);
      sendResponse({ error: (error as Error).message });
    }

    return true; // keep sendResponse async
  }

  if (msg.type === "JOIN_SESSION" && msg.code) {
    try {
      const code: string = String(msg.code || '').trim();
      // Validate 6-digit numeric code
      if (!/^\d{6}$/.test(code)) {
        sendResponse({ success: false, error: 'Invalid session code. Enter 6 digits.' });
        return true;
      }
      peer = createPeer();
      
      // Set a timeout for connection
      const timeout = setTimeout(() => {
        console.error('[Offscreen] Join session timeout');
        sendResponse({ success: false, error: 'Connection timeout - unable to reach session' });
      }, 10000);
      
      peer.on("open", (id) => {
        console.log("[Offscreen] Client peer open with ID:", id);
        role = 'client';
        const conn = peer!.connect(code);
        
        conn.on("open", () => {
          clearTimeout(timeout);
          console.log("[Offscreen] Connected to host!");
          connections[code] = conn;
          updatePeerCount();
          sendResponse({ success: true });
        });

        conn.on("data", (data) => {
          const d: any = data as any;
          console.log("[Offscreen] Received from host:", d);
          // Handle sync payloads from host
          if (d?.type === 'SYNC_STATE' && d?.payload) {
            const p = d.payload as Required<SongInfo> & { ts: number };
            const hostProjMs = projectHostPosition({
              positionMs: p.positionMs ?? 0,
              durationMs: p.durationMs ?? 0,
              isPlaying: Boolean(p.isPlaying),
              ts: p.ts,
            });

            // If we don't have local info yet, notify mismatch and wait for next tick
            if (!lastLocalSong) {
              sendToRuntime({ type: 'SYNC_MISMATCH', hostSong: { title: p.title, artist: p.artist } });
              return;
            }

            const sameTrack = titlesMatch(lastLocalSong.title, p.title) && artistsMatch(lastLocalSong.artist, p.artist);
            if (!sameTrack) {
              // Notify user about different track
              sendToRuntime({ type: 'SYNC_MISMATCH', hostSong: { title: p.title, artist: p.artist } });
              return;
            }

            // Attempt gentle auto-resync on clients for drift > 2s or play/pause mismatch
            const localPos = lastLocalSong.positionMs ?? 0;
            const localDur = lastLocalSong.durationMs ?? 0;
            const localPlay = Boolean(lastLocalSong.isPlaying);
            const drift = Math.abs((hostProjMs || 0) - (localPos || 0));
            const playMismatch = localPlay !== Boolean(p.isPlaying);

            const throttle = 1200; // ms between auto-sync operations
            const now = nowMs();
            if ((drift > 2000 || playMismatch) && now - lastClientAutoSyncAt > throttle) {
              lastClientAutoSyncAt = now;
              // Seek to host's position and align play/pause
              sendToRuntime({ type: 'SEEK', ms: Math.min(hostProjMs, localDur), meta: { autoSync: true } });
              if (p.isPlaying && !localPlay) {
                sendToRuntime({ type: 'PLAY', meta: { autoSync: true } });
              } else if (!p.isPlaying && localPlay) {
                sendToRuntime({ type: 'PAUSE', meta: { autoSync: true } });
              }
            }
          }
        });

        conn.on("close", () => {
          console.log("[Offscreen] Disconnected from host");
          delete connections[code];
          updatePeerCount();
          sendToRuntime({ type: 'CONNECTION_LOST' });
        });

        conn.on("error", (error) => {
          clearTimeout(timeout);
          console.error("[Offscreen] Connection error:", error);
          delete connections[code];
          updatePeerCount();
          sendToRuntime({ type: 'CONNECTION_LOST' });
        });
      });

      peer.on("error", (error) => {
        clearTimeout(timeout);
        console.error("[Offscreen] Peer error:", error);
        let errorMessage = error.message;
        
        if (errorMessage.includes('server')) {
          errorMessage = 'Unable to connect to PeerJS server. Please check your internet connection.';
        } else if (errorMessage.includes('peer unavailable') || /could not connect to peer/i.test(errorMessage)) {
          errorMessage = 'Session not found or expired. Please check the session code.';
        }
        
        sendResponse({ success: false, error: errorMessage });
      });
    } catch (error) {
      console.error("[Offscreen] Failed to create client peer:", error);
      sendResponse({ success: false, error: (error as Error).message });
    }

    return true;
  }

  if (msg.type === "LEAVE_SESSION") {
    // Close all connections
    Object.values(connections).forEach((conn: any) => {
      conn.close();
    });
    connections = {};
    
    // Close peer
    if (peer) {
      peer.destroy();
      peer = null;
    }
  role = null;
  lastLocalSong = null;
    
    updatePeerCount();
    sendResponse({ success: true });
  }

  if (msg.type === "GET_STATUS") {
    // Return current session status
    const isConnected = peer && !peer.disconnected && !peer.destroyed;
    const connectionCount = Object.keys(connections).length;
    
    sendResponse({
      connected: isConnected,
      peerCount: connectionCount,
      peerId: peer?.id || null
    });
  }

  // Capture song telemetry from content script and propagate if hosting
  if (msg.type === 'SONG_INFO' && msg.payload) {
    lastLocalSong = msg.payload as SongInfo;
    if (role === 'host' && lastLocalSong?.title) {
      const now = nowMs();
      // throttle to ~1 Hz
      if (now - lastHostBroadcastAt > 700) {
        lastHostBroadcastAt = now;
        const payload = {
          ...lastLocalSong,
          isPlaying: Boolean(lastLocalSong.isPlaying),
          positionMs: lastLocalSong.positionMs ?? 0,
          durationMs: lastLocalSong.durationMs ?? 0,
          ts: now,
        };
        broadcastToPeers({ type: 'SYNC_STATE', payload });
      }
    }
  }

  return false;
});
