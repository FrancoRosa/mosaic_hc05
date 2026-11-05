// Same service as api.js / apian.js, but the UI link is a plain RFC 6455
// WebSocket written on top of node's http server (no socket.io, no express)
// and the frequent messages are binary — see js/wire.js for the format.
//
//   node apiws.js          # Mosaic-H over HC-05
//   node apiws.js antarx   # AntaRx-Si3 over USB
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const registers = require("./js/constants");
const { createEncoder } = require("./js/wire");

// both receiver modules open their ntrip link on require, so only load one
const receiver =
  process.argv[2] === "antarx" ? require("./js/antarx") : require("./js/mosaic");

const meta = {
  fix: registers.msc_rel.mode.values[0].map,
  extErrorBits: registers.msc_status.extErrorBits,
  rxStateBits: registers.msc_status.rxStateBits,
  rxErrorBits: registers.msc_status.rxErrorBits,
  frontends: registers.msc_status.frontends,
  antennas: registers.msc_status.antennas,
};
const encode = createEncoder(meta);

const startTime = Date.now();

// --- websocket framing -----------------------------------------------------

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const OP_TEXT = 0x1;
const OP_BINARY = 0x2;
const OP_CLOSE = 0x8;
const OP_PING = 0x9;
const OP_PONG = 0xa;

// header and payload go out in one buffer so each message is a single
// write (and, with Nagle off, a single TCP segment)
const frame = (opcode, payload) => {
  const len = payload.length;
  const head = len < 126 ? 2 : len < 65536 ? 4 : 10;
  const buf = Buffer.allocUnsafe(head + len);
  buf[0] = 0x80 | opcode;
  if (len < 126) {
    buf[1] = len;
  } else if (len < 65536) {
    buf[1] = 126;
    buf.writeUInt16BE(len, 2);
  } else {
    buf[1] = 127;
    buf.writeBigUInt64BE(BigInt(len), 2);
  }
  payload.copy ? payload.copy(buf, head) : buf.set(payload, head);
  return buf;
};

const toFrame = (encoded) =>
  typeof encoded === "string"
    ? frame(OP_TEXT, Buffer.from(encoded))
    : frame(OP_BINARY, encoded);

const clients = new Set();

// a client that can't keep up gets stale data frames dropped instead of
// queued, so it always sees the latest fix rather than a growing backlog
const MAX_QUEUED = 16 * 1024;
// past this it is considered dead and disconnected
const MAX_BACKLOG = 1024 * 1024;

const send = (socket, buf, droppable = false) => {
  if (socket.destroyed) return;
  if (socket.writableLength > MAX_BACKLOG) return socket.destroy();
  if (droppable && socket.writableLength > MAX_QUEUED) return;
  socket.write(buf);
};

// client -> server traffic is only control frames (close/ping/pong), so
// anything big is a misbehaving client
const MAX_INCOMING = 64 * 1024;

const handleIncoming = (client, chunk) => {
  client.rx = client.rx.length ? Buffer.concat([client.rx, chunk]) : chunk;
  while (client.rx.length >= 2) {
    const buf = client.rx;
    const opcode = buf[0] & 0x0f;
    const masked = buf[1] & 0x80;
    let len = buf[1] & 0x7f;
    let off = 2;
    if (len === 126) {
      if (buf.length < 4) return;
      len = buf.readUInt16BE(2);
      off = 4;
    } else if (len === 127) {
      if (buf.length < 10) return;
      len = Number(buf.readBigUInt64BE(2));
      off = 10;
    }
    if (len > MAX_INCOMING) return client.socket.destroy();
    const maskOff = off;
    if (masked) off += 4;
    if (buf.length < off + len) return;

    const payload = Buffer.from(buf.subarray(off, off + len));
    if (masked) {
      for (let i = 0; i < len; i++) payload[i] ^= buf[maskOff + (i & 3)];
    }
    client.rx = buf.subarray(off + len);

    if (opcode === OP_CLOSE) {
      send(client.socket, frame(OP_CLOSE, payload.subarray(0, 2)));
      client.socket.end();
      return;
    }
    if (opcode === OP_PING) send(client.socket, frame(OP_PONG, payload));
    if (opcode === OP_PONG) client.alive = true;
  }
};

// --- state / broadcast -----------------------------------------------------

// last encoded frame per event type, so a browser that (re)loads the
// terminal UI gets an immediate snapshot instead of waiting for the
// next change
const state = new Map();
const cached = new Set(["ports", "gps", "ntrip", "stats", "data", "status"]);

// encoded once per event, then the same buffer is written to every client
const emitter = (type, message) => {
  const buf = toFrame(encode(type, message));
  if (cached.has(type)) state.set(type, buf);
  const droppable = type === "data";
  clients.forEach((c) => send(c.socket, buf, droppable));
};

setTimeout(() => {
  receiver.connectGPS(emitter);
}, 2000);

// --- http ------------------------------------------------------------------

const files = {
  "/": ["indexws.html", "text/html; charset=utf-8"],
  "/js/wire.js": ["js/wire.js", "text/javascript; charset=utf-8"],
};

const server = http.createServer((req, res) => {
  const file = files[req.url.split("?")[0]];
  if (!file) {
    res.writeHead(404).end();
    return;
  }
  fs.readFile(path.join(__dirname, file[0]), (err, body) => {
    if (err) {
      res.writeHead(500).end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": file[1],
      "Access-Control-Allow-Origin": "*",
    });
    res.end(body);
  });
});

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if ((req.headers.upgrade || "").toLowerCase() !== "websocket" || !key) {
    socket.destroy();
    return;
  }
  const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  socket.setNoDelay(true);

  const client = { socket, rx: Buffer.alloc(0), alive: true };
  clients.add(client);
  socket.on("data", (chunk) => handleIncoming(client, chunk));
  socket.on("close", () => clients.delete(client));
  socket.on("error", () => socket.destroy());

  send(socket, toFrame(encode("meta", meta)));
  send(socket, toFrame(encode("boot", { startTime })));
  state.forEach((buf) => send(socket, buf));
  setTimeout(() => {
    send(socket, toFrame(encode("driver", { status: "driver connected" })));
  }, 3000);
});

// browsers answer pings on their own; a client that misses one is gone
const PING = frame(OP_PING, Buffer.alloc(0));
setInterval(() => {
  clients.forEach((c) => {
    if (!c.alive) return c.socket.destroy();
    c.alive = false;
    send(c.socket, PING);
  });
}, 10000);

const port = 10000;
const host = "0.0.0.0";
server.listen(port, host, () => console.log("... server started on port", port));
