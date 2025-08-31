import { io, Socket } from "socket.io-client"
import { SESSION_EVENTS } from "@/constants";

const URL = import.meta.env.VITE_SERVER_URL

let socket: Socket | null = null;

function initSocket() {
  if (!socket) {
    socket = io(URL);
    socket.on("connect", () => console.log("[BG] Connected to server:", socket?.id));
    socket.on("disconnect", () => console.log("[BG] Disconnected"));
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // start session
    if (msg.type === SESSION_EVENTS.START) {
    initSocket();

    socket?.emit(SESSION_EVENTS.START, {}, (ack: { sessionCode: string }) => {
        // ack is the acknowledgment from the server (callback)
        sendResponse({ sessionCode: ack.sessionCode });
    });

    return true; // for async (sendResponse is synchronous)

  } else if (msg.type === SESSION_EVENTS.JOIN) {
    // join session
    socket?.emit(SESSION_EVENTS.JOIN, { sessionCode: msg.sessionCode }, (ack: { success: boolean }) => {
        sendResponse({ success: ack.success });
    });

    return true;

  } else if (msg.type === SESSION_EVENTS.LEAVE) {
    // Handle leaving a session
  }
});
