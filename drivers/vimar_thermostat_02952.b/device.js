'use strict';

const KNXGenericDevice = require('../../lib/GenericKNXDevice');
const DatapointTypeParser = require('../../lib/DatapointTypeParser');

//
// I am hating the way to do the shift calculation
// either we have to get all 8 combinations, and then keep track of summer/winter and mode, or
// keep track of actual setpoint and shift, and calculate the new shift based on the calculated base setpoint
//
class VimarThermostat02952BDevice extends KNXGenericDevice {

  onInit() {
    super.onInit();

    // Initialize variables
    this.currentSetpoint = undefined;
    this.currentSetpointShift = undefined;
    this.currentSetpointBase = undefined;

    this.registerCapabilityListener('target_temperature', this.onCapabilityTargetTemperature.bind(this));
    this.registerCapabilityListener('vimar_thermostat_mode', this.onCapabilityMode.bind(this));

    // Maybe this can be placed better during pairing?
    if (!this.settings.ga_summerwinter_state && this.hasCapability('summer_winter')) {
      this.removeCapability('summer_winter');
      this.knxInterface.removeKNXConnectionListener(this.settings.ga_summerwinter_state, this.KNXEventHandler);
    }
    if (!this.settings.ga_valve_heating_state && this.hasCapability('valve_heating')) {
      this.removeCapability('valve_heating');
      this.knxInterface.removeKNXConnectionListener(this.settings.ga_valve_heating_state, this.KNXEventHandler);
    }
    if (!this.settings.ga_valve_cooling_state && this.hasCapability('valve_cooling')) {
      this.removeCapability('valve_cooling');
      this.knxInterface.removeKNXConnectionListener(this.settings.ga_valve_cooling_state, this.KNXEventHandler);
    }
  }

  async onKNXEvent(groupaddress, data) {
    super.onKNXEvent(groupaddress, data);

    try {
      if (groupaddress === this.settings.ga_temperature_target) {
        this.currentSetpointShift = DatapointTypeParser.dpt9(data);
        setTimeout(() => {
          this.currentSetpointShift = undefined;
        }, 500);
      }
      if (groupaddress === this.settings.ga_temperature_target_actual) {
        this.currentSetpoint = DatapointTypeParser.dpt9(data);
        await this.setCapabilityValue('target_temperature', this.currentSetpoint);
        setTimeout(() => {
          this.currentSetpoint = undefined;
        }, 500);
      }

      if (this.currentSetpoint !== undefined && this.currentSetpointShift !== undefined) {
        this.currentSetpointBase = this.currentSetpoint - this.currentSetpointShift;
      }

      if (groupaddress === this.settings.ga_temperature_measure) {
        await this.setCapabilityValue('measure_temperature', DatapointTypeParser.dpt9(data));
      }
      if (groupaddress === this.settings.ga_valve_heating_state) {
        await this.setCapabilityValue('valve_heating', DatapointTypeParser.onoff(data));
      }
      if (groupaddress === this.settings.ga_valve_cooling_state) {
        await this.setCapabilityValue('valve_cooling', DatapointTypeParser.onoff(data));
      }
      if (groupaddress === this.settings.ga_summerwinter_state) {
        await this.setCapabilityValue('summer_winter', DatapointTypeParser.onoff(data) ? 'Winter' : 'Summer');
      }
      if (groupaddress === this.settings.ga_thermostat_mode_state) {
        if (this.settings.ga_temperature_measure) {
          await this.knxInterface.readKNXGroupAddress(this.settings.ga_temperature_measure);
        }
        if (this.settings.ga_temperature_target_actual) {
          await this.knxInterface.readKNXGroupAddress(this.settings.ga_temperature_target_actual);
        }

        await this.setCapabilityValue('vimar_thermostat_mode', `${DatapointTypeParser.dpt17(data)}`);
      }
    } catch (error) {
      this.log('Error in onKNXEvent', error);
    }
  }

  addKNXEventListeners(settings) {
    super.addKNXEventListeners(settings);

    // The ga_temperature_target and ga_temperature_measure are added by super
    this.knxInterface.addKNXEventListener(settings.ga_temperature_target_actual, this.KNXEventHandler);
    this.knxInterface.addKNXEventListener(settings.ga_thermostat_mode_state, this.KNXEventHandler);
    this.knxInterface.addKNXEventListener(settings.ga_summerwinter_state, this.KNXEventHandler);
    this.knxInterface.addKNXEventListener(settings.ga_valve_heating_state, this.KNXEventHandler);
    this.knxInterface.addKNXEventListener(settings.ga_valve_cooling_state, this.KNXEventHandler);
  }

