'use strict';

const Homey = require('homey');
const KNXGeneric = require('./../../lib/generic_knx_device.js');
const DatapointTypeParser = require('./../../lib/DatapointTypeParser.js');

class KNXWindowCovering extends KNXGeneric {
    // this method is called when the Device is inited
    
    onInit() {
        super.onInit();
        this.log('KNX Windowcovering init');
        this.registerCapabilityListener('windowcoverings_state', this.onCapabilityWindowCovering.bind(this));
    }

    onKNXEvent(groupaddress, data) {
        if (groupaddress === this.getSetting('ga_status')) {
            //this.setCapabilityValue('windowcoverings_state', DatapointTypeParser.onoff(data));
        }
    }

    onCapabilityWindowCovering(value, opts) {
        console.log(value);
        if (this.knxInterface) {
            switch(value) {
                case 'up':
                    return this.knxInterface.writeKNXGroupAddress(this.getSetting('ga_switch'), 0, 'DPT1');
                    break;
                case 'down':
                    return this.knxInterface.writeKNXGroupAddress(this.getSetting('ga_switch'), 1, 'DPT1')
            }
        }
    }
}

module.exports = KNXWindowCovering;