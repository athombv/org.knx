'use strict';

const KNXGenericDevice = require('../../lib/GenericKNXDevice');
const DatapointTypeParser = require('../../lib/DatapointTypeParser');

class KNXThermostat extends KNXGenericDevice {

  async onInit() {
    this.registerCapabilityListener('target_temperature', this.onCapabilityTargetTemperature.bind(this));
    if (typeof this.settings.ga_hvac_operating_mode === 'string' && this.settings.ga_hvac_operating_mode !== '') {
      await this.initOperatingModeCapability();
    } else {
      await this.removeCapabilityIfExists('hvac_operating_mode');
    }
    if (typeof this.settings.ga_fan_speed === 'string' && this.settings.ga_fan_speed !== '') {
      await this.initFanSpeedCapability();
    } else {
      await this.removeCapabilityIfExists('knx_fan_speed');
    }
    if (typeof this.settings.ga_fan_auto_mode === 'string' && this.settings.ga_fan_auto_mode !== '') {
      await this.initFanAutoModeCapability();
    } else {
      await this.removeCapabilityIfExists('knx_fan_auto_mode');
    }
    super.onInit();
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    if (changedKeys.includes('ga_hvac_operating_mode')) {
      if (typeof newSettings.ga_hvac_operating_mode === 'string' && newSettings.ga_hvac_operating_mode !== '') {
        await this.initOperatingModeCapability();
      } else {
        await this.removeCapabilityIfExists('hvac_operating_mode');
      }
    }
    if (changedKeys.includes('ga_fan_speed')) {
      if (typeof newSettings.ga_fan_speed === 'string' && newSettings.ga_fan_speed !== '') {
        await this.initFanSpeedCapability();
      } else {
        await this.removeCapabilityIfExists('knx_fan_speed');
      }
    } else if (changedKeys.includes('fan_speed_steps')) { // If the address was changed the update in fan speed steps is already handled
      if (typeof newSettings.fan_speed_steps === 'number' && newSettings.fan_speed_steps !== 0) {
        await this.addCapabilityIfNotExists('knx_fan_speed_step_defined');
        await this.removeCapabilityIfExists('knx_fan_speed_no_step_defined');
        this.setCapabilityOptions('knx_fan_speed', { step: 1 / newSettings.fan_speed_steps });
      } else {
        await this.addCapabilityIfNotExists('knx_fan_speed_no_step_defined');
        await this.removeCapabilityIfExists('knx_fan_speed_step_defined');
        this.setCapabilityOptions('knx_fan_speed', { step: 0.01 });
      }
    }
    if (changedKeys.includes('ga_fan_auto_mode')) {
      if (typeof newSettings.ga_fan_auto_mode === 'string' && newSettings.ga_fan_auto_mode !== '') {
        await this.initFanAutoModeCapability();
      } else if (this.hasCapability('knx_fan_auto_mode')) {
        await this.removeCapability('knx_fan_auto_mode').catch(this.error);
      }
    }
    await super.onSettings({ oldSettings, newSettings, changedKeys });
  }

