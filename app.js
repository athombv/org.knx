'use strict';

const Homey = require('homey');
const KNXInterfaceManager = require('./lib/KNXInterfaceManager');

class KNXApp extends Homey.App {

  async onInit() {
    this.log('KNXApp is running...');
    const address = await this.homey.cloud.getLocalAddress();
    const homeyIP = address.split(':', 1).toString();

    this.log('Homey IP + Parsed IP', address, homeyIP);
    this.knxInterfaceManager = new KNXInterfaceManager(homeyIP);

    

    const sendTelegramAction = this.homey.flow.getActionCard('knx_send');
    sendTelegramAction.registerRunListener(async (args, state) => {

      console.log(args);
      console.log(state);

      let knxInterfaceToUse = this.knxInterfaceManager.getKNXInterface(args.interface.mac);

      if (args.interface.mac === 'any') {
        const availableInterfaces = this.knxInterfaceManager.getKNXInterfaceList();
        if (availableInterfaces.length > 0) {
          knxInterfaceToUse = availableInterfaces[0];
        }
      }

      if (!knxInterfaceToUse) 
        return Promise.reject('Interface not found');

      
      if (!args.group_address) 
        return Promise.reject('No group address selected');
      
      if (args.data_type == "none") {
        knxInterfaceToUse.writeKNXGroupAddress(args.group_address, args.value);
      } else {
        knxInterfaceToUse.writeKNXGroupAddress(args.group_address, args.value, args.data_type);
      }

    });
    
    sendTelegramAction.registerArgumentAutocompleteListener(
      "interface",
      async (query, args) => {
        const results = this.knxInterfaceManager.getSimpleInterfaceList();
        results.push({name: '[any]', mac: 'any', ip: 'any'});

        // filter based on the query
        return results.filter((result) => {
           return result.name.toLowerCase().includes(query.toLowerCase()) || result.mac.toLowerCase().includes(query.toLowerCase()) || result.ip.toLowerCase().includes(query.toLowerCase()); 
        });
      }
    );

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
