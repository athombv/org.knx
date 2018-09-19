'use strict';

const KNXGeneric = require('./../../lib/generic_knx_device.js');
const DatapointTypeParser = require('./../../lib/DatapointTypeParser.js');

class KNXDimmer extends KNXGeneric {
    onInit() {
        super.onInit();
        this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
        this.registerCapabilityListener('dim', this.onCapabilityDim.bind(this));
    }

    onKNXEvent(groupaddress, data) {
        if (groupaddress === this.settings.ga_status) {
            this.setCapabilityValue('onoff', DatapointTypeParser.onoff(data));
        }
        if (groupaddress === this.settings.ga_dim_status) {
            this.setCapabilityValue('dim', DatapointTypeParser.dim(data));
        }
    }

    onKNXConnection() {
        // Reading the groupaddress will trigger a event on the bus.
        // This will be catched by onKNXEvent, hence the return value is not used.
        if (this.knxInterface) {
            if (this.settings.ga_status) {
                this.knxInterface.readKNXGroupAddress(this.settings.ga_status)
                .catch((knxerror) => {
                    this.log(knxerror);
                });
            }
            if (this.settings.ga_dim_status) {
                this.knxInterface.readKNXGroupAddress(this.settings.ga_dim_status)
                .catch((knxerror) => {
                    this.log(knxerror);
                });
            }
        }
    }

    onCapabilityOnoff(value, opts) {
        if(this.knxInterface && this.settings.ga_switch) {
            return this.knxInterface.writeKNXGroupAddress(this.settings.ga_switch, value, 'DPT1')
            .catch((knxerror) => {
                this.log(knxerror);
                throw new Error(Homey.__("errors.switch_failed"));
            });
        }
    }

    onCapabilityDim(value, opts) {
        if(this.knxInterface && this.settings.ga_dim) {
            if (value > 0) {
                this.setCapabilityValue('onoff', true);
            } else {
                this.setCapabilityValue('onoff', false);
            }
            return this.knxInterface.writeKNXGroupAddress(this.settings.ga_dim, value * 255, 'DPT5')
            .catch( (knxerror) => {
                this.log(knxerror);
                throw new Error(Homey.__("errors.dim_failed"));
            });
        }
    }
}

module.exports = KNXDimmer;