  async initOperatingModeCapability() {
    await this.addCapabilityIfNotExists('hvac_operating_mode');
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

  async initFanSpeedCapability() {
    await this.addCapabilityIfNotExists('knx_fan_speed');
    if (typeof this.settings.fan_speed_steps === 'number' && this.settings.fan_speed_steps !== 0) {
      await this.addCapabilityIfNotExists('knx_fan_speed_step_defined');
      await this.removeCapabilityIfExists('knx_fan_speed_no_step_defined');
      this.setCapabilityOptions('knx_fan_speed', { step: 1 / this.settings.fan_speed_steps });
    } else {
      await this.addCapabilityIfNotExists('knx_fan_speed_no_step_defined');
      await this.removeCapabilityIfExists('knx_fan_speed_step_defined');
      this.setCapabilityOptions('knx_fan_speed', { step: 0.01 });
    }
    this.registerCapabilityListener('knx_fan_speed', this.onCapabilityFanSpeed.bind(this));
  }

  async initFanAutoModeCapability() {
    await this.addCapabilityIfNotExists('knx_fan_auto_mode');
    this.registerCapabilityListener('knx_fan_auto_mode', this.onCapabilityFanAutoMode.bind(this));
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
    // A thermostat can optionally have a different status address then the operating mode address
    let operatingModeStatusAddress = this.settings.ga_hvac_operating_mode;
    if (typeof this.settings.ga_hvac_operating_mode_status === 'string' && this.settings.ga_hvac_operating_mode_status !== '') {
      operatingModeStatusAddress = this.settings.ga_hvac_operating_mode_status;
    }
    if (groupaddress === operatingModeStatusAddress) {
      this.setCapabilityValue('hvac_operating_mode', DatapointTypeParser.dpt20(data).toString())
        .catch((knxerror) => {
          this.log('Set HVAC operating mode error', knxerror);
        });
    }
    // A thermostat can optionally have a different status address then the fan speed address
    let fanSpeedStatusAddress = this.settings.ga_fan_speed;
    if (typeof this.settings.ga_fan_speed_status === 'string' && this.settings.ga_fan_speed_status !== '') {
      fanSpeedStatusAddress = this.settings.ga_fan_speed_status;
    }
    if (groupaddress === fanSpeedStatusAddress) {
      const speed = DatapointTypeParser.dim(data);
      this.setCapabilityValue('knx_fan_speed', speed)
        .then(() => {
          if (this.hasCapability('knx_fan_speed_step_defined')) {
            const closestLevel = Math.round(this.settings.fan_speed_steps * speed);
            this.homey.flow.getDeviceTriggerCard('knx_fan_speed_changed_with_step').trigger(this, { knx_fan_speed: closestLevel }).catch(this.error);
          }
        })
        .catch((knxerror) => {
          this.log('Set fan speed error', knxerror);
        });
    }
    // A thermostat can optionally have a different status address then the operating mode address
    let fanAutoModeStatusAddress = this.settings.ga_fan_auto_mode;
    if (typeof this.settings.ga_fan_auto_mode_status === 'string' && this.settings.ga_fan_auto_mode_status !== '') {
      fanAutoModeStatusAddress = this.settings.ga_fan_auto_mode_status;
    }
    if (groupaddress === fanAutoModeStatusAddress) {
      this.setCapabilityValue('knx_fan_auto_mode', DatapointTypeParser.bitFormat(data))
        .catch((knxerror) => {
          this.log('Set fan auto mode error', knxerror);
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
      this.getHVACOperatingMode();
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
      const writePromise = this.knxInterface.writeKNXGroupAddress(this.settings.ga_hvac_operating_mode, value, 'DPT20.102')
        .catch((knxerror) => {
          this.log(knxerror);
          throw new Error(this.homey.__('errors.hvac_operating_mode_set_failed'));
        });

      // Reread the operating mode after a timeout to prevent mismatch between KNX device and Homey
      this.homey.setTimeout(this.getHVACOperatingMode.bind(this), 500);

      return writePromise;
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
    // A thermostat can optionally have a different status address then the operating mode address
    let operatingModeStatusAddress = this.settings.ga_hvac_operating_mode;
    if (typeof this.settings.ga_hvac_operating_mode_status === 'string' && this.settings.ga_hvac_operating_mode_status !== '') {
      operatingModeStatusAddress = this.settings.ga_hvac_operating_mode_status;
    }
    if (operatingModeStatusAddress) {
      this.knxInterface.readKNXGroupAddress(operatingModeStatusAddress)
        .catch((knxerror) => {
          this.log(knxerror);
          throw new Error(this.homey.__('errors.hvac_operating_mode_get_failed'));
        });
    }
  }

  getFanSpeed() {
    // A thermostat can optionally have a different status address then the fan speed address
    let statusAddress = this.settings.ga_fan_speed;
    if (typeof this.settings.ga_fan_speed_status === 'string' && this.settings.ga_fan_speed_status !== '') {
      statusAddress = this.settings.ga_fan_speed_status;
    }
    if (statusAddress) {
      this.knxInterface.readKNXGroupAddress(statusAddress)
        .catch((knxerror) => {
          this.log(knxerror);
        });
    }
  }

  onCapabilityFanSpeed(value) {
    if (this.knxInterface && this.settings.ga_fan_speed) {
      return this.knxInterface.writeKNXGroupAddress(this.settings.ga_fan_speed, value * 255, 'DPT5')
        .catch((knxerror) => {
          this.log(knxerror);
          throw new Error(this.homey.__('errors.fan_speed_set_failed'));
        });
    }
    return null;
  }

  getFanAutoMode() {
    // A thermostat can optionally have a different status address then the fan auto mode address
    let statusAddress = this.settings.ga_fan_auto_mode;
    if (typeof this.settings.ga_fan_auto_mode_status === 'string' && this.settings.ga_fan_auto_mode_status !== '') {
      statusAddress = this.settings.ga_fan_auto_mode_status;
    }
    if (statusAddress) {
      this.knxInterface.readKNXGroupAddress(statusAddress)
        .catch((knxerror) => {
          this.log(knxerror);
        });
    }
  }

  onCapabilityFanAutoMode(value) {
    if (this.knxInterface && this.settings.ga_fan_auto_mode) {
      return this.knxInterface.writeKNXGroupAddress(this.settings.ga_fan_auto_mode, value, 'DPT1.003')
        .catch((knxerror) => {
          this.log(knxerror);
          throw new Error(this.homey.__('errors.fan_auto_mode_set_failed'));
        });
    }
    return null;
  }

  async addCapabilityIfNotExists(capability) {
    if (!this.hasCapability(capability)) {
      await this.addCapability(capability).catch(this.error);
    }
  }

  async removeCapabilityIfExists(capability) {
    if (this.hasCapability(capability)) {
      await this.removeCapability(capability).catch(this.error);
    }
  }

}

module.exports = KNXThermostat;
