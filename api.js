const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const socketio = require("socket.io");
const mosaic = require("./js/mosaic");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const startTime = Date.now();

// last known value per event type, so a browser that (re)loads the
// terminal UI gets an immediate snapshot instead of waiting for the
// next change
const state = {
  ports: null,
  gps: null,
  ntrip: null,
  stats: null,
  data: null,
};

const emitter = (type, message) => {
  if (type in state) state[type] = message;
  io.sockets.emit(type, message);
};

setTimeout(() => {
  mosaic.connectGPS(emitter);
}, 2000);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

io.on("connection", (socket) => {
  socket.emit("boot", { startTime });
  Object.entries(state).forEach(([type, message]) => {
    if (message) socket.emit(type, message);
  });
  setTimeout(() => {
    socket.emit("driver", { status: "driver connected" });
  }, 3000);
});

const port = 10000;
const host = "0.0.0.0";
server.listen(port, host, () => console.log("... server started on port", port));
