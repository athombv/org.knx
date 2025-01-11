'use strict';

// Static function to convert the buffer received from a KNX event to
// something that can be used with Homey capabilities.

class DatapointTypeParser {

  // Defined in https://bitbucket.org/ekarak/knx.js/src/master/README-datapoints.md

  // DPT 1.xxx
  static bitFormat(buffer, defaultValue = 1) {
    if (buffer.length < 1) return defaultValue;
    return Boolean(buffer.readInt8(0));
  }

  // DPT 5
  static dim(buffer, defaultValue = 128) {
    if (buffer.length < 1) return defaultValue;
    return (buffer.readUInt8(0) / 255);
  }

  static colorChannel(buffer, defaultValue = 0) {
    if (buffer.length < 1) return defaultValue;
    return buffer.readUInt8(0);
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

  // type N8 for DPT20 1 byte (PDT_ENUM8)
  static dpt20(buffer, defaultValue = 0) {
    if (buffer.length < 1) return defaultValue;
    return buffer.readUInt8(0);  
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

  static dpt17(buffer) {
    if (buffer.length < 1) return 0;
    return buffer.readUInt8(0);
  }

  // Helper function for float calculations, copied form the knx library dpt9.js file.
  static ldexp(mantissa, exponent) {
    /* eslint-disable no-restricted-properties, no-nested-ternary */
    return exponent > 1023 // avoid multiplying by infinity
      ? mantissa * Math.pow(2, 1023) * Math.pow(2, exponent - 1023)
      : exponent < -1074 // avoid multiplying by zero
        ? mantissa * Math.pow(2, -1074) * Math.pow(2, exponent + 1074)
        : mantissa * Math.pow(2, exponent);
    /* eslint-enable */
  }

}

module.exports = DatapointTypeParser;
