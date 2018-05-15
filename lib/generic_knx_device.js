'use strict';

const Homey = require('homey');

/* Class for a generic KNX device.
   This class provides shared functionality, such as binding to a KNX interface,
   setting KNX connection and event listeners for supplied groupadresses,
   getting capabilitylisteners and providing a generic way to write/read groupaddresses.
*/
class KNXGeneric extends Homey.Device {

    // this method is called when the Device is inited
    onInit() {
        this.log('name:', this.getName());
        this.log('class:', this.getClass());

        this.macAddress = this.settings.macAddress;
        // Set the KNX handlers
        this.KNXConnectionHandler = this.onKNXConnection.bind(this);
        this.KNXEventHandler = this.onKNXEvent.bind(this);
        // Check if the preffered KNX interface is already available in the InterfaceManager.
        // Otherwise wait for a emit that the interface is found.
        const knownKNXInterface = Homey.app.returnKNXInterface(this.getSetting('macAddress'));
        if (knownKNXInterface) {
            this.setKNXInterface(knownKNXInterface);
        } else {
            Homey.app.once("interface_found:" + this.macAddress, this.setKNXInterface.bind(this));
        }
    }

    // Set the KNX interface from the interface manager as the interface to use in the whole context of the device.
    setKNXInterface(knxInterface) {
        this.knxInterface = knxInterface;
        // Add the handlers.
        this.knxInterface.onKNXConnectionListener(this.KNXConnectionHandler);
        // Check which capabilities are supported by the device to add handlers if needed.
        if (this.hasCapability('onoff')) {this.knxInterface.addKNXEventListener(this.settings.ga_status, this.KNXEventHandler)}
        if (this.hasCapability('dim')) {this.knxInterface.addKNXEventListener(this.settings.ga_dim_status, this.KNXEventHandler)}
        this.log(this.getName(), 'is using interface:', this.knxInterface.name);
        // Connect the interface. This is safe, because the object is already created and thus verified.
        this.knxInterface._connectKNX();
    }

    readSettingAddress(keys) {
        const settingKeys = typeof keys === 'string' ? [keys] : keys;
        return Promise.all(settingKeys.map(settingKey => this.knxInterface.readKNXGroupAddress(this.getSetting(settingKey))))
            .then(results => {
                if(typeof keys === 'string'){
                    return results[0];
                }
                return results;
            });
    }

    // Function to run when a KNX connection is (re)opened
    async onKNXConnection() {
        // The device state may changed so get the current state from the KNX bus.
        this.log('Getting device state for', this.getName());
        // check the supplied value!
        return await this.readSettingAddress('ga_status');
    }

    // Generic function to call when a event is emitted from the bus. Should be overriden on a per-device basis.
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
        if(this.knxInterface) {
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

    onSettings(oldSettingsObj, newSettingsObj) {
        /* //Moet dit nog?
        const groupIdOccupied = (groupId) => {
            return Object.values(Homey.ManagerDrivers.getDrivers()).some((driver) => {
                return driver !== this && driver.getDevices.some((device) => {
                    return Object.values(device.groupAddressSettingMap).some(settingKey => {
                        driver.getSetting(settingKey) === groupId;
                    });
                });
            });
        }
        if(changedIds.some((id) => {
            return groupIdOccupied(id);
        })){
            return Promise.reject(new Error('group address already occupied'));
        }
        return Promise.resolve();
        */
       // When no knxInterface is assigned, try to assign it on the mac obtained from the settings.
        if (!this.knxInterface) {
            this.setKNXInterface(Homey.app.returnKNXInterface(this.getSetting('macAddress')))
        }
        this.knxInterface.removeKNXEventListener(oldSettingsObj.ga_status, this.onKNXEvent);
        this.knxInterface.addKNXEventListener(newSettingsObj.ga_status, this.onKNXEvent);
        return Promise.resolve();
    }
}

module.exports = KNXGeneric;