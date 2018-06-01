'use strict';

const Homey = require('homey');
const KNXGeneric = require('./../../lib/generic_knx_device.js');
const DatapointTypeParser = require('./../../lib/DatapointTypeParser.js');

class KNXDimmer extends KNXGeneric {
    // this method is called when the Device is inited
    
    onInit() {
        super.onInit();
        this.log('KNX switch init');
        this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
        this.registerCapabilityListener('dim', this.onCapabilityDim.bind(this));
    }

    onKNXEvent(groupaddress, data) {
        if (groupaddress === this.getSetting('ga_status')) {
            this.setCapabilityValue('onoff', DatapointTypeParser.onoff(data));
        }
        if (groupaddress === this.getSetting('ga_dim_status')) {
            this.setCapabilityValue('dim', DatapointTypeParser.dim(data));
        }
    }

    onKNXConnection() {
        // Reading the groupaddress will trigger a event on the bus.
        // This will be catched by onKNXEvent, hence the return value is not used.
        if (this.knxInterface) {
            if (this.getSetting('ga_status')) {
                this.knxInterface.readKNXGroupAddress(this.getSetting('ga_status'))
                .catch((knxerror) => {
                    this.log(knxerror);
                });
            }
            if (this.getSetting('ga_dim_status')) {
                this.knxInterface.readKNXGroupAddress(this.getSetting('ga_dim_status'))
                .catch((knxerror) => {
                    this.log(knxerror);
                });
            }
        }
    }

    onCapabilityOnoff(value, opts) {
        if(this.knxInterface && this.getSetting('ga_switch')) {
            return this.knxInterface.writeKNXGroupAddress(this.getSetting('ga_switch'), value, 'DPT1')
            .catch((knxerror) => {
                this.log(knxerror);
                throw new Error('Switching the device failed!');
            });
        }
    }

    onCapabilityDim(value, opts) {
        if(this.knxInterface && this.getSetting('ga_dim')) {
            if (value > 0) {
                this.setCapabilityValue('onoff', true);
            } else {
                this.setCapabilityValue('onoff', false);
            }
            return this.knxInterface.writeKNXGroupAddress(this.getSetting('ga_dim'), value * 255, 'DPT5')
            .catch( (knxerror) => {
                this.log(knxerror);
                throw new Error('Dimming the device failed!');
            });
        }
    }
}

module.exports = KNXDimmer;