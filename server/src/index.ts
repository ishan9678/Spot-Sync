import express from "express"
import http from "http"
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);
const io = new Server(server);


app.get("/", (_req, res) => {
  res.send("works fine");
});

io.on('connection', (socket) => {
  console.log('a user connected');
});


server.listen(process.env.PORT || 3000, () => {
  console.log(`server running at port ${process.env.PORT || 3000}`);
});