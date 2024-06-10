'use strict';

const Homey = require('homey');
const KNXInterfaceManager = require('./lib/KNXInterfaceManager');

class KNXApp extends Homey.App {

  async onInit() {
    this.log('KNXApp is running...');
    const address = await this.homey.cloud.getLocalAddress();
    const homeyIP = address.split(':', 1).toString();

    this.log('Homey IP + Parsed IP', address, homeyIP);
    this.knxInterfaceManager = new KNXInterfaceManager(homeyIP, this.homey);
  }

  /**
   * Returns the instance of the knxInterfaceManager that handles the knx connection
   *
   * @returns {KNXInterfaceManager}
   */
  getKNXInterfaceManager() {
    return this.knxInterfaceManager;
  }

  // Obtain the interface to use by MAC address, then start the learnmode on it.
  async startLearnmodeSwitch(macAddress, time) {
    const knxInterfaceToUse = this.knxInterfaceManager.getKNXInterface(macAddress);
    return knxInterfaceToUse.learnModeSwitch(time);
  }

  // Test a given groupaddress of the given interface. Currently only supports DPT1 (binary/toggle)
  // A third parameter should be added to handle the datapoint type so that all datapoints can be tested.
  testGroupAddress(macAddress, groupAddress, time) {
    const knxInterfaceToUse = this.knxInterfaceManager.getKNXInterface(macAddress);
    knxInterfaceToUse.writeKNXGroupAddress(groupAddress, 1, 'DPT1');
    setTimeout(() => {
      knxInterfaceToUse.writeKNXGroupAddress(groupAddress, 0, 'DPT1');
    }, time);
  }

}

module.exports = KNXApp;
