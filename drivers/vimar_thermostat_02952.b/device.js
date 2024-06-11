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

    this.registerCapabilityListener('target_temperature', this.onCapabilityTargetTemperature.bind(this));
    this.registerCapabilityListener('vimar_thermostat_mode', this.onCapabilityMode.bind(this));

    const setWindowSwitchAction = this.homey.flow.getActionCard('set-window-switch');
    setWindowSwitchAction.registerRunListener(async (args, state) => {
      return this.knxInterface.writeKNXGroupAddress(this.settings.ga_window_switch, args.open, 'DPT1')
        .catch((knxerror) => {
          this.log(knxerror);
          throw new Error(this.homey.__('errors.window_switch_failed'));
        });
    });
  }

  onKNXEvent(groupaddress, data) {
    super.onKNXEvent(groupaddress, data);
    if (groupaddress === this.settings.ga_temperature_target) {
      this.currentSetpointShift = DatapointTypeParser.dpt9(data);
    }
    if (groupaddress === this.settings.ga_temperature_target_actual) {
      this.currentSetpoint = DatapointTypeParser.dpt9(data);
      this.setCapabilityValue('target_temperature', this.currentSetpoint)
        .catch((knxerror) => {
          this.log('Set target_temperature error', knxerror);
        });
    }
    if (groupaddress === this.settings.ga_temperature_measure) {
      this.setCapabilityValue('measure_temperature', DatapointTypeParser.dpt9(data))
        .catch((knxerror) => this.log('Set measure_temperature error', knxerror));
    }
    if (groupaddress === this.settings.ga_valve_heating_state) {
      this.setCapabilityValue('valve_heating', DatapointTypeParser.onoff(data))
        .catch((knxerror) => this.log('Set valve_heating error', knxerror));
    }
    if (groupaddress === this.settings.ga_valve_cooling_state) {
      this.setCapabilityValue('valve_cooling', DatapointTypeParser.onoff(data))
        .catch((knxerror) => this.log('Set valve_cooling error', knxerror));
    }
    if (groupaddress === this.settings.ga_summerwinter_state) {
      this.setCapabilityValue('summer_winter', DatapointTypeParser.onoff(data) ? 'Winter' : 'Summer')
        .catch((knxerror) => this.log('Set summer_winter error', knxerror));
    }
    if (groupaddress === this.settings.ga_thermostat_mode_state) {
      if (this.settings.ga_temperature_measure) {
        this.knxInterface.readKNXGroupAddress(this.settings.ga_temperature_measure)
          .catch((knxerror) => this.log(knxerror));
      }
      if (this.settings.ga_temperature_target_actual) {
        this.knxInterface.readKNXGroupAddress(this.settings.ga_temperature_target_actual)
          .catch((knxerror) => this.log(knxerror));
      }

      this.setCapabilityValue('vimar_thermostat_mode', `${DatapointTypeParser.dpt17(data)}`)
        .catch((knxerror) => this.log('Set vimar_thermostat_mode error', knxerror));
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

  onKNXConnection(connectionStatus) {
    super.onKNXConnection(connectionStatus);

    if (connectionStatus === 'connected') {
      // Reading the groupaddress will trigger a event on the bus.
      // This will be catched by onKNXEvent, hence the return value is not used.
      if (this.settings.ga_temperature_target) {
        this.knxInterface.readKNXGroupAddress(this.settings.ga_temperature_target)
          .catch((knxerror) => this.log(knxerror));
      }
      if (this.settings.ga_temperature_measure) {
        this.knxInterface.readKNXGroupAddress(this.settings.ga_temperature_measure)
          .catch((knxerror) => this.log(knxerror));
      }
      if (this.settings.ga_temperature_target_actual) {
        this.knxInterface.readKNXGroupAddress(this.settings.ga_temperature_target_actual)
          .catch((knxerror) => this.log(knxerror));
      }
      if (this.settings.ga_thermostat_mode_state) {
        this.knxInterface.readKNXGroupAddress(this.settings.ga_thermostat_mode_state)
          .catch((knxerror) => this.log(knxerror));
      }
      if (this.settings.ga_summerwinter_state) {
        this.knxInterface.readKNXGroupAddress(this.settings.ga_summerwinter_state)
          .catch((knxerror) => this.log(knxerror));
      }
      if (this.settings.ga_valve_heating_state) {
        this.knxInterface.readKNXGroupAddress(this.settings.ga_valve_heating_state)
          .catch((knxerror) => this.log(knxerror));
      }
      if (this.settings.ga_valve_cooling_state) {
        this.knxInterface.readKNXGroupAddress(this.settings.ga_valve_cooling_state)
          .catch((knxerror) => this.log(knxerror));
      }
    }
  }

  onCapabilityMode(value, opts) {
    if (this.knxInterface && this.settings.ga_thermostat_mode) {
      return this.knxInterface.writeKNXGroupAddress(this.settings.ga_thermostat_mode, value, 'DPT17')
        .catch((knxerror) => {
          this.log(knxerror);
          throw new Error(this.homey.__('errors.mode_set_failed'));
        }).then(() => new Promise((resolve) => setTimeout(resolve, 400))).then(() => {
          if (this.settings.ga_temperature_measure) {
            this.knxInterface.readKNXGroupAddress(this.settings.ga_temperature_measure)
              .catch((knxerror) => this.log(knxerror));
          }
          if (this.settings.ga_temperature_target_actual) {
            this.knxInterface.readKNXGroupAddress(this.settings.ga_temperature_target_actual)
              .catch((knxerror) => this.log(knxerror));
          }
        });
    }
    return null;
  }

  onCapabilityTargetTemperature(value, opts) {
    this.getMeasuredTemperature();
    if (this.knxInterface && this.settings.ga_temperature_target) {
      // TODO: Some error handling here if on or the other is undefined
      const baseSetpoint = this.currentSetpoint - this.currentSetpointShift;
      const newShift = value - baseSetpoint;
      console.log('New shift', value, newShift, this.currentSetpoint, this.currentSetpointShift);
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

}

module.exports = VimarThermostat02952BDevice;
