const net = require("net");
const { decode } = require("./mosaic_decoder");

const { io } = require("socket.io-client");
const settings = require("../settings.json");
const socket = io(settings.ntrip);

let tcpClient;

socket.on("connect", () => {
  console.log("... connected to ntrip", socket.id);
});

socket.on("disconnect", () => {
  console.log("... disconnected from ntrip", socket.id);
});

let ntrip_count = 0;

socket.on("rtcm", (data) => {
  if (data) {
    if (tcpClient && !tcpClient.destroyed) {
      tcpClient.write(data);
      if (ntrip_count === 0) console.log("... mosaic web ntrip sent");
      ntrip_count++;
      if (ntrip_count > 5) ntrip_count = 0;
    }
  }
});

const connectGPS = async (broadcaster, updateBaseSerial) => {
  const flags = { pvt: 0, rel: 0 };
  const device = 1;
  const [host, port] = settings.mosaic.split(":");

  const handleData = (e) => {
    decode(e, flags, device, broadcaster);
  };

  const handleError = (e) => {
    console.log(`... gps${device} tcp error:`, e.message);
    broadcaster("gps", { device, status: "error" });
    if (tcpClient) tcpClient.destroy();
    reconnectGPS(broadcaster, device, updateBaseSerial);
  };

  const handleConnect = () => {
    console.log(`... gps${device} connected:`, `${host}:${port}`);
    broadcaster("gps", { device, status: "connected" });
    setTimeout(() => {
      if (!flags.pvt || !flags.rel) {
        console.log(`... frames not found on device ${device}`);
        if (tcpClient) tcpClient.destroy();
        // The 'close' event will trigger reconnection
      }
    }, 5000);
  };

  const handleClose = () => {
    console.log(`... gps${device} closed:`, `${host}:${port}`);
    broadcaster("gps", { device, status: "closed" });
    reconnectGPS(broadcaster, device, updateBaseSerial);
  };

  console.log(`... connecting gps${device} to tcp:`, `${host}:${port}`);
  tcpClient = net.createConnection({ host, port }, handleConnect);
  updateBaseSerial(tcpClient);

  tcpClient.on("data", handleData);
  tcpClient.on("close", handleClose);
  tcpClient.on("error", handleError);
};

const reconnectGPS = (emit, device, updateBaseSerial) => {
  setTimeout(() => {
    console.log("... reconnecting mosaic");
    emit("gps", { device, status: "connecting" });
    connectGPS(emit, updateBaseSerial);
  }, 15000);
};

exports.connectGPS = connectGPS;
