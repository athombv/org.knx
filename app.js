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
    sendTelegramAction.registerRunListener(sendTelegramAction.bind(this));


    this.recieveTelegramTrigger = this.homey.flow.getTriggerCard('knx_receive');
    this.eventListernerGroupAddresses = [];

    recieveTelegramTrigger.registerRunListener(async (args, state) => {
      //TODO: allow globs for cool trigger types
      return args.group_address === state.group_address && (args.interface === "[any]" || args.interface === state.interface);
    });

    recieveTelegramTrigger.getArgumentValues().then(this.registerKNXEventHandlers.bind(this));

    recieveTelegramTrigger.on("update", () => {
      this.log("update knx flow arguments");
      recieveTelegramTrigger.getArgumentValues().then(this.registerKNXEventHandlers.bind(this));
    });

    sendTelegramAction.registerArgumentAutocompleteListener("interface", this.interfaceAutocomplete.bind(this));
    recieveTelegramTrigger.registerArgumentAutocompleteListener("interface", this.interfaceAutocomplete.bind(this));

  }

  // referenced via this.KNXEventHandler
  onKNXEvent(interfaceMac, groupaddress, data) {
    const tokens = { value_number: data, value_bool: data > 0 };
    const state = { group_address: groupaddress, interface: interfaceMac };

    // trigger the card
    recieveTelegramTrigger.trigger(tokens, state)
      .then(this.log)
      .catch(this.error);
  }

  registerKNXEventHandlers(args) {
    this.log("args", args);

    args.forEach(event => {
      if (!this.eventListernerGroupAddresses.includes(event.interface + "-" + event.group_address)) {
        this.eventListernerGroupAddresses.push(event.interface + "-" + event.group_address);

        let knxInterfaceToUse = this.knxInterfaceManager.getKNXInterface(event.interface);

        if (event.interface === "[any]") {
          const availableInterfaces = this.knxInterfaceManager.getKNXInterfaceList();
          knxInterfaceToUse = availableInterfaces.length > 0 ? availableInterfaces[0] : null;
        }

        if (!knxInterfaceToUse) {
          this.error('Interface not found');
        } else {

          // Store the event listener so we can remove it later
          knxInterfaceToUse.addKNXEventListener(event.group_address, this.onKNXEvent.bind(this, event.interface));
        }
      }

    });

    this.eventListernerGroupAddresses.forEach(eventListernerId => {
      if (args.filter(event => event.interface + "-" + event.group_address === eventListernerId).length === 0) {
        //TODO: figuure out how to remove the event listener, because we need the correct event listener
        //knxInterfaceToUse.removeKNXEventListener(groupAddress, this.onKNXEvent.bind( this, event.interface));
      }
    });
  }

  async interfaceAutocomplete(query, args) {
    const results = this.knxInterfaceManager.getSimpleInterfaceList();
    results.push({ name: '[any]', mac: 'any', ip: 'any' });

    // filter based on the query
    return results.filter((result) => {
      return result.name.toLowerCase().includes(query.toLowerCase()) || result.mac.toLowerCase().includes(query.toLowerCase()) || result.ip.toLowerCase().includes(query.toLowerCase());
    });
  }

  async sendTelegramAction(args, state) {

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
