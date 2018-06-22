'use strict';

const KNXGeneric = require('./../../lib/generic_knx_device.js');
const DatapointTypeParser = require('./../../lib/DatapointTypeParser.js');

class KNXLight extends KNXGeneric {
    onInit() {
        super.onInit();
        this.log('KNX Light init');
        this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
    }

    onKNXEvent(groupaddress, data) {
        if (groupaddress === this.settings.ga_status) {
            this.setCapabilityValue('onoff', DatapointTypeParser.onoff(data));
        }
    }

    onKNXConnection() {
        // check if there is a correct IP interface and a status address
        if (this.knxInterface && this.settings.ga_status) {
            this.knxInterface.readKNXGroupAddress(this.settings.ga_status)
            .catch((knxerror) => {
                this.log(knxerror);
            });
        }
    }

    onCapabilityOnoff(value, opts) {
        if (this.knxInterface && this.settings.ga_switch) {
            return this.knxInterface.writeKNXGroupAddress(this.settings.ga_switch, value, 'DPT1')
            .catch((knxerror) => {
                this.log(knxerror);
                throw new Error('Switching the device failed!');
            });
        }
    }
}

module.exports = KNXLight;