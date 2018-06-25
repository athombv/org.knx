'use strict';

const KNXGeneric = require('./../../lib/generic_knx_device.js');
const DatapointTypeParser = require('./../../lib/DatapointTypeParser.js');

class KNXWindowCovering extends KNXGeneric {
    onInit() {
        super.onInit();
        this.log('KNX Windowcovering init');
        this.registerCapabilityListener('windowcoverings_state', this.onCapabilityWindowCovering.bind(this));
    }

    onKNXEvent(groupaddress, data) {
        if (groupaddress === this.settings.ga_status) {
            //this.setCapabilityValue('windowcoverings_state', DatapointTypeParser.upstopdown(data));
        }
    }

    onCapabilityWindowCovering(value, opts) {
        if (this.knxInterface) {
            switch(value) {
                case 'up':
                    if (this.settings.invert_updown === true) {
                        return this.knxInterface.writeKNXGroupAddress(this.settings.ga_up_down, 1, 'DPT1')
                        .catch((knxerror) => {
                            this.log(knxerror)
                        });
                    }
                    return this.knxInterface.writeKNXGroupAddress(this.settings.ga_up_down, 0, 'DPT1')
                    .catch((knxerror) => {
                        this.log(knxerror)
                    });
                case 'down':
                    if (this.settings.invert_updown === true) {
                        return this.knxInterface.writeKNXGroupAddress(this.settings.ga_up_down, 0, 'DPT1')
                        .catch((knxerror) => {
                            this.log(knxerror)
                        });
                    }
                    return this.knxInterface.writeKNXGroupAddress(this.settings.ga_up_down, 1, 'DPT1')
                    .catch((knxerror) => {
                        this.log(knxerror)
                    });
            }
        }
    }
}

module.exports = KNXWindowCovering;