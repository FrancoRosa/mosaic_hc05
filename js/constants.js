
const registers = {
  rel: {
    code: "\x62\x01\x3c",
    time: {
      index: 4,
      type: "u4",
      scaling: 1,
      unit: "ms",
    },
    n: {
      index: 8,
      type: "i4",
      scaling: 1,
      unit: "cm",
    },
    e: {
      index: 12,
      type: "i4",
      scaling: 1,
      unit: "cm",
    },

    length: {
      index: 20,
      type: "i4",
      scaling: 1,
      unit: "cm",
    },
    heading: {
      index: 24,
      type: "i4",
      scaling: 1e-5,
      unit: "deg",
    },
    nd: {
      index: 32,
      type: "i1",
      scaling: 0.1,
      unit: "mm",
    },
    ed: {
      index: 33,
      type: "i1",
      scaling: 0.1,
      unit: "mm",
    },
    lengthd: {
      index: 35,
      type: "i1",
      scaling: 0.1,
      unit: "mm",
    },
  },
  pvt: {
    code: "\x62\x01\x07",
    time: {
      index: 0,
      type: "u4",
      scaling: 1,
      unit: "ms",
    },
    fixType: {
      index: 20,
      type: "u1",
      values: {
        0: {
          type: "int",
          map: {
            0: "no fix",
            1: "dead reckoning only",
            2: "2d-fix",
            3: "3d-fix",
            4: "GNSS + dead reck combined",
            5: "time only fix",
          },
        },
      },
    },
    lng: {
      index: 24,
      type: "i4",
      scaling: 1e-7,
      unit: "deg",
    },
    lat: {
      index: 28,
      type: "i4",
      scaling: 1e-7,
      unit: "deg",
    },
    hAcc: {
      index: 40,
      type: "u4",
      scaling: 1,
      unit: "mm",
    },
    vAcc: {
      index: 44,
      type: "u4",
      scaling: 1,
      unit: "mm",
    },
  },
  svin: {
    code: "\x62\x01\x3b",
    time: {
      index: 4,
      type: "u4",
      scaling: 1,
      unit: "ms",
    },
    dur: {
      index: 8,
      type: "i4",
      scaling: 1,
      unit: "s",
    },
    meanX: {
      index: 12,
      type: "i4",
      scaling: 1,
      unit: "cm",
    },
    meanY: {
      index: 16,
      type: "i4",
      scaling: 1,
      unit: "cm",
    },
    meanZ: {
      index: 20,
      type: "i4",
      scaling: 1,
      unit: "cm",
    },
    meanAcc: {
      index: 28,
      type: "u4",
      scaling: 1e-1,
      unit: "mm",
    },
    obs: {
      index: 32,
      type: "u4",
      scaling: 1,
      unit: "",
    },
  },
  status: {
    code: "\x62\x01\x03",
    time: {
      index: 0,
      type: "u4",
      scaling: 1,
      unit: "ms",
    },
    fix: {
      index: 4,
      type: "u1",
      values: {
        0: {
          type: "int",
          map: {
            0: "no fix",
            1: "dead reckoning only",
            2: "2d-fix",
            3: "3d-fix",
            4: "GNSS + dead reck combined",
            5: "time only fix",
            6: "reserved",
          },
        },
      },
    },
    flags: {
      index: 5,
      type: "x1",
      values: {
        0: "GPS fix ok",
        1: "Corrections applied",
        2: "Week num valid",
        3: "Time of week valid",
      },
    },
    fixStat: {
      index: 6,
      type: "i4",
      scaling: 1,
      unit: "cm",
    },
  },

  clock: {
    code: "\x62\x01\x22",
    time: {
      index: 0,
      type: "u4",
      scaling: 1,
      unit: "ms",
    },
  },

  tmode3: {
    poll: "\xb5\x62\x06\x71\x00\x00\x77\x6b",
    code: "\x62\x06\x71",
    flags: {
      index: 2,
      type: "x2",
      values: {
        0: {
          type: "int",
          map: {
            0: "mode: disabled",
            1: "mode: survey-in",
            2: "mode: fixed mode",
          },
        },
        1: {
          type: "bit",
          map: {
            0: ["position: ECEF", "position: lat/lng"],
          },
        },
      },
    },
    lat: {
      index: 4,
      type: "i4",
      scaling: 1e-7,
      unit: "deg",
    },
    lng: {
      index: 8,
      type: "i4",
      scaling: 1e-7,
      unit: "deg",
    },
    alt: {
      index: 12,
      type: "i4",
      scaling: 1,
      unit: "cm",
    },
    latd: {
      index: 16,
      type: "i1",
      scaling: 1e-9,
      unit: "deg",
    },
    lngd: {
      index: 17,
      type: "i1",
      scaling: 1e-9,
      unit: "deg",
    },
    altd: {
      index: 18,
      type: "i1",
      scaling: 1,
      unit: "mm",
    },
    fixAcc: {
      index: 20,
      type: "u4",
      scaling: 1e-1,
      unit: "mm",
    },
    minTime: {
      index: 24,
      type: "u4",
      scaling: 1,
      unit: "s",
    },
    minAcc: {
      index: 28,
      type: "u4",
      scaling: 1e-1,
      unit: "mm",
    },
  },

  rtcm3: {
    code: "d300",
  },

  msc_rel: {
    header: "\x24\x40",
    code: "\xa7\x4f",
    len: {
      index: 6,
      type: "u2",
      scaling: 1,
      unit: "u",
    },
    time: {
      index: 8,
      type: "u4",
      scaling: 1,
      unit: "ms",
    },
    mode: {
      index: 14,
      type: "u1",
      values: {
        0: {
          type: "int",
          map: {
            0: "No GNSS",
            1: "Stand Alone",
            2: "Differential",
            3: "Fixed Location",
            4: "RTX fixed amb",
            5: "RTX float amb",
            6: "SBAS aided PVT",
            7: "Moving Base RTK Fixed",
            8: "Moving Base RTK Float",
            9: "Reserved",
            10: "Precise PPP",
            11: "Reserved",
          },
        },
      },
    },
    lat: {
      index: 16,
      type: "f8",
      scaling: 57.29577951308232, // 180/pi
      unit: "deg",
    },
    lng: {
      index: 24,
      type: "f8",
      scaling: 57.29577951308232, // 180/pi
      unit: "deg",
    },
    height: {
      index: 32,
      type: "f8",
      scaling: 1, // 180/pi
      unit: "m",
    },
    hAcc: {
      index: 90,
      type: "u2",
      scaling: 0.01,
      unit: "m",
    },
    vAcc: {
      index: 92,
      type: "u2",
      scaling: 0.01,
      unit: "m",
    },
  },
  msc_att: {
    header: "\x24\x40",
    code: "\x32\x17",
    len: {
      index: 6,
      type: "u2",
      scaling: 1,
      unit: "u",
    },
    time: {
      index: 8,
      type: "u4",
      scaling: 1,
      unit: "ms",
    },
    heading: {
      index: 20,
      type: "f4",
      scaling: 1, // 180/pi
      unit: "deg",
    },
    pitch: {
      index: 24,
      type: "f4",
      scaling: 1,
      unit: "deg",
    },
    roll: {
      index: 28,
      type: "f4",
      scaling: 1,
      unit: "deg",
    },
  },
  msc_cov: {
    header: "\x24\x40",
    code: "\x12\x17",
    time: {
      index: 8,
      type: "u4",
      scaling: 1,
      unit: "ms",
    },
    covLat: {
      index: 16,
      type: "f4",
      scaling: 1,
      unit: "deg",
    },
    covLng: {
      index: 20,
      type: "f4",
      scaling: 1,
      unit: "deg",
    },
    covHeight: {
      index: 24,
      type: "f4",
      scaling: 1,
      unit: "deg",
    },
  },
};

module.exports = registers;
