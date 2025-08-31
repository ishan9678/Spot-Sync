import express from "express"
import http from "http"
import { Server } from "socket.io"
import { SESSION_EVENTS } from "./constants"
import cors from "cors"

const app = express()
app.use(cors())

const server = http.createServer(app)
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
})

app.get("/", (_req, res) => res.send("works fine"))

// --- State ---
const sessions: Record<string, string> = {} // sessionCode -> hostSocketId

// --- Helpers ---
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

function getHost(sessionCode: string) {
  return sessions[sessionCode] || null
}

function updateRoomSize(sessionCode: string) {
  const sockets = io.sockets.adapter.rooms.get(sessionCode)
  const size = sockets?.size ?? 0
  io.to(sessionCode).emit("peer_count", size)
  console.log(`Room ${sessionCode} now has ${size} peers`)
}

function endSession(sessionCode: string, reason: string) {
  io.to(sessionCode).emit(SESSION_EVENTS.END, { message: reason })
  delete sessions[sessionCode]
  console.log(`Session ${sessionCode} ended: ${reason}`)
}

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`)

  // --- START session ---
  socket.on(SESSION_EVENTS.START, (_, callback) => {
    const sessionCode = generateCode()
    sessions[sessionCode] = socket.id
    socket.join(sessionCode)
    updateRoomSize(sessionCode)
    console.log(`Host ${socket.id} started ${sessionCode}`)
    callback({ success: true, sessionCode })
  })

  // --- JOIN session ---
  socket.on(SESSION_EVENTS.JOIN, ({ sessionCode }, callback) => {
    const hostId = getHost(sessionCode)
    if (!hostId) return callback({ success: false, error: "Invalid code" })

    socket.join(sessionCode)
    updateRoomSize(sessionCode)

    io.to(hostId).emit(SESSION_EVENTS.CLIENT_JOINED, { clientId: socket.id })
    console.log(`Client ${socket.id} joined ${sessionCode}`)
    callback({ success: true })
  })

  // --- UPDATE ---
  socket.on(SESSION_EVENTS.UPDATE, ({ sessionCode, data }, callback) => {
    if (!getHost(sessionCode)) return callback({ success: false, error: "Invalid code" })
    io.to(sessionCode).emit(SESSION_EVENTS.UPDATE, { data })
    callback({ success: true })
  })

  // --- LEAVE ---
  socket.on(SESSION_EVENTS.LEAVE, ({ sessionCode }) => {
    socket.leave(sessionCode)
    updateRoomSize(sessionCode)
    io.to(getHost(sessionCode)!).emit(SESSION_EVENTS.LEAVE, { clientId: socket.id })
    console.log(`Client ${socket.id} left ${sessionCode}`)
  })

  // --- END (host only) ---
  socket.on(SESSION_EVENTS.END, ({ sessionCode }) => {
    if (socket.id === getHost(sessionCode)) {
      endSession(sessionCode, "Host ended session")
    }
  })

  // --- Disconnect ---
  // This is for when the host disconnects unintentionally (ie not by clicking end session)
  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`)
    for (const [code, hostId] of Object.entries(sessions)) {
      if (hostId === socket.id) {
        endSession(code, "Host disconnected")
      } else {
        // peer left, update room size after cleanup
        setTimeout(() => updateRoomSize(code), 100)
      }
    }
  })
})

server.listen(process.env.PORT || 3000, () => {
  console.log(`server running at port ${process.env.PORT || 3000}`)
})
