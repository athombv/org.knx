'use strict';

const Homey = require('homey');

/* Class for a generic KNX device.
   This class provides shared functionality, such as binding to a KNX interface,
   setting KNX connection and event listeners for supplied groupadresses,
   getting capabilitylisteners and providing a generic way to write/read groupaddresses.
*/
class GenericKNXDevice extends Homey.Device {

  // this method is called when the Device is inited
  onInit() {
    this.log(this.getName(), 'init, has data', this.getData());
    this.macAddress = this.settings.macAddress;
    // Set the KNX handlers
    this.KNXConnectionHandler = this.onKNXConnection.bind(this);
    this.KNXEventHandler = this.onKNXEvent.bind(this);
    // Set the device to unavailable until a valid KNX interface has been connected
    this.setUnavailable(Homey.__('errors.ip.interface_not_found'));
    // Check if the preffered KNX interface is already available in the InterfaceManager.
    // Otherwise wait for a emit that the interface is found.
    const oldKNXInterface = Homey.app.returnKNXInterface(this.macAddress);
    if (oldKNXInterface) {
      this.setKNXInterface(oldKNXInterface);
    } else {
      Homey.app.once(`interface_found${this.macAddress}`, this.setKNXInterface.bind(this));
    }

    // Only to be executed when there is no interface AND no interfaces are found.
    Homey.app.once('no_interfaces', () => {
      // Should try to obtain a KNX interface with the saved IP address
      const ip = this.getSetting('ipAddress');
      if (ip) {
        Homey.app.discoverKNXInterfaceOnIP(ip)
          .catch(this.error);
      }
      // this will trigger a "interface_found" event on which the above app.once will respond.
    });
  }

  // Set the KNX interface from the interface manager as the interface to use for this device.
  setKNXInterface(foundKNXInterface) {
    if (foundKNXInterface !== undefined) {
      this.knxInterface = foundKNXInterface;
      // Add the handlers.
      this.knxInterface.onKNXConnectionListener(this.KNXConnectionHandler);

      // Check which capabilities are supported by the device to add handlers if needed.
      if (this.hasCapability('onoff')) {
        this.knxInterface.addKNXEventListener(this.settings.ga_status, this.KNXEventHandler);
      }
      if (this.hasCapability('dim')) {
        this.knxInterface.addKNXEventListener(this.settings.ga_dim_status, this.KNXEventHandler);
      }
      if (this.hasCapability('target_temperature')) {
        this.knxInterface.addKNXEventListener(this.settings.ga_temperature_target,
          this.KNXEventHandler);
      }
      if (this.hasCapability('measure_temperature')) {
        if (this.settings.ga_sensor) {
          this.knxInterface.addKNXEventListener(this.settings.ga_sensor, this.KNXEventHandler);
        } else {
          this.knxInterface.addKNXEventListener(this.settings.ga_temperature_measure,
            this.KNXEventHandler);
        }
      }
      if (this.hasCapability('alarm_contact')) {
        this.knxInterface.addKNXEventListener(this.settings.ga_sensor, this.KNXEventHandler);
      }
      if (this.hasCapability('measure_luminance')) {
        this.knxInterface.addKNXEventListener(this.settings.ga_sensor, this.KNXEventHandler);
      }
      if (this.hasCapability('windowcoverings_state')) {
        this.knxInterface.addKNXEventListener(this.settings.ga_status, this.KNXEventHandler);
      }

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

  async readSettingAddress(keys) {
    const settingKeys = typeof keys === 'string' ? [keys] : keys;
    if (!this.knxInterface.isConnected) throw new Error('no_knx_connection');

    return Promise.all(settingKeys.map(settingKey => {
      return this.knxInterface.readKNXGroupAddress(this.getSetting(settingKey));
    }))
      .then(results => {
        if (typeof keys === 'string') {
          return results[0];
        }
        return results;
      })
      .catch(error => {
        this.log('readsetting_failed', error);
      });
  }

  // Function to run when a KNX connection is (re)opened
  // Mostly OVERRIDEN in specific devices!!
  onKNXConnection(connectionStatus) {
    if (connectionStatus === 'connected') {
      this.setAvailable();
    } else if (connectionStatus === 'disconnected') {
      this.setUnavailable(Homey.__('errors.ip.interface_not_available'));
    }
  }

  // Generic function to call when a event is emitted from the bus.
  // Should be overriden on a per-device basis.
  // This function should be used as a callback on the IP-interface
  onKNXEvent(groupaddress, data) {
    this.log('received', groupaddress, data);
  }

  // this method is called when the Device is added
  onAdded() {
    this.log(this.getName(), 'added');
  }

  // Deletes the listeners when the device is deleted
  onDeleted() {
    if (this.knxInterface) {
      // Remove the callbacks from the IP-interface
      this.knxInterface.removeKNXConnectionListener(this.KNXConnectionHandler);
      this.knxInterface.removeKNXEventListener(this.KNXEventHandler);
      this.log(this.getName(), 'deleted');
    } else {
      this.log('No associated IP interface');
    }
  }

  // Helper function to easily obtain all the settings once
  get settings() {
    return this.getSettings();
  }

  onSettings(oldSettingsObj, newSettingsObj, changedKeysArr, callback) {
    // When no knxInterface is assigned, try to assign it on the mac obtained from the settings.
    if (this.knxInterface === undefined) {
      this.setKNXInterface(Homey.app.returnKNXInterface(newSettingsObj.macAddress));
    }
    if ((this.knxInterface === undefined)
    && (oldSettingsObj.ipAddress !== newSettingsObj.ipAddress)) {
      Homey.app.discoverKNXInterfaceOnIP(newSettingsObj.ipAddress)
        .catch(this.error);
    }
    // Prevents the listeners from being set if there is no valid KNX interface to use.

    if (this.knxInterface !== undefined) {
      this.knxInterface.removeKNXEventListener(oldSettingsObj.ga_status, this.onKNXEvent);
      this.knxInterface.addKNXEventListener(newSettingsObj.ga_status, this.onKNXEvent);
    }
    callback(null, true);
  }

}

module.exports = GenericKNXDevice;
