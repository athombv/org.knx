'use strict';

const Homey = require('homey');
const KNXGeneric = require('./../../lib/generic_knx_device.js');
const DatapointTypeParser = require('./../../lib/DatapointTypeParser.js');

class KNXLight extends KNXGeneric {
    // this method is called when the Device is inited
    
    onInit() {
        super.onInit();
        this.log('KNX Light init');
        this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
    }

    onKNXEvent(groupaddress, data) {
        if (groupaddress === this.getSetting('ga_status')) {
            this.setCapabilityValue('onoff', DatapointTypeParser.onoff(data));
        }
    }

    onKNXConnection() {
        // check if there is a correct IP interface and a status address
        if (this.knxInterface && this.getSetting('ga_status')) {
            this.knxInterface.readKNXGroupAddress(this.getSetting('ga_status'))
            .catch((knxerror) => {
                this.log(knxerror);
            });
        }
    }

    onCapabilityOnoff(value, opts) {
        if (this.knxInterface && this.getSetting('ga_switch')) {
            return this.knxInterface.writeKNXGroupAddress(this.getSetting('ga_switch'), value, 'DPT1')
            .catch((knxerror) => {
                this.log(knxerror)
            });
        }
    }
}

module.exports = KNXLight;