'use strict';

const DPTLib = require('knx/src/dptlib');

// Encodes a value into the APDU data Buffer exactly as the knx library puts it on the bus,
// which is also the shape the library delivers for inbound telegrams.
function buildApduData(value, datapoint) {
  const apdu = {};
  DPTLib.populateAPDU(value, apdu, datapoint);
  return apdu.data;
}

module.exports = {
  buildApduData,
};
