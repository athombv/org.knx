'use strict';

const Homey = require('homey');
const KNXGenericDriver = require('./../generic_knx_driver.js');
const uuidv4 = require('uuid/v4');

class KNXRGB extends KNXGenericDriver {

    onPairListDevices( data, callback ){

        callback( null, [
            {
                name: 'KNX RGB device',
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

module.exports = KNXRGB;