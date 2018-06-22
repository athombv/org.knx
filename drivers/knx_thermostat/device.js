'use strict';

const KNXGeneric = require('./../../lib/generic_knx_device.js');
const DatapointTypeParser = require('./../../lib/DatapointTypeParser.js');

class KNXThermostat extends KNXGeneric {
    onInit() {
        super.onInit();
        this.log('KNX thermostat init');
        this.registerCapabilityListener('target_temperature', this.onCapabilityTargetTemperature.bind(this));
    }

    onKNXEvent(groupaddress, data) {
        this.log('event', data);
        if (groupaddress === this.settings.ga_temperature_target) {
            this.setCapabilityValue('target_temperature', DatapointTypeParser.temperature(data));
        }
        if (groupaddress === this.settings.ga_temperature_measure) {
            this.setCapabilityValue('measure_temperature', DatapointTypeParser.temperature(data));
        }
    }

    onKNXConnection() {
        // Reading the groupaddress will trigger a event on the bus.
        // This will be catched by onKNXEvent, hence the return value is not used.
        if (this.knxInterface) {
            if (this.settings.ga_temperature_target) {
                this.knxInterface.readKNXGroupAddress(this.settings.ga_temperature_target)
                .catch((knxerror) => {
                    this.log(knxerror);
                });
            }
            if (this.settings.ga_temperature_measure) {
                this.knxInterface.readKNXGroupAddress(this.settings.ga_temperature_measure)
                .catch((knxerror) => {
                    this.log(knxerror);
                });
            }
        }
    }

    onCapabilityTargetTemperature(value, opts) {
        this.getMeasuredTemperature();
        if(this.knxInterface && this.settings.ga_temperature_target) {
            return this.knxInterface.writeKNXGroupAddress(this.settings.ga_temperature_target, value, 'DPT9.1')
            .catch((knxerror) => {
                this.log(knxerror);
                throw new Error('Setting temperature to KNX failed!');
            });
        }
    }

    getMeasuredTemperature() {
        if (this.settings.ga_temperature_measure) {
            this.knxInterface.readKNXGroupAddress(this.settings.ga_temperature_measure)
            .catch((knxerror) => {
                this.log(knxerror);
            });
        }
    }
}

module.exports = KNXThermostat;