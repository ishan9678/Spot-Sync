import { Peer } from "peerjs";

let peer: Peer | null = null;
let connections: Record<string, any> = {}; // store peer connections

console.log('[Spot Sync] Offscreen document loaded');

// Check WebRTC support
function checkWebRTCSupport(): boolean {
  try {
    // Check for required WebRTC APIs
    const hasRTCPeerConnection = !!(window.RTCPeerConnection || 
                                   (window as any).webkitRTCPeerConnection || 
                                   (window as any).mozRTCPeerConnection);
    
    const hasGetUserMedia = !!(navigator.mediaDevices?.getUserMedia || 
                              (navigator as any).getUserMedia || 
                              (navigator as any).webkitGetUserMedia || 
                              (navigator as any).mozGetUserMedia);

    console.log('[Offscreen] WebRTC Support Check:', {
      RTCPeerConnection: hasRTCPeerConnection,
      getUserMedia: hasGetUserMedia,
      mediaDevices: !!navigator.mediaDevices,
      userAgent: navigator.userAgent
    });

    return hasRTCPeerConnection;
  } catch (error) {
    console.error('[Offscreen] Error checking WebRTC support:', error);
    return false;
  }
}

// Initialize WebRTC polyfills if needed
function initializeWebRTC() {
  if (!window.RTCPeerConnection) {
    if ((window as any).webkitRTCPeerConnection) {
      (window as any).RTCPeerConnection = (window as any).webkitRTCPeerConnection;
    } else if ((window as any).mozRTCPeerConnection) {
      (window as any).RTCPeerConnection = (window as any).mozRTCPeerConnection;
    }
  }

  // Polyfill for older browsers
  if (!navigator.mediaDevices && (navigator as any).getUserMedia) {
    (navigator as any).mediaDevices = {
      getUserMedia: (constraints: any) => {
        const getUserMedia = (navigator as any).getUserMedia || 
                           (navigator as any).webkitGetUserMedia || 
                           (navigator as any).mozGetUserMedia;
        
        return new Promise((resolve, reject) => {
          getUserMedia.call(navigator, constraints, resolve, reject);
        });
      }
    };
  }
}

// Initialize WebRTC
initializeWebRTC();
const webRTCSupported = checkWebRTCSupport();

if (!webRTCSupported) {
  console.error('[Offscreen] WebRTC is not supported in this environment');
}

// Utility function to send message to runtime (background/popup)
const sendToRuntime = (message: any) => {
  chrome.runtime.sendMessage(message).catch(() => {
    // Extension context might be closed, ignore error
  });
};

// Update peer count
const updatePeerCount = () => {
  const count = Object.keys(connections).length;
  sendToRuntime({ type: 'PEER_COUNT_UPDATE', count });
};

// Create PeerJS instance with proper configuration
function createPeer(id?: string) {
  if (!webRTCSupported) {
    throw new Error('WebRTC is not supported in this environment');
  }

  // Use the default PeerJS cloud server (0.peerjs.com)
  // The PeerJS library will automatically use this if no host is specified
  const config = {
    secure: true,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        // Add Cloudflare STUN servers as backup
        { urls: 'stun:stun.cloudflare.com:3478' }
      ]
    },
    debug: 1, // Reduced debug logging
  };

  try {
    if (id) {
      return new Peer(id, config);
    } else {
      return new Peer(config);
    }
  } catch (error) {
    console.error('[Offscreen] Failed to create peer with config:', error);
    throw error;
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  console.log('[Offscreen] Received message:', msg);

  if (msg.type === "START_SESSION") {
    try {
      // Create a new peer as host
      peer = createPeer();
      
      // Set a timeout to handle cases where peer doesn't connect
      const timeout = setTimeout(() => {
        console.error('[Offscreen] Peer connection timeout');
        sendResponse({ error: 'Connection timeout - unable to reach PeerJS server' });
      }, 10000);

      peer.on("open", (id) => {
        clearTimeout(timeout);
        console.log("[Offscreen] Host started session with ID:", id);
        sendResponse({ sessionId: id });
      });

      // Listen for incoming connections (clients joining)
      peer.on("connection", (conn) => {
        console.log("[Offscreen] Client connected:", conn.peer);
        connections[conn.peer] = conn;
        updatePeerCount();

        conn.on("data", (data) => {
          console.log("[Offscreen] Received from client:", data);
          // Optionally broadcast this to others
        });

        conn.on("close", () => {
          console.log("[Offscreen] Client disconnected:", conn.peer);
          delete connections[conn.peer];
          updatePeerCount();
        });

        conn.on("error", (error) => {
          console.error("[Offscreen] Connection error:", error);
          delete connections[conn.peer];
          updatePeerCount();
          sendToRuntime({ type: 'CONNECTION_LOST' });
        });
      });

      peer.on("error", (error) => {
        clearTimeout(timeout);
        console.error("[Offscreen] Peer error:", error);
        let errorMessage = error.message;
        
        // Provide more helpful error messages
        if (errorMessage.includes('server')) {
          errorMessage = 'Unable to connect to PeerJS server. Please check your internet connection.';
        } else if (errorMessage.includes('WebRTC')) {
          errorMessage = 'WebRTC connection failed. Your browser may not support peer-to-peer connections.';
        }
        
        sendToRuntime({ type: 'CONNECTION_LOST' });
        sendResponse({ error: errorMessage });
      });

      peer.on("disconnected", () => {
        console.log("[Offscreen] Peer disconnected");
        sendToRuntime({ type: 'CONNECTION_LOST' });
      });
    } catch (error) {
      console.error("[Offscreen] Failed to create peer:", error);
      sendResponse({ error: (error as Error).message });
    }

    return true; // keep sendResponse async
  }

  if (msg.type === "JOIN_SESSION" && msg.code) {
    try {
      peer = createPeer();
      
      // Set a timeout for connection
      const timeout = setTimeout(() => {
        console.error('[Offscreen] Join session timeout');
        sendResponse({ success: false, error: 'Connection timeout - unable to reach session' });
      }, 10000);
      
      peer.on("open", (id) => {
        console.log("[Offscreen] Client peer open with ID:", id);
        const conn = peer!.connect(msg.code);
        
        conn.on("open", () => {
          clearTimeout(timeout);
          console.log("[Offscreen] Connected to host!");
          connections[msg.code] = conn;
          updatePeerCount();
          sendResponse({ success: true });
        });

        conn.on("data", (data) => {
          console.log("[Offscreen] Received from host:", data);
        });

        conn.on("close", () => {
          console.log("[Offscreen] Disconnected from host");
          delete connections[msg.code];
          updatePeerCount();
          sendToRuntime({ type: 'CONNECTION_LOST' });
        });

        conn.on("error", (error) => {
          clearTimeout(timeout);
          console.error("[Offscreen] Connection error:", error);
          delete connections[msg.code];
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
        } else if (errorMessage.includes('peer unavailable')) {
          errorMessage = 'Session not found. Please check the session code.';
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

  return false;
});
