'use strict';

const KNXGenericDevice = require('../../lib/GenericKNXDevice');
const DatapointTypeParser = require('../../lib/DatapointTypeParser');

class KNXThermostat extends KNXGenericDevice {

  onInit() {
    super.onInit();
    this.registerCapabilityListener('target_temperature', this.onCapabilityTargetTemperature.bind(this));
    if (typeof this.settings.ga_heating_variable_correction === 'string' && this.settings.ga_heating_variable_correction !== '' ) {
      if (!this.hasCapability('heating_variable_correction')) {      
        this.addCapability('heating_variable_correction');
      }
    } else {
      if (this.hasCapability('heating_variable_correction')) {
        this.removeCapability('heating_variable_correction');
      }
    }
    if (typeof this.settings.ga_hvac_operating_mode === 'string' && this.settings.ga_hvac_operating_mode !== '' ) {
      if (!this.hasCapability('hvac_operating_mode')) {
        this.addCapability('hvac_operating_mode');
      }
      this.registerCapabilityListener('hvac_operating_mode', this.onCapabilityHVACOperatingMode.bind(this));
    } else {
      if (this.hasCapability('hvac_operating_mode')) {
        this.removeCapability('hvac_operating_mode');
      }
    }
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
    if (groupaddress === this.settings.ga_heating_variable_correction) {
      this.setCapabilityValue('heating_variable_correction', DatapointTypeParser.byteUnsigned(data))
        .catch((knxerror) => {
          this.log('Set heating_variable_correction error', knxerror);
        });
    }    
    if (groupaddress === this.settings.ga_hvac_operating_mode) {
      this.setCapabilityValue('hvac_operating_mode', DatapointTypeParser.dpt20(data).toString())
        .catch((knxerror) => {
          this.log('Set HVAC operating mode error', knxerror);
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
      if (this.settings.ga_hvac_operating_mode) {
        this.knxInterface.readKNXGroupAddress(this.settings.ga_hvac_operating_mode)
          .catch((knxerror) => {
            this.log(knxerror);
          });
      }
      if (this.settings.ga_heating_variable_correction) {
        this.knxInterface.readKNXGroupAddress(this.settings.ga_heating_variable_correction)
          .catch((knxerror) => {
            this.log(knxerror);
          });
      }      
    }
  }

  onCapabilityTargetTemperature(value) {
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

  onCapabilityHVACOperatingMode(value, opts) {
    if (this.knxInterface && this.settings.ga_hvac_operating_mode) {
      return this.knxInterface.writeKNXGroupAddress(this.settings.ga_hvac_operating_mode, value, 'DPT20.102')
        .catch((knxerror) => {
          this.log(knxerror);
          throw new Error(this.homey.__('errors.hvac_operating_mode_set_failed'));
        });
    }
    return null;
  }

  getMeasuredTemperature() {
    if (this.settings.ga_temperature_measure) {
      this.knxInterface.readKNXGroupAddress(this.settings.ga_temperature_measure)
        .catch((knxerror) => {
          this.error(knxerror);
          // throw new Error(this.homey.__('errors.measure_temperature_get_failed'));
        });
    }
  }

  getHeatingVariableCorrecting() {
    if (this.settings.ga_heating_variable_correction) {
      this.knxInterface.readKNXGroupAddress(this.settings.ga_heating_variable_correction)
        .catch((knxerror) => {
          this.log(knxerror);
          throw new Error(this.homey.__('errors.heating_variable_correction_get_failed'));
        });
    }    
  }

  getHVACOperatingMode() {
    if (this.settings.ga_hvac_operating_mode) {
      this.knxInterface.readKNXGroupAddress(this.settings.ga_hvac_operating_mode)
        .catch((knxerror) => {
          this.log(knxerror);
          throw new Error(this.homey.__('errors.hvac_operating_mode_get_failed'));
    }
  }

}

module.exports = KNXThermostat;
