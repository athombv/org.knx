'use strict';

const Homey = require('homey');
const KNXGenericDriver = require('./../../lib/generic_knx_driver.js');
const uuidv4 = require('uuid/v4');

class KNXSwitch extends KNXGenericDriver {
}

module.exports = KNXSwitch;