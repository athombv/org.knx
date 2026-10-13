'use strict';

// Conversion between a KNX DPT 1.100 (heating/cooling) value and the Homey
// thermostat_mode capability. 1 = heating, 0 = cooling.

function fromDpt1(value) {
  if (value === undefined || value === null) {
    throw new Error('No DPT 1.100 value supplied');
  }
  let bit;
  if (Buffer.isBuffer(value)) {
    if (value.length < 1) {
      throw new Error('Empty DPT 1.100 buffer');
    }
    bit = value.readUInt8(0) & 0x01;
  } else if (typeof value === 'number') {
    bit = value & 0x01;
  } else if (typeof value === 'boolean') {
    bit = value ? 1 : 0;
  } else {
    throw new Error(`Unsupported DPT 1.100 value: ${value}`);
  }
  return bit === 1 ? 'heat' : 'cool';
}

function toDpt1(mode) {
  if (mode === 'heat') return 1;
  if (mode === 'cool') return 0;
  throw new Error(`Unsupported heating/cooling mode: ${mode}`);
}

module.exports = {
  fromDpt1,
  toDpt1,
};
