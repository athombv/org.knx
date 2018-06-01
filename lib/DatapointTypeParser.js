'use strict';

class DatapointTypeParser {
    static onoff(buffer) {
        return Boolean(buffer.readInt8());
    }
    static dim(buffer) {
        return (buffer.readUInt16LE(0,2) /255);
    }

    static colorChannel(buffer) {
        return buffer.readUInt16LE(0,2);
    }

    static temperature(buffer) {
        return (buffer.readUInt16LE(0,4)); // needs testing
    }
}

module.exports = DatapointTypeParser;