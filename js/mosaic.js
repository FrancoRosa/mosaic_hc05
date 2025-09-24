const { SerialPort } = require("serialport");
const { decode } = require("./mosaic_decoder");

const { io } = require("socket.io-client");
const settings = require("../settings.json");
const socket = io(settings.ntrip);

const baudRate = 115200;
let paths = [];

let index1 = 0;
let port1;

socket.on("connect", () => {
  console.log("... connected", socket.id); // x8WIv7-mJelg7on_ALbx
});

socket.on("disconnect", () => {
  console.log("... disconnected", socket.id); // undefined
});

let ntrip_count = 0;

socket.on("rtcm", (data) => {
  if (data) {
    if (port1) {
      port1.write(data);
      if (ntrip_count === 0) console.log("... mosaic web ntrip sent");
      ntrip_count++;
      if (ntrip_count > 5) ntrip_count = 0;
    }
  }
});

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
  console.log({ ports });
  return ports.map((p) => p.path);
};

const changePath = async (broadcaster, device, updateBaseSerial) => {
  index1++;
  index1 = index1 < paths.length ? index1 : 0;
  console.log("... changing path to:", index1, paths[index1]);
  reconnectGPS(broadcaster, device, updateBaseSerial);
};

const connectGPS = async (broadcaster, updateBaseSerial) => {
  const flags = { pvt: 0, rel: 0 };
  const device = 1;

  const handleData = (e, device) => {
    decode(e, flags, device, broadcaster);
  };

  const handleError = (e, device) => {
    console.log(`... gps${device} error:`, e.message);
    broadcaster("gps", { device, status: "error" });
    changePath(broadcaster, device, updateBaseSerial);
  };

  const handleOpen = (path, device) => {
    console.log(`... gps${device} connected:`, path);
    broadcaster("gps", { device, status: "connected" });
    setTimeout(() => {
      if (!flags.pvt || !flags.rel) {
        console.log(`... frames not found ${device}`);
        port1.close(() => changePath(broadcaster, device, updateBaseSerial));
      }
    }, 5000);
  };

  const handleClose = (path, device) => {
    console.log(`... gps${device} closed:`, path);
    broadcaster("gps", { device, status: "closed" });
    if (flags.pvt && flags.rel)
      reconnectGPS(broadcaster, device, updateBaseSerial);
  };

  const handleNotConnected = (device) => {
    console.error(`... gps${device} not connected`);
    broadcaster("gps", { device, status: "not connected" });
    reconnectGPS(broadcaster, device, updateBaseSerial);
  };

  paths = await getMosaicPorts(broadcaster);
  if (paths[index1] === undefined) index1 = 0;
  if (paths.length > 0) {
    console.log(`... connecting gps${device} to :`, paths[index1]);
    port1 = new SerialPort({ path: paths[index1], baudRate });
    updateBaseSerial(port1);
    port1.on("data", (e) => handleData(e, device));
    port1.on("open", () => handleOpen(paths[index1], device));
    port1.on("close", () => handleClose(paths[index1], device));
    port1.on("error", (e) => handleError(e, device));
  } else {
    updateBaseSerial();
    handleNotConnected(device);
  }
};

const reconnectGPS = (emit, device, updateBaseSerial) => {
  setTimeout(() => {
    console.log("... reconnecting mosaic");
    emit("gps", { device, status: "connecting" });
    connectGPS(emit, updateBaseSerial);
  }, 15000);
};

exports.connectGPS = connectGPS;
