'use strict';

const KNXGenericDevice = require('../../lib/GenericKNXDevice');
const DatapointTypeParser = require('../../lib/DatapointTypeParser');

class KNXThermostat extends KNXGenericDevice {

  onInit() {
    super.onInit();
    this.registerCapabilityListener('target_temperature', this.onCapabilityTargetTemperature.bind(this));
    if (typeof this.settings.ga_hvac_operating_mode === 'string' && this.settings.ga_hvac_operating_mode !== '') {
      this.initOperatingModeCapability();
    } else if (this.hasCapability('hvac_operating_mode')) {
      this.removeCapability('hvac_operating_mode').catch(this.error);
    }
  }

  onSettings({ oldSettings, newSettings, changedKeys }) {
    if (changedKeys.includes('ga_hvac_operating_mode')) {
      if (typeof newSettings.ga_hvac_operating_mode === 'string' && newSettings.ga_hvac_operating_mode !== '') {
        this.initOperatingModeCapability();
      } else if (this.hasCapability('hvac_operating_mode')) {
        this.removeCapability('hvac_operating_mode').catch(this.error);
      }
    }
  }

  initOperatingModeCapability() {
    if (!this.hasCapability('hvac_operating_mode')) {
      this.addCapability('hvac_operating_mode').catch(this.error);
    }
    this.registerCapabilityListener('hvac_operating_mode', this.onCapabilityHVACOperatingMode.bind(this));
    // Register actions for flows
    this.homey.flow.getActionCard('change_hvac_mode')
      .registerRunListener((args, state) => {
        return args.device.setCapabilityValue('hvac_operating_mode', args.mode)
          .then(() => {
            return args.device.triggerCapabilityListener('hvac_operating_mode', args.mode, {});
          });
      });
  }

  onKNXEvent(groupaddress, data) {
    super.onKNXEvent(groupaddress, data);
    // A thermostat can optionally have a different status address then the target temperature address
    let targetTemperatureStatusAddress = this.settings.ga_temperature_target;
    if (typeof this.settings.ga_temperature_target_status === 'string' && this.settings.ga_temperature_target_status !== '') {
      targetTemperatureStatusAddress = this.settings.ga_temperature_target_status;
    }
    if (groupaddress === targetTemperatureStatusAddress) {
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
      // Reading the groupaddress will trigger an event on the bus.
      // This will be catched by onKNXEvent, hence the return value is not used.
      this.getTargetTemperature();
      this.getMeasuredTemperature();
      if (this.settings.ga_hvac_operating_mode) {
        this.knxInterface.readKNXGroupAddress(this.settings.ga_hvac_operating_mode)
          .catch((knxerror) => {
            this.log(knxerror);
          });
      }
    }
  }

  getTargetTemperature() {
    // A thermostat can optionally have a different status address then the target temperature address
    let statusAddress = this.settings.ga_temperature_target;
    if (typeof this.settings.ga_temperature_target_status === 'string' && this.settings.ga_temperature_target_status !== '') {
      statusAddress = this.settings.ga_temperature_target_status;
    }
    if (statusAddress) {
      this.knxInterface.readKNXGroupAddress(statusAddress)
        .catch((knxerror) => {
          this.log(knxerror);
        });
    }
  }

  onCapabilityTargetTemperature(value) {
    this.getMeasuredTemperature();
    if (this.knxInterface && this.settings.ga_temperature_target) {
      const writePromise = this.knxInterface.writeKNXGroupAddress(this.settings.ga_temperature_target, value, 'DPT9.1')
        .catch((knxerror) => {
          this.log(knxerror);
          throw new Error(this.homey.__('errors.temperature_set_failed'));
        });
      // Reread the target temperature after a timeout to prevent mismatch between KNX device and Homey
      this.homey.setTimeout(this.getTargetTemperature.bind(this), 500);
      return writePromise;
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
    if (this.knxInterface && this.settings.ga_temperature_measure) {
      this.knxInterface.readKNXGroupAddress(this.settings.ga_temperature_measure)
        .catch((knxerror) => {
          this.error(knxerror);
          // throw new Error(this.homey.__('errors.measure_temperature_get_failed'));
        });
    }
  }

  getHVACOperatingMode() {
    if (this.settings.ga_hvac_operating_mode) {
      this.knxInterface.readKNXGroupAddress(this.settings.ga_hvac_operating_mode)
        .catch((knxerror) => {
          this.log(knxerror);
          throw new Error(this.homey.__('errors.hvac_operating_mode_get_failed'));
        });
    }
  }

}

module.exports = KNXThermostat;
