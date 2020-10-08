'use strict';

// Static function to convert the buffer received from a KNX event to
// something that can be used with Homey capabilities.

class DatapointTypeParser {

  // DPT 1
  // TODO need investigation if these values are the correct dataType
  static onoff(buffer, defaultValue = 1) {
    if (buffer.length < 1) return defaultValue;
    return Boolean(buffer.readInt8(0));
  }

  // DPT 5
  // TODO need investigation if these values are the correct dataType
  static dim(buffer, defaultValue = 128) {
    if (buffer.length < 2) return defaultValue;
    return (buffer.readUInt16LE(0) / 255);
  }

  // TODO need investigation if these values are the correct dataType
  static colorChannel(buffer, defaultValue = 0) {
    if (buffer.length < 2) return defaultValue;
    return buffer.readUInt16LE(0);
  }

  // DPT9 2byte for temperature / lux
  static dpt9(buffer) {
    if (buffer && buffer.length === 2) {
      const sign = buffer[0] >> 7;
      const exponent = (buffer[0] & 0b01111000) >> 3;
      let mantissa = 256 * (buffer[0] & 0b00000111) + buffer[1];
      mantissa = (sign === 1) ? ~(mantissa ^ 2047) : mantissa;
      return this.ldexp((0.01 * mantissa), exponent);
    }
    return null;
  }

  static dpt14(buffer) {
    if (!buffer
      && !buffer.length === 4
      && !typeof buffer === 'buffer'
    ) {
      return new Error('invalid dpt14 data');
    }

    return buffer.readFloatBE(0);
  }

  // Helper function for float calculations, copied form the knx library dpt9.js file.
  static ldexp(mantissa, exponent) {
    return exponent > 1023 // avoid multiplying by infinity
      ? mantissa * Math.pow(2, 1023) * Math.pow(2, exponent - 1023)
      : exponent < -1074 // avoid multiplying by zero
        ? mantissa * Math.pow(2, -1074) * Math.pow(2, exponent + 1074)
        : mantissa * Math.pow(2, exponent);
  }

}

module.exports = DatapointTypeParser;