  async onKNXConnection(connectionStatus) {
    super.onKNXConnection(connectionStatus);

    try {
      if (connectionStatus === 'connected') {
        // Reading the groupaddress will trigger a event on the bus.
        // This will be catched by onKNXEvent, hence the return value is not used.
        if (this.settings.ga_temperature_target) {
          await this.knxInterface.readKNXGroupAddress(this.settings.ga_temperature_target);
        }
        if (this.settings.ga_temperature_measure) {
          await this.knxInterface.readKNXGroupAddress(this.settings.ga_temperature_measure);
        }
        if (this.settings.ga_temperature_target_actual) {
          await this.knxInterface.readKNXGroupAddress(this.settings.ga_temperature_target_actual);
        }
        if (this.settings.ga_thermostat_mode_state) {
          await this.knxInterface.readKNXGroupAddress(this.settings.ga_thermostat_mode_state);
        }
        if (this.settings.ga_summerwinter_state) {
          await this.knxInterface.readKNXGroupAddress(this.settings.ga_summerwinter_state);
        }
        if (this.settings.ga_valve_heating_state) {
          await this.knxInterface.readKNXGroupAddress(this.settings.ga_valve_heating_state);
        }
        if (this.settings.ga_valve_cooling_state) {
          await this.knxInterface.readKNXGroupAddress(this.settings.ga_valve_cooling_state);
        }
      }
    } catch (knxerror) {
      this.log('Failed to read', knxerror);
    }
  }

  async onCapabilityMode(value, opts) {
    if (this.knxInterface && this.settings.ga_thermostat_mode) {
      try {
        await this.knxInterface.writeKNXGroupAddress(this.settings.ga_thermostat_mode, value, 'DPT17');
      } catch (knxerror) {
        this.log(knxerror);
        throw new Error(this.homey.__('errors.mode_set_failed'));
      }

      // Wait a bit before reading the temperature,
      // as the mode change will trigger a new setpoint
      // the knx lib has an issue when sending read requests too fast after a write,
      // it will actually send them before
      await (new Promise((resolve) => setTimeout(resolve, 400)));

      if (this.settings.ga_temperature_measure) {
        await this.knxInterface.readKNXGroupAddress(this.settings.ga_temperature_measure);
      }
      if (this.settings.ga_temperature_target_actual) {
        await this.knxInterface.readKNXGroupAddress(this.settings.ga_temperature_target_actual);
      }
    }
  }

  onCapabilityTargetTemperature(value, opts) {
    this.getMeasuredTemperature();
    if (this.knxInterface && this.settings.ga_temperature_target) {
      if (this.currentSetpointBase === undefined) {
        throw new Error('Actual setpoint and shift are unknown');
      }

      const newShift = value - this.currentSetpointBase;
      return this.knxInterface.writeKNXGroupAddress(this.settings.ga_temperature_target, newShift, 'DPT9.1')
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

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    await super.onSettings({ oldSettings, newSettings, changedKeys });

    if (!newSettings.ga_summerwinter_state && this.hasCapability('summer_winter')) {
      this.removeCapability('summer_winter');
      if (oldSettings.ga_summerwinter_state) {
        this.knxInterface.removeKNXConnectionListener(oldSettings.ga_summerwinter_state, this.KNXEventHandler);
      }
    } else if (newSettings.ga_summerwinter_state && !this.hasCapability('summer_winter')) {
      this.addCapability('summer_winter');
      this.knxInterface.addKNXEventListener(newSettings.ga_summerwinter_state, this.KNXEventHandler);
    }
    if (!newSettings.ga_valve_heating_state && this.hasCapability('valve_heating')) {
      this.removeCapability('valve_heating');
      if (oldSettings.ga_valve_heating_state) {
        this.knxInterface.removeKNXConnectionListener(oldSettings.ga_valve_heating_state, this.KNXEventHandler);
      }
    } else if (newSettings.ga_valve_heating_state && !this.hasCapability('valve_heating')) {
      this.addCapability('valve_heating');
      this.knxInterface.addKNXEventListener(newSettings.ga_valve_heating_state, this.KNXEventHandler);
    }
    if (!newSettings.ga_valve_cooling_state && this.hasCapability('valve_cooling')) {
      this.removeCapability('valve_cooling');
      if (oldSettings.ga_valve_cooling_state) {
        this.knxInterface.removeKNXConnectionListener(oldSettings.ga_valve_cooling_state, this.KNXEventHandler);
      }
    } else if (newSettings.ga_valve_cooling_state && !this.hasCapability('valve_cooling')) {
      this.addCapability('valve_cooling');
      this.knxInterface.addKNXEventListener(newSettings.ga_valve_cooling_state, this.KNXEventHandler);
    }
  }

}

module.exports = VimarThermostat02952BDevice;
