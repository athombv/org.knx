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
    sendTelegramAction.registerRunListener(this.sendKNXTelegram.bind(this));


    this.receiveTelegramTrigger = this.homey.flow.getTriggerCard('knx_receive');
    this.eventListenerGroupAddresses = [];

    this.receiveTelegramTrigger.registerRunListener(async (args, state) => {
      console.log("registerRunListener", args, state);
      //TODO: allow globs for cool trigger types
      return args.group_address === state.group_address && (args.interface.mac === "any" || args.interface.mac === state.interface.mac);
    });

    this.receiveTelegramTrigger.getArgumentValues().then(this.registerKNXEventHandlers.bind(this));

    this.receiveTelegramTrigger.on("update", () => {
      this.receiveTelegramTrigger.getArgumentValues().then(this.registerKNXEventHandlers.bind(this));
    });

    sendTelegramAction.registerArgumentAutocompleteListener("interface", this.interfaceAutocomplete.bind(this));
    this.receiveTelegramTrigger.registerArgumentAutocompleteListener("interface", this.interfaceAutocomplete.bind(this));

    
    this.KNXInterfaceFoundHandler = this.onKNXInterface.bind(this);
    this.knxInterfaceManager.on('interface_found', this.KNXInterfaceFoundHandler);
  }

  // referenced via this.KNXEventHandler
  onKNXEvent(knxInterface, groupaddress, data) {
    const tokens = { value_number: data, value_bool: data > 0 };
    const state = { group_address: groupaddress, interface: knxInterface };

    this.log("onKNXEvent", tokens, state);
    // trigger the card
    let prom = this.recieveTelegramTrigger.trigger(tokens, state)
    console.log(prom)
    prom.then((e) => {
      console.log("TESTER", e)
    })
      .catch((e) => {
        console.log("ERROR", e)
      
      });

    this.log("after the event");
  }
  
  /**
   * Handler for the interface found
   */
  onKNXInterface(knxInterface) {
    this.receiveTelegramTrigger.getArgumentValues().then(this.registerKNXEventHandlers.bind(this));
  }

  registerKNXEventHandlers(args) {
    args.forEach(event => {
      if (!this.eventListenerGroupAddresses.includes(event.interface.mac + "-" + event.group_address)) {
        this.log("adding event listener", event.interface.mac+ "-" + event.group_address)

        let knxInterfaceToUse = this.knxInterfaceManager.getKNXInterface(event.interface.mac);

        if (event.interface.mac == "any") {
          const availableInterfaces = this.knxInterfaceManager.getKNXInterfaceList();
          let macs = Object.keys(availableInterfaces);
          knxInterfaceToUse = macs.length > 0 ? availableInterfaces[macs[0]] : null;
        }

        if (!knxInterfaceToUse) {
          this.error('Interface not found');
        } else {

          this.eventListenerGroupAddresses.push(event.interface.mac + "-" + event.group_address);
          // Store the event listener so we can remove it later
          knxInterfaceToUse.addKNXEventListener(event.group_address, this.onKNXEvent.bind(this, event.interface));
        }
      }

    });

    this.eventListenerGroupAddresses.forEach(eventListernerId => {
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

  async sendKNXTelegram(args, state) {

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
