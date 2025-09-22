const registers = require("./constants");
let payload = {};

const u2toInt = (frame) => {
  const uint = frame.readInt16LE();
  return uint;
};

const u4toInt = (frame) => {
  const bytes = new Uint8Array(frame);
  const uint = new Uint32Array(bytes.buffer)[0];
  return uint;
};

const i4toInt = (frame) => {
  const bytes = new Int8Array(frame);
  const uint = new Int32Array(bytes.buffer)[0];
  return uint;
};

const f8toFloat = (frame) => {
  const float = frame.readDoubleLE();
  return float;
};

const f4toFloat = (frame) => {
  const float = frame.readFloatLE();
  return float;
};

const i1toInt = (frame) => {
  return frame.readInt8();
};

const intToU4 = (value) => {
  const bytes = 4;
  const result = [];
  for (let index = 0; index < bytes; index++) {
    const res = value % 256;
    value = (value - res) / 256;
    result.unshift(res);
  }
  return Buffer.from(new Uint8Array(result)).reverse();
};

const intToI4 = (value) => {
  const maxU4 = 4294967296;
  value = value < 0 ? maxU4 + value : value;
  return intToU4(value);
};

const intToI1 = (value) => {
  const maxU1 = 256;
  return Buffer.from([value < 0 ? maxU1 + value : value]).reverse();
};

const getTmode3Payload = (lat, lng, alt) => {
  const latg = Math.round(lat * 1e7);
  const lngg = Math.round(lng * 1e7);
  const altg = Math.round(alt);
  const latd = Math.round((lat * 1e7 - latg) * 1e2);
  const lngd = Math.round((lng * 1e7 - lngg) * 1e2);
  const altd = Math.round((alt - altg) * 1e2);
  return Buffer.concat([
    intToI4(latg),
    intToI4(lngg),
    intToI4(altg),
    intToI1(latd),
    intToI1(lngd),
    intToI1(altd),
  ]);
};

const bufferFromBytes = (bytes) => {
  return Buffer.from(bytes.split(" ").map((byte) => parseInt(byte, 16)));
};

const toInt = (frame, target, units = false) => {
  const { index, type, scaling, unit } = target;
  let result;
  switch (type) {
    case "u2":
      result = u2toInt(frame.slice(index, index + 2)) * scaling;
      break;
    case "u4":
      result = u4toInt(frame.slice(index, index + 4)) * scaling;
      break;
    case "i4":
      result = i4toInt(frame.slice(index, index + 4)) * scaling;
      break;
    case "i1":
      result = i1toInt(frame.slice(index, index + 1)) * scaling;
      break;
    case "x2":
      result = frame.slice(index, index + 1);
      break;
    case "f4":
      result = f4toFloat(frame.slice(index, index + 4)) * scaling;
      break;
    case "f8":
      result = f8toFloat(frame.slice(index, index + 8)) * scaling;
      break;
    default:
      break;
  }
  return units ? result.toString() + unit : result;
};

const byte2bits = (char) => {
  let byte = char;
  let tmp = "";
  for (let i = 128; i >= 1; i /= 2) tmp += byte & i ? "1" : "0";
  return tmp;
};

const getFlags = (frame, target) => {
  const { index, type, values } = target;
  let bytes;
  let result = [];
  switch (type) {
    case "x2":
      bytes = frame.slice(index, index + 2);
      bytes.forEach((byte, index) => {
        switch (values[index].type) {
          case "int":
            result.push(values[index].map[byte]);
            break;
          case "bit":
            const bits = byte2bits(byte);
            bits
              .split("")
              .reverse()
              .forEach((bit, i) => {
                const flag = values[index].map[i]?.[parseInt(bit)];
                if (flag) result.push(flag);
              });
            break;
          default:
            break;
        }
      });
      return result;
    case "u1":
      bytes = frame.slice(index, index + 1);
      bytes.forEach((byte, index) => {
        switch (values[index].type) {
          case "int":
            result.push(values[index].map[byte]);
            break;

          default:
            break;
        }
      });

      return result;
    case "x1":
      const byte = frame.slice(index, index + 1);
      const bits = byte2bits(byte.readUInt8());
      bits
        .split("")
        .reverse()
        .forEach((bit, index) => {
          if (bit === "1") {
            if (values[index]) result.push(values[index]);
          }
        });

      return result;
    default:
      break;
  }
  return result;
};

const decode = (e, flags, device, broadcaster) => {
  if (e.length === 196) {
    if (e.slice(4, 6).toString("latin1") == registers.msc_rel.code) {
      try {
        const geoPVT = pvtMosaicDecoder(e, registers.msc_rel);
        payload = { ...payload, ...geoPVT };
      } catch (error) {
        console.log("... pvt decode error");
      }
    }

    if (e.slice(156, 158).toString("latin1") == registers.msc_att.code) {
      try {
        const rel = attMosaicDecoder(e.slice(152), registers.msc_att);
        payload = { ...payload, ...rel };
      } catch (error) {
        console.log("...att decode error");
      }
    }
    if (e.slice(100, 102).toString("latin1") == registers.msc_cov.code) {
      try {
        const cov = covMosaicDecoder(e.slice(96), registers.msc_cov);
        payload = { ...payload, ...cov };
      } catch (error) {
        console.log("...cov decode error");
      }
    }
    flags.pvt = 1;
    flags.rel = 1;
    console.log(payload);
    broadcaster("data", { ...payload, device });
  }
};

const getFrame = (e, obj) => {
  const start = e.indexOf(obj.header);
  const frame = e.slice(start, e.length);
  return frame;
};

const pvtDecoder = (e, obj) => {
  const frame = getFrame(e, obj);
  return {
    time: toInt(frame, obj.time),
    lng: toInt(frame, obj.lng),
    lat: toInt(frame, obj.lat),
    hAcc: toInt(frame, obj.hAcc),
    vAcc: toInt(frame, obj.vAcc),
    fixType: getFlags(frame, obj.fixType),
  };
};

const pvtMosaicDecoder = (e, obj) => {
  const frame = getFrame(e, obj);
  const len = toInt(frame, obj.len);
  if (len !== 96) {
    return false;
  }
  const time = toInt(frame, obj.time);
  const lat = toInt(frame, obj.lat);
  const lng = toInt(frame, obj.lng);
  const height = 3.2808 * (toInt(frame, obj.height));
  const fixType = getFlags(frame, obj.mode);
  // const hAcc = toInt(frame, obj.hAcc);
  // const vAcc = toInt(frame, obj.vAcc);
  return {
    time,
    lat,
    lng,
    height,
    fixType,
    // hAcc,
    // vAcc,
  };
};

const attMosaicDecoder = (e, obj) => {
  const frame = getFrame(e, obj);
  const pitch = toInt(frame, obj.pitch);
  const heading = toInt(frame, obj.heading);
  return {
    time: toInt(frame, obj.time),
    heading: heading > -20000 ? heading : 0,
    pitch: pitch > -20000 ? pitch : 0,
    lenght: 1,
    n: 1,
    e: 1,
  };
};

const covMosaicDecoder = (e, obj) => {
  const frame = getFrame(e, obj);
  return {
    // covLat: Math.sqrt(toInt(frame, obj.covLat)),
    // covLng: Math.sqrt(toInt(frame, obj.covLng)),
    // covHgt: Math.sqrt(toInt(frame, obj.covHeight)),

    vAcc: Math.sqrt(toInt(frame, obj.covLat)) * 1000,
    hAcc: Math.sqrt(toInt(frame, obj.covHeight)) * 1000,
  };
};



exports.decode = decode;
