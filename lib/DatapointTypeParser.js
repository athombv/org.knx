'use strict';

// Static function to convert the buffer received from a KNX event to 
// something that can be used with Homey capabilities.

class DatapointTypeParser {
    // DPT 1
    static onoff(buffer) {
        return Boolean(buffer.readInt8());
    }

    // DPT 5
    static dim(buffer) {
        return (buffer.readUInt16LE(0,2) /255);
    }

    static colorChannel(buffer) {
        return buffer.readUInt16LE(0,2);
    }

    // DPT9.1
    static temperature(buffer) {
        if (buffer && buffer.length == 2) {
            var sign     =  buffer[0] >> 7;
            var exponent = (buffer[0] & 0b01111000) >> 3;
            var mantissa = 256 * (buffer[0] & 0b00000111) + buffer[1];
            mantissa = (sign == 1) ? ~(mantissa^2047) : mantissa;
            return this.ldexp((0.01*mantissa), exponent);
        } else {
            return null;
        }
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