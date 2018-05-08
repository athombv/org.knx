'use strict';

const Homey = require('homey');
const KNXGeneric = require('./../../lib/generic_knx_device.js');
const DatapointTypeParser = require('./../../lib/DatapointTypeParser.js');

class KNXSwitch extends KNXGeneric {
    // this method is called when the Device is inited
    
    onInit() {
        super.onInit();
        this.log('KNX switch init');
        this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
    }

    onKNXEvent(groupaddress, data) {
        if (groupaddress === this.getSetting('ga_status')) {
            this.setCapabilityValue('onoff', DatapointTypeParser.onoff(data));
        }
    }

    onKNXConnection() {
        this.knxInterface.readKNXGroupAddress(this.getSetting('ga_status'));
    }

    onCapabilityOnoff(value, opts) {
        return this.knxInterface.writeKNXGroupAddress(this.getSetting('ga_switch'), value, 'DPT1')
        .catch((knxerror) => {
            this.log(knxerror);
            // gooi later een error naar de interface
            //throw new Error('switching_failed');
        });
    }
}

module.exports = KNXSwitch;