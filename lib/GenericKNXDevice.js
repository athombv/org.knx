'use strict';

const Homey = require('homey');

/* Class for a generic KNX device.
   This class provides shared functionality, such as binding to a KNX interface,
   setting KNX connection and event listeners for supplied groupadresses,
   getting capabilitylisteners and providing a generic way to write/read groupaddresses.
*/
class GenericKNXDevice extends Homey.Device {

  // this method is called when the Device is initialized
  onInit() {
    this.log(this.getName(), 'init, has data', this.getData());

    this.macAddress = this.settings.macAddress;

    this.knxInterfaceManager = this.homey.app.getKNXInterfaceManager();

    // Set the KNX handlers
    this.KNXConnectionHandler = this.onKNXConnection.bind(this);
    this.KNXEventHandler = this.onKNXEvent.bind(this);
    this.KNXInterfaceFoundHandler = this.onKNXInterface.bind(this);
    this.noInterfaceFoundHandler = this.onNoInterface.bind(this);

    // Set the device to unavailable until a valid KNX interface has been connected
    this.setUnavailable(this.homey.__('errors.ip.interface_not_found'));

    // Check if the preferred KNX interface is already available in the InterfaceManager.
    // Otherwise wait for a emit that the interface is found.
    const oldKNXInterface = this.knxInterfaceManager.getKNXInterface(this.macAddress);

    if (oldKNXInterface) {
      this.setKNXInterface(oldKNXInterface);
    } else {
      this.log('no interfaces found');
      this.knxInterfaceManager.on('interface_found', this.KNXInterfaceFoundHandler);
      this.knxInterfaceManager.on('no_interfaces', this.noInterfaceFoundHandler);
    }
  }

  // Deletes the listeners when the device is deleted
  onDeleted() {
    this.knxInterfaceManager.removeListener('interface_found', this.KNXInterfaceFoundHandler);
    this.knxInterfaceManager.removeListener('no_interfaces', this.noInterfaceFoundHandler);

    if (this.knxInterface) {
      // Remove the callbacks from the IP-interface
      this.knxInterface.removeKNXConnectionListener(this.KNXConnectionHandler);
      this.removeKNXEventListeners(this.settings);

      this.log(this.getName(), 'deleted');
    } else {
      this.log('No associated IP interface');
    }
  }

  /**
   * Handler for the interface found
   */
  onKNXInterface(knxInterface) {
    if (knxInterface
      && knxInterface.macAddress === this.settings.macAddress
      && !this.knxInterface) {
      this.setKNXInterface(knxInterface);
    }
  }

  /**
   * Handler for no interface found, and start the discovery phase
   */
  onNoInterface() {
    // Should try to obtain a KNX interface
    const ip = this.settings.ipAddress;
    if (ip) {
      this.knxInterfaceManager.discoverKNXInterfaceOnIP(ip)
        .catch(this.error);
    }
  }

  // Set the KNX interface from the interface manager as the interface to use for this device.
  setKNXInterface(foundKNXInterface) {
    if (foundKNXInterface !== undefined) {
      this.knxInterface = foundKNXInterface;
      // Add the handlers.
      this.knxInterface.onKNXConnectionListener(this.KNXConnectionHandler);

      this.addKNXEventListeners(this.settings);

      this.log('Using interface:', this.knxInterface.name);
      this.setSettings({
        ipAddress: this.knxInterface.getConnectedIPAddress(),
      });

      // Connect the interface. The object is already created and thus verified.
      this.knxInterface._connectKNX();
      // Make the device available since we have a KNX interface
      this.setAvailable();
    }
  }

