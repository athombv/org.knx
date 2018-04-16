'use strict';

const Homey = require('homey');
const KNXGenericDriver = require('./../../lib/generic_knx_driver.js');
const uuidv4 = require('uuid/v4');

class KNXSwitch extends KNXGenericDriver {

    onPairListDevices( data, callback ){

        callback( null, [
            {
                name: 'KNX Switch',
                data: {
                    id: uuidv4()
                },
                settings: {
                    macAddress: "00246d0157"
                }
            }
        ]);
    }
}

module.exports = KNXSwitch;