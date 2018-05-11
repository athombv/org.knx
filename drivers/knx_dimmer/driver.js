'use strict';

const Homey = require('homey');
const KNXGenericDriver = require('./../../lib/generic_knx_driver.js');
const uuidv4 = require('uuid/v4');

class KNXDimmer extends KNXGenericDriver {
}

module.exports = KNXDimmer;