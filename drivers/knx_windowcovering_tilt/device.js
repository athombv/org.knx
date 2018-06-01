'use strict';

const Homey = require('homey');
const KNXGeneric = require('./../../lib/generic_knx_device.js');
const DatapointTypeParser = require('./../../lib/DatapointTypeParser.js');

class KNXWindowCoveringTilt extends KNXGeneric {
    // this method is called when the Device is inited
    
    onInit() {
        super.onInit();
        this.log('KNX Windowcovering tilt init');
        this.registerCapabilityListener('windowcoverings_state', this.onCapabilityState.bind(this));
        this.registerCapabilityListener('windowcoverings_tilt_up', this.onCapabilityTiltUp.bind(this));
        this.registerCapabilityListener('windowcoverings_tilt_down', this.onCapabilityTiltDown.bind(this));
        this.registerCapabilityListener('windowcoverings_tilt_set', this.onCapabilityTiltSet.bind(this));
    }

    onKNXEvent(groupaddress, data) {
        if (groupaddress === this.getSetting('ga_status')) {
            //this.setCapabilityValue('windowcoverings_state', DatapointTypeParser.upstopdown(data));
        }
    }

    onCapabilityState(value, opts) {
        this.log(value);
        if (this.knxInterface && this.getSetting('ga_up_down')) {
            switch(value) {
                case 'up':
                    return this.knxInterface.writeKNXGroupAddress(this.getSetting('ga_up_down'), 0, 'DPT1')
                    .catch((knxerror) => {
                        this.log(knxerror)
                    });
                    break;
                case 'down':
                    return this.knxInterface.writeKNXGroupAddress(this.getSetting('ga_up_down'), 1, 'DPT1')
                    .catch((knxerror) => {
                        this.log(knxerror)
                    });
                    break;
                case 'idle':
                    // no way to implement this with binary KNX types.
                    this.log('windowcovering idle, not implemented yet');
                    break;
            }
        }
    }

    onCapabilityTiltUp(value, opts) {
        this.log('tilt up', value, opts);
    }
    
    onCapabilityTiltDown(value, opts) {
        this.log('tilt down', value, opts);
    }

    onCapabilityTiltSet(value, opts) {
        this.log('tilt set', value, opts);
    }
}

module.exports = KNXWindowCoveringTilt;