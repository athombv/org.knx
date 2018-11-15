'use strict';
const KNXGeneric = require('./../../lib/generic_knx_device.js');
const DatapointTypeParser = require('./../../lib/DatapointTypeParser.js');

class KNXSwitch extends KNXGeneric {    
    onInit() {
        super.onInit();
        this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
    }

    onKNXEvent(groupaddress, data) {
        super.onKNXEvent(groupaddress, data);
        if (groupaddress === this.settings.ga_switch) {
            this.setCapabilityValue('onoff', DatapointTypeParser.onoff(data));
        }
    }

    onKNXConnection() {
        super.onKNXConnection(connectionStatus);

        if (connectionStatus === 'connected') {
            // Reading the groupaddress will trigger a event on the bus.
            // This will be catched by onKNXEvent, hence the return value is not used.
            if (this.settings.ga_switch) {
                this.knxInterface.readKNXGroupAddress(this.settings.ga_switch) //switches don't have a seperate status address
                .catch((knxerror) => {
                    this.log(knxerror);
                });
            }
        }
    }

    onCapabilityOnoff(value, opts) {
        this.log('switching device', value);
        if (this.knxInterface && this.settings.ga_switch) {
            if (this.settings.inverted === true) {
                return this.knxInterface.writeKNXGroupAddress(this.settings.ga_switch, !value, 'DPT1')
                .catch((knxerror) => {
                    this.log(knxerror);
                    throw new Error(Homey.__("errors.switch_failed"));
                });
            } else {
                return this.knxInterface.writeKNXGroupAddress(this.settings.ga_switch, value, 'DPT1')
                .catch((knxerror) => {
                    this.log(knxerror);
                    throw new Error(Homey.__("errors.switch_failed"));
                });
            }
        }
    }
}

module.exports = KNXSwitch;