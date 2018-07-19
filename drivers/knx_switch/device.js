'use strict';
const KNXGeneric = require('./../../lib/generic_knx_device.js');
const DatapointTypeParser = require('./../../lib/DatapointTypeParser.js');

class KNXSwitch extends KNXGeneric {    
    onInit() {
        super.onInit();
        this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
    }

    onKNXEvent(groupaddress, data) {
        if (groupaddress === this.settings.ga_switch) {
            this.setCapabilityValue('onoff', DatapointTypeParser.onoff(data));
        }
    }

    onKNXConnection() {
        // check if there is a correct IP interface and a status address
        if (this.knxInterface && this.settings.ga_switch) {
            this.knxInterface.readKNXGroupAddress(this.settings.ga_switch) //switches don't have a seperate status address
            .catch((knxerror) => {
                this.log(knxerror);
            });
        }
    }

    onCapabilityOnoff(value, opts) {
        if (this.knxInterface && this.settings.ga_switch) {
            if (this.settings.inverted === true) {
                return this.knxInterface.writeKNXGroupAddress(this.settings.ga_switch, !value, 'DPT1')
                .catch((knxerror) => {
                    this.log(knxerror)
                });
            } else {
                return this.knxInterface.writeKNXGroupAddress(this.settings.ga_switch, value, 'DPT1')
                .catch((knxerror) => {
                    this.log(knxerror)
                });
            }
        }
    }
}

module.exports = KNXSwitch;