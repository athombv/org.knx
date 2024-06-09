'use strict';

const KNXGenericDevice = require('../../lib/GenericKNXDevice');
const DatapointTypeParser = require('../../lib/DatapointTypeParser');

class VimarThermostat02952B extends KNXGenericDevice {

  onInit() {
    super.onInit();
    this.registerCapabilityListener('target_temperature', this.onCapabilityTargetTemperature.bind(this));
  }

  onKNXEvent(groupaddress, data) {
    super.onKNXEvent(groupaddress, data);
    if (groupaddress === this.settings.ga_temperature_target) {
      this.setCapabilityValue('target_temperature', DatapointTypeParser.dpt9(data))
        .catch((knxerror) => {
          this.log('Set target_temperature error', knxerror);
        });
    }
    if (groupaddress === this.settings.ga_temperature_measure) {
      this.setCapabilityValue('measure_temperature', DatapointTypeParser.dpt9(data))
        .catch((knxerror) => {
          this.log('Set measure_temperature error', knxerror);
        });
    }
  }

  onKNXConnection(connectionStatus) {
    super.onKNXConnection(connectionStatus);

    if (connectionStatus === 'connected') {
      // Reading the groupaddress will trigger a event on the bus.
      // This will be catched by onKNXEvent, hence the return value is not used.
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
    if (this.knxInterface && this.settings.ga_temperature_target) {
      return this.knxInterface.writeKNXGroupAddress(this.settings.ga_temperature_target, value, 'DPT9.1')
        .catch((knxerror) => {
          this.log(knxerror);
          throw new Error(this.homey.__('errors.temperature_set_failed'));
        });
    }
    return null;
  }

  getMeasuredTemperature() {
    if (this.settings.ga_temperature_measure) {
      this.knxInterface.readKNXGroupAddress(this.settings.ga_temperature_measure)
        .catch((knxerror) => {
          this.log(knxerror);
          throw new Error(this.homey.__('errors.temperature_get_failed'));
        });
    }
  }

}

module.exports = KNXThermostat;
