'use strict';

const Homey = require('homey');
const KNXGeneric = require('./../../lib/generic_knx_device.js');
const DatapointTypeParser = require('./../../lib/DatapointTypeParser.js');

class KNXSensorGeneric extends KNXGeneric {
    // this method is called when the Device is inited
    
    onInit() {
        super.onInit();
        this.log('KNX sensor init');
    }

    onKNXEvent(groupaddress, data) {
        if (groupaddress === this.getSetting('ga_sensor')) {
            this.log('sensor triggered');
        }
    }

    onKNXConnection() {
        // check if there is a correct IP interface and a status address
        if (this.knxInterface && this.getSetting('ga_sensor')) {
            this.knxInterface.readKNXGroupAddress(this.getSetting('ga_sensor'))
            .catch((knxerror) => {
                this.log(knxerror);
            });
        }
    }
}

module.exports = KNXSensorGeneric;