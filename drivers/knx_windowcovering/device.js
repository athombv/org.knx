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
            //this.setCapabilityValue('windowcoverings_state', DatapointTypeParser.upstopdown(data));
        }
    }

    onCapabilityWindowCovering(value, opts) {
        if (this.knxInterface) {
            switch(value) {
                case 'up':
                    return Promise.all([
                        this.knxInterface.writeKNXGroupAddress(this.getSetting('ga_stop'), 0, 'DPT1'),
                        this.knxInterface.writeKNXGroupAddress(this.getSetting('ga_up_down'), 0, 'DPT1')
                    ])
                    .catch((knxerror) => {
                        //this.log(knxerror)
                    });
                    break;
                case 'down':
                    return Promise.all([
                        this.knxInterface.writeKNXGroupAddress(this.getSetting('ga_stop'), 0, 'DPT1'),
                        this.knxInterface.writeKNXGroupAddress(this.getSetting('ga_up_down'), 1, 'DPT1')
                    ])
                    .catch((knxerror) => {
                        //this.log(knxerror)
                    });
                    break;
                case 'idle':
                    return this.knxInterface.writeKNXGroupAddress(this.getSetting('ga_stop'), 1, 'DPT1')
                    .catch((knxerror) => {
                        //this.log(knxerror)
                    });
                    break;
            }
        }
    }
}

module.exports = KNXWindowCovering;