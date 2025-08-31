import { io, Socket } from "socket.io-client"
import { SESSION_EVENTS } from "@/constants";

const URL = import.meta.env.VITE_SERVER_URL

let socket: Socket | null = null;

function initSocket() {
  if (!socket) {
    socket = io(URL, {
      transports: ["websocket"], // force WebSocket only
      reconnection: true,        // auto reconnect
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,   // 1s before retry
    });

    socket.on("connect", () => console.log("[BG] Connected to server:", socket?.id));
    socket.on("disconnect", () => console.log("[BG] Disconnected"));
    socket.on("connect_error", (err) => console.error("[BG] Connection error:", err));
  }
}

chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  switch (msg.type) {
    case SESSION_EVENTS.START: {
      // start session
      initSocket();
      socket?.emit(
        SESSION_EVENTS.START,
        {},
        (ack: { sessionCode: string }) => {
          // ack is the acknowledgment from the server (callback)
          sendResponse({ sessionCode: ack.sessionCode });
        },
      );
      return true; // for async (sendResponse is synchronous)
    }
    case SESSION_EVENTS.JOIN: {
      initSocket();
      // join session
      socket?.emit(
        SESSION_EVENTS.JOIN,
        { sessionCode: msg.sessionCode },
        (ack: { success: boolean }) => {
          sendResponse({ success: ack.success });
        },
      );
      return true;
    }
    case SESSION_EVENTS.LEAVE: {
      // leave session
      socket?.emit(
        SESSION_EVENTS.LEAVE,
        { sessionCode: msg.sessionCode },
        (ack: { success: boolean }) => {
          sendResponse({ success: ack.success });
        },
      );
      return true;
    }
    case SESSION_EVENTS.END: {
      // end session
      socket?.emit(SESSION_EVENTS.END, { sessionCode: msg.sessionCode });
      break;
    }
    default:
      break;
  }
});
