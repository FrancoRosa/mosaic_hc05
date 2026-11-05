const { Transform } = require("stream");
const { crc16 } = require("./mosaic_decoder");

// Splits a raw serial byte stream into SBF blocks using the Length field of
// each header (guide 4.1.1) instead of waiting for the next "$@" sync, so a
// block is pushed the moment its last byte arrives rather than when the
// following block starts — with a "$@" delimiter the last block of every
// epoch (often PVTGeodetic) would sit in the buffer for a full epoch.
//
// Each emitted chunk has the 2 sync bytes stripped (starts at CRC), same as
// the DelimiterParser output mosaic_decoder.decode() was written against.
// Blocks failing the CRC are dropped and the scan resumes after their sync,
// which is also how we resync after a corrupted bluetooth frame.
const SYNC = Buffer.from("$@");
const HEADER = 8; // sync(2) + CRC(2) + ID(2) + Length(2)
const MAX_LENGTH = 4096;

class SbfFramer extends Transform {
  constructor(options) {
    super({ ...options, readableObjectMode: true });
    this.buffer = Buffer.alloc(0);
  }

  _transform(chunk, encoding, cb) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    let pos = 0;
    for (;;) {
      const start = this.buffer.indexOf(SYNC, pos);
      if (start === -1) {
        // keep a trailing "$" in case the "@" comes in the next chunk
        pos = this.buffer[this.buffer.length - 1] === 0x24 ? this.buffer.length - 1 : this.buffer.length;
        break;
      }
      pos = start;
      if (this.buffer.length - start < HEADER) break;

      const length = this.buffer.readUInt16LE(start + 6);
      if (length < HEADER || length % 4 !== 0 || length > MAX_LENGTH) {
        pos = start + 2;
        continue;
      }
      if (this.buffer.length - start < length) break;

      const block = this.buffer.subarray(start, start + length);
      if (crc16(block.subarray(4)) === block.readUInt16LE(2)) {
        this.push(Buffer.from(block.subarray(2)));
        pos = start + length;
      } else {
        pos = start + 2;
      }
    }
    this.buffer = this.buffer.subarray(pos);
    cb();
  }
}

module.exports = { SbfFramer };
