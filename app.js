'use strict';

const Homey = require('homey');
const dptlib = require('knx/src/dptlib');
const KNXInterfaceManager = require('./lib/KNXInterfaceManager');

class KNXApp extends Homey.App {

  async onInit() {
    this.log('KNXApp is running...');
    const address = await this.homey.cloud.getLocalAddress();
    const homeyIP = address.split(':', 1).toString();

    const types = Object.keys(dptlib).filter((k) => k.startsWith('DPT'));
    this.availableKnxDataTypes = [];
    types.forEach((dpt) => {
      this.availableKnxDataTypes.push({ name: dpt });
      if (dptlib[dpt].subtypes) {
        this.availableKnxDataTypes.push(...Object.keys(dptlib[dpt].subtypes).map((subtype) => ({ name: `${dpt}.${subtype}` })));
      }
    });

    this.log('Homey IP + Parsed IP', address, homeyIP);
    this.knxInterfaceManager = new KNXInterfaceManager(homeyIP);

    const sendTelegramAction = this.homey.flow.getActionCard('knx_send');
    sendTelegramAction.registerRunListener(this.sendKNXTelegram.bind(this));

    this.receiveTelegramTrigger = this.homey.flow.getTriggerCard('knx_receive');
    this.eventListenerGroupAddresses = [];

    this.receiveTelegramTrigger.registerRunListener(async (args, state) => {
      console.log('registerRunListener', args, state);
      // TODO: allow globs for cool trigger types
      return args.group_address === state.group_address && (args.interface.mac === 'any' || args.interface.mac === state.interface.mac);
    });

    this.receiveTelegramTrigger.getArgumentValues().then(this.registerKNXEventHandlers.bind(this));

    this.receiveTelegramTrigger.on('update', () => {
      this.receiveTelegramTrigger.getArgumentValues().then(this.registerKNXEventHandlers.bind(this));
    });

    sendTelegramAction.registerArgumentAutocompleteListener('interface', this.interfaceAutocomplete.bind(this));
    this.receiveTelegramTrigger.registerArgumentAutocompleteListener('interface', this.interfaceAutocomplete.bind(this));

    sendTelegramAction.registerArgumentAutocompleteListener('data_type', this.datatypeAutocomplete.bind(this));
    this.receiveTelegramTrigger.registerArgumentAutocompleteListener('data_type', this.datatypeAutocomplete.bind(this));

    this.KNXInterfaceFoundHandler = this.onKNXInterface.bind(this);
    this.knxInterfaceManager.on('interface_found', this.KNXInterfaceFoundHandler);
  }

  // referenced via this.KNXEventHandler
  onKNXEvent(args, groupaddress, data) {
    try {

      const dpt = dptlib.resolve(args.data_type.name);
      const value = dptlib.fromBuffer(data, dpt);
      const tokens = { value_number: 0, value_bool: false, value_string: '' };

      if (typeof (value) === 'number') {
        tokens.value_number = value;
        tokens.value_bool = value > 0;
        tokens.value_string = value.toString();
        if (dpt.subtype && dpt.subtype.unit) {
          tokens.value_string += ` ${dpt.subtype.unit}`;
        }
      } else if (typeof (value) === 'boolean') {
        tokens.value_bool = value;
        tokens.value_number = value ? 1 : 0;
        tokens.value_string = value.toString();
      } else if (typeof (value) === 'string') {
        tokens.value_string = value;
        tokens.value_bool = value !== '';
        tokens.value_number = value.length;
      }

      console.log('onKNXEvent', groupaddress, data, tokens);
      const state = { group_address: groupaddress, interface: args.interface, data_type: args.data_type };
      this.receiveTelegramTrigger.trigger(tokens, state).then((e) => {
        console.log(e);
      })
        .catch((e) => {
          console.log(e);
        });
    } catch (e) {
      console.log(e);
    }
  }

  /**
   * Handler for the interface found
   */
  onKNXInterface(knxInterface) {
    this.receiveTelegramTrigger.getArgumentValues().then(this.registerKNXEventHandlers.bind(this));
  }

  registerKNXEventHandlers(cards) {
    cards.forEach((args) => {
      if (!this.eventListenerGroupAddresses.includes(`${args.interface.mac}-${args.group_address}`)) {
        this.log('adding event listener', `${args.interface.mac}-${args.group_address}`);

        let knxInterfaceToUse = this.knxInterfaceManager.getKNXInterface(args.interface.mac);

        if (args.interface.mac === 'any') {
          const availableInterfaces = this.knxInterfaceManager.getKNXInterfaceList();
          const macs = Object.keys(availableInterfaces);
          knxInterfaceToUse = macs.length > 0 ? availableInterfaces[macs[0]] : null;
        }

        if (!knxInterfaceToUse) {
          this.error('Interface not found');
        } else {
          this.eventListenerGroupAddresses.push(`${args.interface.mac}-${args.group_address}`);
          // Store the event listener so we can remove it later
          knxInterfaceToUse.addKNXEventListener(args.group_address, this.onKNXEvent.bind(this, args));
        }
      }
    });

    this.eventListenerGroupAddresses.forEach((eventListernerId) => {
      if (cards.filter((args) => `${args.interface}-${args.group_address}` === eventListernerId).length === 0) {
        // TODO: figuure out how to remove the event listener, because we need the correct event listener
        // knxInterfaceToUse.removeKNXEventListener(groupAddress, this.onKNXEvent.bind( this, args));
      }
    });
  }

  async interfaceAutocomplete(query, args) {
    const results = this.knxInterfaceManager.getSimpleInterfaceList();
    results.push({ name: '[any]', mac: 'any', ip: 'any' });

    // filter based on the query
    return results.filter((result) => (
      result.name.toLowerCase().includes(query.toLowerCase())
      || result.mac.toLowerCase().includes(query.toLowerCase())
      || result.ip.toLowerCase().includes(query.toLowerCase())
    ));
  }

  async datatypeAutocomplete(query, args) {
    return this.availableKnxDataTypes.filter((r) => r.name.includes(query.toUpperCase()));
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

    if (!knxInterfaceToUse) {
      return Promise.reject(new Error('Interface not found'));
    }

    if (!args.group_address) {
      return Promise.reject(new Error('No group address selected'));
    }

    if (args.data_type === 'none') {
      return knxInterfaceToUse.writeKNXGroupAddress(args.group_address, args.value);
    }

    return knxInterfaceToUse.writeKNXGroupAddress(args.group_address, args.value, args.data_type.name);
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