  /**
   * Adds the event listeners for the status addresses from the settings
   */
  addKNXEventListeners(settings) {
    // Check which capabilities are supported by the device to add handlers if needed.
    if (this.hasCapability('onoff')) {
      // A switch can optionally have a different status address then the switch address
      let statusAddress = settings.ga_switch;
      if (typeof settings.ga_status === 'string' && settings.ga_status !== '') {
        statusAddress = settings.ga_status;
      }

      this.knxInterface.addKNXEventListener(statusAddress, this.KNXEventHandler);
    }
    if (this.hasCapability('scene_capability')) {
      this.knxInterface.addKNXEventListener(settings.ga_scene, this.KNXEventHandler);
    }
    if (this.hasCapability('dim')) {
      this.knxInterface.addKNXEventListener(settings.ga_dim_status, this.KNXEventHandler);
    }
    if (this.hasCapability('target_temperature')) {
      // A thermostat can optionally have a different status address then the target temperature address
      let targetTemperatureStatusAddress = settings.ga_temperature_target;
      if (typeof settings.ga_temperature_target_status === 'string' && settings.ga_temperature_target_status !== '') {
        targetTemperatureStatusAddress = settings.ga_temperature_target_status;
      }

      this.knxInterface.addKNXEventListener(targetTemperatureStatusAddress,
        this.KNXEventHandler);
    }
    if (this.hasCapability('hvac_operating_mode')) {
      // A thermostat can optionally have a different status address then the operating mode address
      let operatingModeStatusAddress = this.settings.ga_hvac_operating_mode;
      if (typeof this.settings.ga_hvac_operating_mode_status === 'string' && this.settings.ga_hvac_operating_mode_status !== '') {
        operatingModeStatusAddress = this.settings.ga_hvac_operating_mode_status;
      }

      this.knxInterface.addKNXEventListener(operatingModeStatusAddress,
        this.KNXEventHandler);
    }
    if (this.hasCapability('measure_temperature')) {
      if (this.settings.ga_sensor) {
        this.knxInterface.addKNXEventListener(settings.ga_sensor, this.KNXEventHandler);
      } else {
        this.knxInterface.addKNXEventListener(settings.ga_temperature_measure,
          this.KNXEventHandler);
      }
    }
    if (this.hasCapability('alarm_contact')
      || this.hasCapability('alarm_motion')
      || this.hasCapability('alarm_smoke')
      || this.hasCapability('alarm_tamper')) {
      this.knxInterface.addKNXEventListener(settings.ga_sensor, this.KNXEventHandler);
    }
    if (this.hasCapability('measure_luminance')) {
      this.knxInterface.addKNXEventListener(settings.ga_sensor, this.KNXEventHandler);
    }
    if (this.hasCapability('measure_humidity')) {
      this.knxInterface.addKNXEventListener(settings.ga_sensor, this.KNXEventHandler);
    }
    if (this.hasCapability('measure_power')) {
      this.knxInterface.addKNXEventListener(settings.ga_sensor, this.KNXEventHandler);
    }
    if (this.hasCapability('meter_power')) {
      this.knxInterface.addKNXEventListener(settings.ga_sensor, this.KNXEventHandler);
    }
    if (this.hasCapability('windowcoverings_state')) {
      this.knxInterface.addKNXEventListener(settings.ga_status, this.KNXEventHandler);
    }
    if (this.hasCapability('knx_fan_speed')) {
      // A thermostat can optionally have a different status address then the fan speed address
      let fanSpeedStatusAddress = this.settings.ga_fan_speed;
      if (typeof this.settings.ga_fan_speed_status === 'string' && this.settings.ga_fan_speed_status !== '') {
        fanSpeedStatusAddress = this.settings.ga_fan_speed_status;
      }

      this.knxInterface.addKNXEventListener(fanSpeedStatusAddress, this.KNXEventHandler);
    }
    if (this.hasCapability('knx_fan_auto_mode')) {
      // A thermostat can optionally have a different status address then the fan auto mode address
      let fanAutoModeStatusAddress = this.settings.ga_fan_auto_mode;
      if (typeof this.settings.ga_fan_auto_mode_status === 'string' && this.settings.ga_fan_auto_mode_status !== '') {
        fanAutoModeStatusAddress = this.settings.ga_fan_auto_mode_status;
      }

      this.knxInterface.addKNXEventListener(fanAutoModeStatusAddress, this.KNXEventHandler);
    }
    if (this.hasCapability('windowcoverings_set')) {
      // A window covering can optionally have a different status address then the height address
      let heightAddress = this.settings.ga_height;
      if (typeof this.settings.ga_height_status === 'string' && this.settings.ga_height_status !== '') {
        heightAddress = this.settings.ga_height_status;
      }

      this.knxInterface.addKNXEventListener(heightAddress, this.KNXEventHandler);
    }
  }

