import express from "express"
import http from "http"
import { Server } from 'socket.io';
import { SESSION_EVENTS } from "./constants";

const app = express();
const server = http.createServer(app);
const io = new Server(server);


app.get("/", (_req, res) => {
  res.send("works fine");
});

 // sessionCode -> hostSocketId
const sessions: Record<string, string> = {};

io.on('connection', (socket) => {
  console.log('a user connected');

  socket.on(SESSION_EVENTS.START, (_, callback) => {
    // generates a 6 digit code
    const sessionCode = Math.floor(100000 + Math.random() * 900000).toString();
    sessions[sessionCode] = socket.id;

    // join room
    socket.join(sessionCode);

    callback({ success: true, sessionCode });
  });

  socket.on(SESSION_EVENTS.JOIN, ({ sessionCode }, callback) => {
    const hostSocketId = sessions[sessionCode];
    if (!hostSocketId) {
        callback({ success: false, error: 'Invalid code' });
        return;
    }

    // client joins room
    socket.join(sessionCode);

    // notify host
    io.to(hostSocketId).emit(SESSION_EVENTS.CLIENT_JOINED, { message: 
        "Someone joined the listening session" 
    });

    callback({ success: true });
  });

  socket.on(SESSION_EVENTS.UPDATE, ({ sessionCode, data }, callback) => {
    const hostSocketId = sessions[sessionCode];
    if (!hostSocketId) {
      callback({ success: false, error: 'Invalid code' });
      return;
    }

    // update every user in room
    io.to(sessionCode).emit(SESSION_EVENTS.UPDATE, { data });

    callback({ success: true });
  });

  socket.on(SESSION_EVENTS.LEAVE, ({ sessionCode }) => {
    const hostSocketId = sessions[sessionCode];
    if (!hostSocketId) {
      return;
    }

    // notify host
    io.to(hostSocketId).emit(SESSION_EVENTS.LEAVE, { message: "User left" });
  });

  socket.on(SESSION_EVENTS.END, ({ sessionCode }) => {
    const hostSocketId = sessions[sessionCode];
    if (!hostSocketId) {
      return;
    }

    // notify room
    io.to(sessionCode).emit(SESSION_EVENTS.END, { message: "Session ended by host" });
  });

});


server.listen(process.env.PORT || 3000, () => {
  console.log(`server running at port ${process.env.PORT || 3000}`);
});