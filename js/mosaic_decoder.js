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

let count= 0
const decode = (e, flags, device, broadcaster) => {
  if (e.length === 54) {
    // msc_cov
    if (e.slice(2, 4).toString("latin1") == registers.msc_cov.code) {
      // try {
      const cov = covMosaicDecoder(e, registers.msc_cov);
      payload = { ...payload, ...cov };
      // } catch (error) {
      //   console.log("... cov decode error");
      // }
    }
  }
  if (e.length === 42) {
    if (e.slice(2, 4).toString("latin1") == registers.msc_att.code) {
      try {
        const rel = attMosaicDecoder(e, registers.msc_att);
        payload = { ...payload, ...rel };
      } catch (error) {
        console.log("...att decode error");
      }
    }
  }

  if (e.length === 94) {
    if (e.slice(2, 4).toString("latin1") == registers.msc_rel.code) {
      try {
        const geoPVT = pvtMosaicDecoder(e, registers.msc_rel);
        payload = { ...payload, ...geoPVT };
      } catch (error) {
        console.log("... pvt decode error");
      }
    }

    flags.pvt = 1;
    flags.rel = 1;
    count++
    broadcaster("data", { ...payload, device });
    if (count >= 20) {
      console.log({ ...payload, device })
      count=0
    }
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
  const time = toInt(e, obj.time);
  const lat = toInt(e, obj.lat);
  const lng = toInt(e, obj.lng);
  const height = 3.2808 * toInt(e, obj.height);
  const fixType = getFlags(e, obj.mode);
  const vn = toInt(e, obj.vn);
  const ve = toInt(e, obj.ve);
  const vu = toInt(e, obj.vu);
  const v = Math.sqrt(vn ** 2 + ve ** 2 + vu ** 2);
  return {
    time,
    lat,
    lng,
    height,
    fixType,
    vn,
    ve,
    vu,
    v,
  };
};

const attMosaicDecoder = (e, obj) => {
  const pitch = toInt(e, obj.pitch);
  const heading = toInt(e, obj.heading);
  return {
    time: toInt(e, obj.time),
    heading: heading > -20000 ? heading : 0,
    pitch: pitch > -20000 ? pitch : 0,
    lenght: 1,
    n: 1,
    e: 1,
  };
};

const covMosaicDecoder = (e, obj) => {
  return {
    vAcc: Math.sqrt(toInt(e, obj.covLat)) * 204,
    hAcc: Math.sqrt(toInt(e, obj.covHeight)) * 1000,
  };
};

exports.decode = decode;
