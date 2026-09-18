const { SerialPort } = require("serialport");
const { DelimiterParser } = require("@serialport/parser-delimiter");
const { decode } = require("./mosaic_decoder");

const { io } = require("socket.io-client");
const settings = require("../settings.json");
const socket = io(settings.ntrip, { rejectUnauthorized: false });

const baudRate = 115200;
let paths = [];

let index1 = 0;
let port1;

// set once connectGPS() runs and api.js hands us its broadcaster; until
// then status/stat updates are just dropped since there is no UI listening
let broadcasterRef = null;
const emit = (type, message) => {
  if (broadcasterRef) broadcasterRef(type, message);
};

const ntripStatus = (status, extra) => {
  emit("ntrip", { status, url: settings.ntrip, ...extra });
};

socket.on("connect", () => {
  console.log("... connected to ntrip socket.io");
  ntripStatus("connected");
});

socket.on("disconnect", (reason) => {
  ntripStatus("disconnected", { reason });
});

socket.on("connect_error", (err) => {
  ntripStatus("error", { message: err.message });
});

socket.io.on("reconnect_attempt", (attempt) => {
  ntripStatus("connecting", { attempt });
});

socket.io.on("reconnect_failed", () => {
  ntripStatus("error", { message: "reconnect failed" });
});

// byte counters for the kbps readouts, reset every second by the stats timer
let ntripBytes = 0;
let serialBytes = 0;

socket.on("rtcm", (data) => {
  if (data) {
    ntripBytes += data.length;
    if (port1) port1.write(data);
  }
});

setInterval(() => {
  emit("stats", {
    ntripKbps: (ntripBytes * 8) / 1000,
    serialKbps: (serialBytes * 8) / 1000,
  });
  ntripBytes = 0;
  serialBytes = 0;
}, 1000);

const getMosaicPorts = async (broadcaster) => {
  let ports = await SerialPort.list();
  broadcaster("ports", {
    ports: [
      ...ports.filter((port) => port.manufacturer !== undefined),
      ...ports.filter((port) => port.path.includes("rfcomm")),
    ],
  });
  ports = [
    ...ports.filter((port) => port.manufacturer?.includes("Septentrio")),
    ...ports.filter((port) => port.path.includes("rfcomm")),
  ];
  return ports.map((p) => p.path);
};

const changePath = async (broadcaster, device) => {
  index1++;
  index1 = index1 < paths.length ? index1 : 0;
  reconnectGPS(broadcaster, device);
};

const connectGPS = async (broadcaster) => {
  broadcasterRef = broadcaster;
  ntripStatus(socket.connected ? "connected" : "connecting");

  const flags = { pvt: 0, rel: 0 };
  const device = 1;

  const handleData = (e, device) => {
    decode(e, flags, device, broadcaster);
  };

  const handleError = (e, device, path) => {
    broadcaster("gps", { device, status: "error", path });
    if (flags.pvt && flags.rel) {
      // already confirmed a valid SBF stream on this port — retry it
      // instead of wandering off to search other ports
      reconnectGPS(broadcaster, device);
    } else {
      changePath(broadcaster, device);
    }
  };

  const handleOpen = (path, device) => {
    console.log(`... connected to serial port:`, path);
    broadcaster("gps", { device, status: "connected", path });
    setTimeout(() => {
      if (!flags.pvt || !flags.rel) {
        port1.close(() => changePath(broadcaster, device));
      }
    }, 5000);
  };

  const handleClose = (path, device) => {
    broadcaster("gps", { device, status: "closed", path });
    if (flags.pvt && flags.rel) reconnectGPS(broadcaster, device);
  };

  const handleNotConnected = (device) => {
    broadcaster("gps", { device, status: "not connected" });
    reconnectGPS(broadcaster, device);
  };

  paths = await getMosaicPorts(broadcaster);
  if (paths[index1] === undefined) index1 = 0;
  if (paths.length > 0) {
    port1 = new SerialPort({ path: paths[index1], baudRate });
    const parser = port1.pipe(new DelimiterParser({ delimiter: "\x24\x40" }));
    port1.on("data", (chunk) => {
      serialBytes += chunk.length;
    });
    parser.on("data", (e) => handleData(e, device));
    port1.on("open", () => handleOpen(paths[index1], device));
    port1.on("close", () => handleClose(paths[index1], device));
    port1.on("error", (e) => handleError(e, device, paths[index1]));
  } else {
    handleNotConnected(device);
  }
};

// guards against error + close both firing for the same fault and each
// scheduling their own reconnect, which would race two connectGPS() calls
let reconnectScheduled = false;

const reconnectGPS = (broadcaster, device) => {
  if (reconnectScheduled) return;
  reconnectScheduled = true;
  setTimeout(() => {
    reconnectScheduled = false;
    broadcaster("gps", { device, status: "connecting" });
    connectGPS(broadcaster);
  }, 15000);
};

exports.connectGPS = connectGPS;
