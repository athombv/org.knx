'use strict';

const KNXGenericDevice = require('../../lib/GenericKNXDevice');
const DatapointTypeParser = require('../../lib/DatapointTypeParser');

class KNXAuroDevice extends KNXGenericDevice {

  async onInit() {
    await super.onInit();
    this.log('KNX Auro Sensor device has been initialized');
  }

  onKNXEvent(groupaddress, data) {
    const settings = this.getSettings();
    this.log('🔥 Auro KNX Event received:', { groupaddress, data });

    // Motion sensor
    if (groupaddress === settings.ga_motion) {
      this.log('🚶 Processing Motion event');
      const value = DatapointTypeParser.bitFormat(data);
      this.setCapabilityValue('alarm_motion', value).catch(this.error);
      this.log(`✅ Motion updated: ${value}`);
      this._triggerMotionFlowCards(value);
      return;
    }

    // Luminance sensor
    if (groupaddress === settings.ga_luminance) {
      this.log('☀️ Processing Luminance event');
      const value = DatapointTypeParser.dpt9(data);
      this.setCapabilityValue('measure_luminance', value).catch(this.error);
      this.log(`✅ Luminance updated: ${value} lux`);
      this._triggerLuminanceFlowCards(value);
      return;
    }

    // Temperature sensor
    if (groupaddress === settings.ga_temperature) {
      this.log('🌡️ Processing Temperature event');
      const value = DatapointTypeParser.dpt9(data);
      this.setCapabilityValue('measure_temperature', value).catch(this.error);
      this.log(`✅ Temperature updated: ${value}°C`);
      this._triggerTemperatureFlowCards(value);
      return;
    }

    // Log for debugging
    this.log('received', groupaddress, data);
  }

  // Override to add all our subscriptions
  addKNXEventListeners(settings) {
    if (settings.ga_motion) {
      this.knxInterface.addKNXEventListener(settings.ga_motion, this.KNXEventHandler);
      this.log('🔗 Subscribed to Motion');
    }
    if (settings.ga_luminance) {
      this.knxInterface.addKNXEventListener(settings.ga_luminance, this.KNXEventHandler);
      this.log('🔗 Subscribed to Luminance');
    }
    if (settings.ga_temperature) {
      this.knxInterface.addKNXEventListener(settings.ga_temperature, this.KNXEventHandler);
      this.log('🔗 Subscribed to Temperature');
    }
  }

  // Override to remove all our subscriptions
  removeKNXEventListeners(settings) {
    if (settings.ga_motion) {
      this.knxInterface.removeKNXEventListener(settings.ga_motion, this.KNXEventHandler);
    }
    if (settings.ga_luminance) {
      this.knxInterface.removeKNXEventListener(settings.ga_luminance, this.KNXEventHandler);
    }
    if (settings.ga_temperature) {
      this.knxInterface.removeKNXEventListener(settings.ga_temperature, this.KNXEventHandler);
    }
  }

  onKNXConnection(connectionStatus) {
    // Handle basic connection status
    if (connectionStatus === 'connected') {
      this.setAvailable();
    } else if (connectionStatus === 'disconnected') {
      this.setUnavailable(this.homey.__('errors.ip.interface_not_available'));
    }

    if (connectionStatus === 'connected') {
      const settings = this.getSettings();
      this.log('🔗 Auro Sensor connected to KNX');

      // Read initial sensor values
      if (settings.ga_motion) {
        this.knxInterface.readKNXGroupAddress(settings.ga_motion).catch(this.error);
        this.log('🚶 Reading initial motion state');
      }
      if (settings.ga_luminance) {
        this.knxInterface.readKNXGroupAddress(settings.ga_luminance).catch(this.error);
        this.log('☀️ Reading initial luminance');
      }
      if (settings.ga_temperature) {
        this.knxInterface.readKNXGroupAddress(settings.ga_temperature).catch(this.error);
        this.log('🌡️ Reading initial temperature');
      }
    }
  }

  _triggerMotionFlowCards(value) {
    if (value) {
      this.homey.flow.getDeviceTriggerCard('auro_motion_detected')
        .trigger(this, { motion: value })
        .catch((err) => this.error('Motion detected trigger error', err));
    } else {
      this.homey.flow.getDeviceTriggerCard('auro_motion_stopped')
        .trigger(this, { motion: value })
        .catch((err) => this.error('Motion stopped trigger error', err));
    }
    this.homey.flow.getDeviceTriggerCard('auro_motion_changed')
      .trigger(this, { motion: value })
      .catch((err) => this.error('Motion changed trigger error', err));
  }

  _triggerLuminanceFlowCards(value) {
    this.homey.flow.getDeviceTriggerCard('auro_luminance_changed')
      .trigger(this, { luminance: value })
      .catch((err) => this.error('Luminance changed trigger error', err));
  }

  _triggerTemperatureFlowCards(value) {
    this.homey.flow.getDeviceTriggerCard('auro_temperature_changed')
      .trigger(this, { temperature: value })
      .catch((err) => this.error('Temperature changed trigger error', err));
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('Settings changed:', changedKeys);
    await super.onSettings({ oldSettings, newSettings, changedKeys });
  }

  async onDeleted() {
    this.log('KNX Auro Sensor device deleted');
    await super.onDeleted();
  }

}

module.exports = KNXAuroDevice;