  /**
   * Removes the event listeners for the status addresses from the settings
   */
  removeKNXEventListeners(settings) {
    // Check which capabilities are supported by the device to add handlers if needed.
    if (this.hasCapability('onoff')) {
      // A switch can optionally have a different status address then the switch address
      let statusAddress = settings.ga_switch;
      if (typeof settings.ga_status === 'string' && settings.ga_status !== '') {
        statusAddress = settings.ga_status;
      }

      this.knxInterface.removeKNXEventListener(statusAddress, this.KNXEventHandler);
    }
    if (this.hasCapability('scene_capability')) {
      this.knxInterface.removeKNXEventListener(settings.ga_scene, this.KNXEventHandler);
    }
    if (this.hasCapability('dim')) {
      this.knxInterface.removeKNXEventListener(settings.ga_dim_status, this.KNXEventHandler);
    }
    if (this.hasCapability('target_temperature')) {
      // A thermostat can optionally have a different status address then the target temperature address
      let targetTemperatureStatusAddress = settings.ga_temperature_target;
      if (typeof settings.ga_temperature_target_status === 'string' && settings.ga_temperature_target_status !== '') {
        targetTemperatureStatusAddress = settings.ga_temperature_target_status;
      }

      this.knxInterface.removeKNXEventListener(targetTemperatureStatusAddress,
        this.KNXEventHandler);
    }
    if (this.hasCapability('measure_temperature')) {
      if (this.settings.ga_sensor) {
        this.knxInterface.removeKNXEventListener(settings.ga_sensor, this.KNXEventHandler);
      } else {
        this.knxInterface.removeKNXEventListener(settings.ga_temperature_measure,
          this.KNXEventHandler);
      }
    }
    if (this.hasCapability('alarm_contact')
      || this.hasCapability('alarm_motion')
      || this.hasCapability('alarm_smoke')
      || this.hasCapability('alarm_tamper')) {
      this.knxInterface.removeKNXEventListener(settings.ga_sensor, this.KNXEventHandler);
    }
    if (this.hasCapability('measure_luminance')) {
      this.knxInterface.removeKNXEventListener(settings.ga_sensor, this.KNXEventHandler);
    }
    if (this.hasCapability('measure_humidity')) {
      this.knxInterface.removeKNXEventListener(settings.ga_sensor, this.KNXEventHandler);
    }
    if (this.hasCapability('measure_power')) {
      this.knxInterface.removeKNXEventListener(settings.ga_sensor, this.KNXEventHandler);
    }
    if (this.hasCapability('meter_power')) {
      this.knxInterface.removeKNXEventListener(settings.ga_sensor, this.KNXEventHandler);
    }
    if (this.hasCapability('windowcoverings_state')) {
      this.knxInterface.removeKNXEventListener(settings.ga_status, this.KNXEventHandler);
    }
    if (this.hasCapability('hvac_operating_mode')) {
      // A thermostat can optionally have a different status address then the operating mode address
      let operatingModeStatusAddress = this.settings.ga_hvac_operating_mode;
      if (typeof this.settings.ga_hvac_operating_mode_status === 'string' && this.settings.ga_hvac_operating_mode_status !== '') {
        operatingModeStatusAddress = this.settings.ga_hvac_operating_mode_status;
      }

      this.knxInterface.removeKNXEventListener(operatingModeStatusAddress, this.KNXEventHandler);
    }
    if (this.hasCapability('knx_fan_speed')) {
      // A thermostat can optionally have a different status address then the fan speed address
      let fanSpeedStatusAddress = this.settings.ga_fan_speed;
      if (typeof this.settings.ga_fan_speed_status === 'string' && this.settings.ga_fan_speed_status !== '') {
        fanSpeedStatusAddress = this.settings.ga_fan_speed_status;
      }

      this.knxInterface.removeKNXEventListener(fanSpeedStatusAddress, this.KNXEventHandler);
    }
    if (this.hasCapability('knx_fan_auto_mode')) {
      // A thermostat can optionally have a different status address then the fan auto mode address
      let fanAutoModeStatusAddress = this.settings.ga_fan_auto_mode;
      if (typeof this.settings.ga_fan_auto_mode_status === 'string' && this.settings.ga_fan_auto_mode_status !== '') {
        fanAutoModeStatusAddress = this.settings.ga_fan_auto_mode_status;
      }

      this.knxInterface.removeKNXEventListener(fanAutoModeStatusAddress, this.KNXEventHandler);
    }
    if (this.hasCapability('windowcoverings_set')) {
      // A window covering can optionally have a different status address then the height address
      let heightAddress = this.settings.ga_height;
      if (typeof this.settings.ga_height_status === 'string' && this.settings.ga_height_status !== '') {
        heightAddress = this.settings.ga_height_status;
      }

      this.knxInterface.removeKNXEventListener(heightAddress, this.KNXEventHandler);
    }
  }

  async readSettingAddress(keys) {
    const settingKeys = typeof keys === 'string' ? [keys] : keys;
    if (!this.knxInterface.isConnected) throw new Error('no_knx_connection');

    return Promise.all(settingKeys.map((settingKey) => {
      return this.knxInterface.readKNXGroupAddress(this.getSetting(settingKey));
    }))
      .then((results) => {
        if (typeof keys === 'string') {
          return results[0];
        }
        return results;
      })
      .catch((error) => {
        this.log('readsetting_failed', error);
      });
  }

  // Function to run when a KNX connection is (re)opened
  // Mostly OVERRIDDEN in specific devices!!
  onKNXConnection(connectionStatus) {
    if (connectionStatus === 'connected') {
      this.setAvailable();
    } else if (connectionStatus === 'disconnected') {
      this.setUnavailable(this.homey.__('errors.ip.interface_not_available'));
    }
  }

  // Generic function to call when a event is emitted from the bus.
  // Should be overridden on a per-device basis.
  // This function should be used as a callback on the IP-interface
  onKNXEvent(groupaddress, data) {
    this.log('received', groupaddress, data);
  }

  // this method is called when the Device is added
  onAdded() {
    this.log(this.getName(), 'added');
  }

  // Helper function to easily obtain all the settings once
  get settings() {
    return this.getSettings();
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    // When no knxInterface is assigned, try to assign it on the mac obtained from the settings.
    if (this.knxInterface === undefined) {
      this.setKNXInterface(this.knxInterfaceManager.getKNXInterface(newSettings.macAddress));
    }
    if ((this.knxInterface === undefined)
      && (oldSettings.ipAddress !== newSettings.ipAddress)) {
      this.knxInterfaceManager.discoverKNXInterfaceOnIP(newSettings.ipAddress)
        .catch(this.error);
    }

    // Prevents the listeners from being set if there is no valid KNX interface to use.
    if (this.knxInterface !== undefined) {
      this.removeKNXEventListeners(oldSettings);
      this.addKNXEventListeners(newSettings);
    }
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

module.exports = GenericKNXDevice;
