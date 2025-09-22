const { SerialPort } = require("serialport");
const registers = require("./constants");

const baudRate = 9600;
let paths = [];

let index1 = 0;
let port1;

const getRadioPorts = async (broadcaster) => {
  let ports = await SerialPort.list();
  broadcaster("ports", {
    ports: ports.filter((port) => port.manufacturer !== undefined),
  });
  ports = ports.filter((port) => port.manufacturer?.includes("FTDI"));
  return ports.map((p) => p.path);
};

const changePath = async (broadcaster, device, getBaseSerial) => {
  index1++;
  index1 = index1 < paths.length ? index1 : 0;
  console.log("... changing radio path to:", index1, paths[index1]);
  reconnectBase(broadcaster, device, getBaseSerial);
};

const connectRadio = async (broadcaster, getBaseSerial) => {
  const flags = { status: 0 };
  const device = 1;

  const handleData = (e, device) => {
    let payload = Buffer.from(e, "utf8");
    let pattern = Buffer.from(registers.rtcm3.code, "hex");

    if (flags.status) {
      const base = getBaseSerial();
      if (base) {
        base.write(e);
      }
    }

    if (payload.includes(pattern)) {
      flags.status = 1;
    }
  };

  const handleError = (e, device) => {
    console.log(`... radio ${device} error:`, e.message);
    broadcaster("radio", { device, status: "error" });
    if (e.message.includes("temporarily unavailable")) {
      changePath(broadcaster, device, getBaseSerial);
    }
  };

  const handleOpen = (path, device) => {
    console.log(`... radio ${device} connected:`, path);
    broadcaster("radio", { device, status: "connected" });
    setTimeout(() => {
      if (!flags.status) {
        console.log(`... radio frames not found ${device}`);
        port1.close(() => changePath(broadcaster, device, getBaseSerial));
      }
    }, 1000);
  };

  const handleClose = (path, device) => {
    console.log(`... radio ${device} closed:`, path);
    broadcaster("radio", { device, status: "closed" });
    if (flags.status) reconnectBase(broadcaster, device, getBaseSerial);
  };

  const handleNotConnected = (device) => {
    console.error(`... radio${device} not connected`);
    broadcaster("radio", { device, status: "not connected" });
    reconnectBase(broadcaster, device, getBaseSerial);
  };

  paths = await getRadioPorts(broadcaster);
  if (paths[index1] === undefined) index1 = 0;
  if (paths.length > 0) {
    console.log(`... connecting radio ${device} to :`, paths[index1]);
    port1 = new SerialPort({ path: paths[index1], baudRate });
    port1.on("data", (e) => handleData(e, device));
    port1.on("open", () => handleOpen(paths[index1], device));
    port1.on("close", () => handleClose(paths[index1], device));
    port1.on("error", (e) => handleError(e, device));
  } else {
    handleNotConnected(device);
  }
  try {
    return port1;
  } catch (error) {
    console.log("Error connecting radio");
  }
};

const reconnectBase = (emit, device, getBaseSerial) => {
  setTimeout(() => {
    console.log("... reconnecting radio 1");
    emit("radio", { device, status: "connecting" });
    connectRadio(emit, getBaseSerial);
  }, 7000);
};

exports.connectRadio = connectRadio;
