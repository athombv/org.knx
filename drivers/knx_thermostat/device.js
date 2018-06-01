'use strict';

const Homey = require('homey');
const KNXGeneric = require('./../../lib/generic_knx_device.js');
const DatapointTypeParser = require('./../../lib/DatapointTypeParser.js');

class KNXThermostat extends KNXGeneric {
    // this method is called when the Device is inited
    
    onInit() {
        super.onInit();
        this.log('KNX thermostat init');
        this.registerCapabilityListener('target_temperature', this.onCapabilityTargetTemperature.bind(this));
        this.registerCapabilityListener('measure_temperature', this.onCapabilityMeasureTemperature.bind(this));
    }

    onKNXEvent(groupaddress, data) {
        if (groupaddress === this.getSetting('ga_temperature_target')) {
            this.setCapabilityValue('target_temperature', DatapointTypeParser.temperature(data));
        }
        if (groupaddress === this.getSetting('ga_temperature_measure')) {
            this.setCapabilityValue('measure_temperature', DatapointTypeParser.temperature(data));
        }
    }

    onKNXConnection() {
        // Reading the groupaddress will trigger a event on the bus.
        // This will be catched by onKNXEvent, hence the return value is not used.
        if (this.knxInterface) {
            if (this.getSetting('ga_temperature_target')) {
                this.knxInterface.readKNXGroupAddress(this.getSetting('ga_temperature_target'))
                .catch((knxerror) => {
                    this.log(knxerror);
                });
            }
            if (this.getSetting('ga_temperature_measure')) {
                this.knxInterface.readKNXGroupAddress(this.getSetting('ga_temperature_measure'))
                .catch((knxerror) => {
                    this.log(knxerror);
                });
            }
        }
    }

    onCapabilityTargetTemperature(value, opts) {
        this.log('target temp', value);
        if(this.knxInterface && this.getSetting('ga_temperature_target')) {
            return this.knxInterface.writeKNXGroupAddress(this.getSetting('ga_temperature_target'), value, 'DPT9')
            .catch((knxerror) => {
                this.log(knxerror);
                throw new Error('Setting temperature to KNX failed!');
            });
        }
    }

    onCapabilityMeasureTemperature(value, opts) {
        this.log('measure', value);
        if (this.getSetting('ga_temperature_measure')) {
            var currentTemperature = this.knxInterface.readKNXGroupAddress(this.getSetting('ga_temperature_measure'))
            .catch((knxerror) => {
                this.log(knxerror);
            });
        }
        this.setCapabilityValue('measure_temperature', DatapointTypeParser.temperature(currentTemperature));
    }
}

module.exports = KNXThermostat;