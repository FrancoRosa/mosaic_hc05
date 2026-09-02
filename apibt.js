const express = require("express");
const cors = require("cors");
const http = require("http");
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

let baseSerial;

const updateBaseSerial = (newSerial) => {
  baseSerial = newSerial;
};

const getBaseSerial = () => {
  return baseSerial;
};

setTimeout(() => {
  mosaic.connectGPS(emitter, updateBaseSerial);
}, 2000);



app.get("/", (req, res) => {
  res.send({ message: "gps server working, waiting for commands" });
});

io.on("connection", (socket) => {
  console.log("... a user connected");
  setTimeout(() => {
    socket.emit("driver", { status: "driver connected" });
  }, 3000);
  socket.on("disconnect", () => {
    console.log("... user disconnected");
  });
});

const emitter = (type, message) => {
  io.sockets.emit(type, message);
};

const port = 10000;
const host = "0.0.0.0";
server.listen(port, host,() => console.log("... listening on", port));
