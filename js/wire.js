// Wire format used by apiws.js, shared by the server (require) and the
// browser (<script src="/js/wire.js">, exposed as window.Wire).
//
// The frequent messages go out as binary WebSocket frames, little-endian,
// with the first byte being the message type:
//
//   data   (0x01, 63 bytes, at the receiver output rate)
//     0 u1 type | 1 u1 device | 2 u1 fixType code (255 = none)
//     3 u4 time | 7 f8 lat | 15 f8 lng
//     23 f4 height, vn, ve, vu, v, heading, pitch, roll, hAcc, vAcc
//     a NaN f4 means the field hasn't been received yet and is left out
//
//   stats  (0x02, 9 bytes, 1Hz)
//     0 u1 type | 1 f4 ntripKbps | 5 f4 serialKbps
//
//   status (0x03, 26 + 4*n bytes, 1Hz) — raw ReceiverStatus fields
//     0 u1 type | 1 u1 device | 2 u4 tow (DNU 0xffffffff) | 6 u2 wnc
//     8 u1 cpuLoad (DNU 255) | 9 u1 extError | 10 u4 upTime | 14 u4 rxState
//     18 u4 rxError | 22 u1 cmdCount | 23 u1 temperature+100 (DNU 0)
//     24 u1 antenna (0 ok, 1 open, 2 short) | 25 u1 n
//     26 + 4*i: u1 frontend | antenna << 5, i1 gain (-128 unlocked),
//               u1 sampleVar (DNU 0), u1 blanking
//
// Everything else (boot, ports, gps, ntrip, driver, meta) is rare and goes
// out as a JSON text frame: [type, message]. "meta" is sent first on every
// connection and carries the name tables the decoder needs to turn codes
// back into the same objects the SBF decoder produces.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Wire = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const DATA = 1;
  const STATS = 2;
  const STATUS = 3;

  const DATA_F4 = ["height", "vn", "ve", "vu", "v", "heading", "pitch", "roll", "hAcc", "vAcc"];
  const DATA_LEN = 23 + DATA_F4.length * 4;
  const STATUS_LEN = 26;
  const ANTENNA = ["ok", "open", "short"];

  const invert = (map) =>
    Object.fromEntries(Object.entries(map).map(([k, v]) => [v, Number(k)]));

  // unknown frontends/antennas are named FE<id>/ant<id> by the decoder
  const codeOf = (name, inverted, prefix) => {
    if (name in inverted) return inverted[name];
    const id = parseInt(String(name).slice(prefix.length), 10);
    return Number.isFinite(id) ? id : 0;
  };

  const bitNames = (value, map) =>
    Object.entries(map)
      .filter(([bit]) => (value >>> bit) & 1)
      .map(([, name]) => name);

  const createEncoder = (meta) => {
    const fixCodes = invert(meta.fix);
    const frontendCodes = invert(meta.frontends);
    const antennaCodes = invert(meta.antennas);

    const data = (m) => {
      const out = new Uint8Array(DATA_LEN);
      const dv = new DataView(out.buffer);
      const fix = m.fixType && m.fixType[0];
      dv.setUint8(0, DATA);
      dv.setUint8(1, m.device || 0);
      dv.setUint8(2, fix in fixCodes ? fixCodes[fix] : 255);
      dv.setUint32(3, (m.time || 0) >>> 0, true);
      dv.setFloat64(7, m.lat ?? NaN, true);
      dv.setFloat64(15, m.lng ?? NaN, true);
      DATA_F4.forEach((k, i) => dv.setFloat32(23 + i * 4, m[k] ?? NaN, true));
      return out;
    };

    const stats = (m) => {
      const out = new Uint8Array(9);
      const dv = new DataView(out.buffer);
      dv.setUint8(0, STATS);
      dv.setFloat32(1, m.ntripKbps, true);
      dv.setFloat32(5, m.serialKbps, true);
      return out;
    };

    const status = (m) => {
      const agc = m.agc.slice(0, 255);
      const out = new Uint8Array(STATUS_LEN + agc.length * 4);
      const dv = new DataView(out.buffer);
      dv.setUint8(0, STATUS);
      dv.setUint8(1, m.device || 0);
      dv.setUint32(2, m.tow === null ? 0xffffffff : m.tow, true);
      dv.setUint16(6, m.wnc, true);
      dv.setUint8(8, m.cpuLoad === null ? 255 : m.cpuLoad);
      dv.setUint8(9, m.extError);
      dv.setUint32(10, m.upTime, true);
      dv.setUint32(14, m.rxState >>> 0, true);
      dv.setUint32(18, m.rxError >>> 0, true);
      dv.setUint8(22, m.cmdCount);
      dv.setUint8(23, m.temperature === null ? 0 : m.temperature + 100);
      dv.setUint8(24, Math.max(0, ANTENNA.indexOf(m.antenna)));
      dv.setUint8(25, agc.length);
      agc.forEach((a, i) => {
        const o = STATUS_LEN + i * 4;
        const fe = codeOf(a.frontend, frontendCodes, "FE") & 0x1f;
        const ant = codeOf(a.antenna, antennaCodes, "ant") & 0x07;
        dv.setUint8(o, fe | (ant << 5));
        dv.setInt8(o + 1, a.gain === null ? -128 : a.gain);
        dv.setUint8(o + 2, a.sampleVar === null ? 0 : a.sampleVar);
        dv.setUint8(o + 3, a.blanking);
      });
      return out;
    };

    const binary = { data, stats, status };

    // returns a Uint8Array for binary types, a string for JSON ones
    return (type, message) =>
      binary[type] ? binary[type](message) : JSON.stringify([type, message]);
  };

  const createDecoder = (meta) => {
    const data = (dv) => {
      const fix = dv.getUint8(2);
      const m = {
        time: dv.getUint32(3, true),
        lat: dv.getFloat64(7, true),
        lng: dv.getFloat64(15, true),
        fixType: fix === 255 ? [] : [meta.fix[fix]],
      };
      DATA_F4.forEach((k, i) => (m[k] = dv.getFloat32(23 + i * 4, true)));
      Object.keys(m).forEach((k) => Number.isNaN(m[k]) && delete m[k]);
      m.device = dv.getUint8(1);
      return m;
    };

    const stats = (dv) => ({
      ntripKbps: dv.getFloat32(1, true),
      serialKbps: dv.getFloat32(5, true),
    });

    const status = (dv) => {
      const tow = dv.getUint32(2, true);
      const cpuLoad = dv.getUint8(8);
      const extError = dv.getUint8(9);
      const rxState = dv.getUint32(14, true);
      const rxError = dv.getUint32(18, true);
      const temperature = dv.getUint8(23);
      const n = dv.getUint8(25);
      const agc = [];
      for (let i = 0; i < n; i++) {
        const o = STATUS_LEN + i * 4;
        const id = dv.getUint8(o);
        const gain = dv.getInt8(o + 1);
        const sampleVar = dv.getUint8(o + 2);
        agc.push({
          frontend: meta.frontends[id & 0x1f] ?? `FE${id & 0x1f}`,
          antenna: meta.antennas[id >> 5] ?? `ant${id >> 5}`,
          gain: gain === -128 ? null : gain,
          sampleVar: sampleVar === 0 ? null : sampleVar,
          blanking: dv.getUint8(o + 3),
        });
      }
      return {
        tow: tow === 0xffffffff ? null : tow,
        wnc: dv.getUint16(6, true),
        cpuLoad: cpuLoad === 255 ? null : cpuLoad,
        temperature: temperature === 0 ? null : temperature - 100,
        upTime: dv.getUint32(10, true),
        cmdCount: dv.getUint8(22),
        antenna: ANTENNA[dv.getUint8(24)],
        extError,
        extErrors: bitNames(extError, meta.extErrorBits),
        rxState,
        rxStates: bitNames(rxState, meta.rxStateBits),
        rxError,
        rxErrors: bitNames(rxError, meta.rxErrorBits),
        agc,
        device: dv.getUint8(1),
      };
    };

    const binary = { [DATA]: ["data", data], [STATS]: ["stats", stats], [STATUS]: ["status", status] };

    // takes a string (JSON frame) or an ArrayBuffer/Uint8Array (binary
    // frame) and returns [type, message], or null for an unknown type
    return (frame) => {
      if (typeof frame === "string") return JSON.parse(frame);
      const bytes = frame instanceof Uint8Array ? frame : new Uint8Array(frame);
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const entry = binary[dv.getUint8(0)];
      return entry ? [entry[0], entry[1](dv)] : null;
    };
  };

  return { createEncoder, createDecoder };
});
