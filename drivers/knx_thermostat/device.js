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
    if (groupaddress === this.getStatusAddress('ga_temperature_target')) {
      this.setCapabilityValue('target_temperature', DatapointTypeParser.dpt9(data))
        .catch((knxerror) => {
          this.error('Set target_temperature error', knxerror);
        });
    }
    if (groupaddress === this.settings.ga_temperature_measure) {
      this.setCapabilityValue('measure_temperature', DatapointTypeParser.dpt9(data))
        .catch((knxerror) => {
          this.error('Set measure_temperature error', knxerror);
        });
    }
    if (groupaddress === this.getStatusAddress('ga_hvac_operating_mode')) {
      this.setCapabilityValue('hvac_operating_mode', DatapointTypeParser.dpt20(data).toString())
        .catch((knxerror) => {
          this.error('Set HVAC operating mode error', knxerror);
        });
    }
    if (groupaddress === this.getStatusAddress('ga_fan_speed')) {
      const speed = DatapointTypeParser.dim(data);
      this.setCapabilityValue('knx_fan_speed', speed)
        .then(() => {
          if (this.hasCapability('knx_fan_speed_step_defined')) {
            const closestLevel = Math.round(this.settings.fan_speed_steps * speed);
            this.homey.flow.getDeviceTriggerCard('knx_fan_speed_changed_with_step').trigger(this, { knx_fan_speed: closestLevel }).catch(this.error);
          }
        })
        .catch((knxerror) => {
          this.error('Set fan speed error', knxerror);
        });
    }
    if (groupaddress === this.getStatusAddress('ga_fan_auto_mode')) {
      this.setCapabilityValue('knx_fan_auto_mode', DatapointTypeParser.bitFormat(data))
        .catch((knxerror) => {
          this.error('Set fan auto mode error', knxerror);
        });
    }
  }

  onKNXConnection(connectionStatus) {
    super.onKNXConnection(connectionStatus);

    if (connectionStatus !== 'connected') {
      return;
    }
    // Reading the groupaddress will trigger an event on the bus.
    // This will be catched by onKNXEvent, hence the return value is not used.
    this.getTargetTemperature();
    this.getMeasuredTemperature();
    this.getHVACOperatingMode();
    this.getFanAutoMode();
    this.getFanSpeed();
  }

  getTargetTemperature() {
    if (!this.knxInterface) {
      return;
    }
    const statusAddress = this.getStatusAddress('ga_temperature_target');
    if (!statusAddress) {
      return;
    }
    this.knxInterface.readKNXGroupAddress(statusAddress)
      .catch(this.error);
  }

  onCapabilityTargetTemperature(value) {
    this.getMeasuredTemperature();
    if (!this.knxInterface || !this.settings.ga_temperature_target) {
      return null;
    }
    return this.knxInterface.writeKNXGroupAddress(this.settings.ga_temperature_target, value, 'DPT9.1')
      // Reread the target temperature after a timeout to prevent mismatch between KNX device and Homey
      .then(() => this.homey.setTimeout(this.getTargetTemperature.bind(this), 500))
      .catch((knxerror) => {
        this.error(knxerror);
        throw new Error(this.homey.__('errors.temperature_set_failed'));
      });
  }

  onCapabilityHVACOperatingMode(value, opts) {
    if (!this.knxInterface || !this.settings.ga_hvac_operating_mode) {
      return null;
    }
    return this.knxInterface.writeKNXGroupAddress(this.settings.ga_hvac_operating_mode, value, 'DPT20.102')
      // Reread the operating mode after a timeout to prevent mismatch between KNX device and Homey
      .then(() => this.homey.setTimeout(this.getTargetTemperature.bind(this), 500))
      .catch((knxerror) => {
        this.error(knxerror);
        throw new Error(this.homey.__('errors.hvac_operating_mode_set_failed'));
      });
  }

  getMeasuredTemperature() {
    if (!this.knxInterface || !this.settings.ga_temperature_measure) {
      return;
    }
    this.knxInterface.readKNXGroupAddress(this.settings.ga_temperature_measure)
      .catch(this.error);
  }

  getHVACOperatingMode() {
    const operatingModeStatusAddress = this.getStatusAddress('ga_hvac_operating_mode');
    if (!this.knxInterface || !operatingModeStatusAddress) {
      return;
    }
    this.knxInterface.readKNXGroupAddress(operatingModeStatusAddress)
      .catch((knxerror) => {
        this.error(knxerror);
      });
  }

  getFanSpeed() {
    const statusAddress = this.getStatusAddress('ga_fan_speed');
    if (!this.knxInterface || !statusAddress) {
      return;
    }
    this.knxInterface.readKNXGroupAddress(statusAddress)
      .catch(this.error);
  }

  onCapabilityFanSpeed(value) {
    if (!this.knxInterface || !this.settings.ga_fan_speed) {
      return null;
    }
    return this.knxInterface.writeKNXGroupAddress(this.settings.ga_fan_speed, value * 255, 'DPT5')
      .catch((knxerror) => {
        this.error(knxerror);
      });
  }

  getFanAutoMode() {
    const statusAddress = this.getStatusAddress('ga_fan_auto_mode');
    if (!this.knxInterface || !statusAddress) {
      return;
    }
    this.knxInterface.readKNXGroupAddress(statusAddress)
      .catch(this.error);
  }

  onCapabilityFanAutoMode(value) {
    if (!this.knxInterface || !this.settings.ga_fan_auto_mode) {
      return null;
    }
    return this.knxInterface.writeKNXGroupAddress(this.settings.ga_fan_auto_mode, value, 'DPT1.003')
      .catch((knxerror) => {
        this.error(knxerror);
      });
  }

}

module.exports = KNXThermostat;
