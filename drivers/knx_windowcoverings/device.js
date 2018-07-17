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
            const state = DatapointTypeParser.onoff(data);
            if (state) {
                if (this.settings.invert_updown === true) {
                    this.setCapabilityValue('windowcoverings_state', 'up');
                } else {
                    this.setCapabilityValue('windowcoverings_state', 'down');
                }
            } else {
                if (this.settings.invert_updown === true) {
                    this.setCapabilityValue('windowcoverings_state', 'down');
                } else {
                    this.setCapabilityValue('windowcoverings_state', 'up');
                }
            }
            this.log(state);
        }
    }

    onCapabilityWindowCovering(value, opts) {
        this.log(value);
        if (this.knxInterface) {
            switch(value) {
                case 'up':
                    if (this.settings.ga_stop) {this.knxInterface.writeKNXGroupAddress(this.settings.ga_stop, 0, 'DPT1')}

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
                    if (this.settings.ga_stop) {this.knxInterface.writeKNXGroupAddress(this.settings.ga_stop, 0, 'DPT1')}
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
                case 'idle':
                    this.log('stop selected, stop address', this.settings.ga_stop);
                    if(this.settings.ga_stop) {
                        return this.knxInterface.writeKNXGroupAddress(this.settings.ga_stop, 1, 'DPT1')
                        .catch((knxerror) => {
                            this.log(knxerror);
                        })
                    }
            }
        }
    }
}

module.exports = KNXWindowCovering;