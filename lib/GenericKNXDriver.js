'use strict';

const Homey = require('homey');
const { v4: uuidv4 } = require('uuid');

class GenericKNXDriver extends Homey.Driver {

  onInit() {
    this.knxInterfaceManager = this.homey.app.getKNXInterfaceManager();
  }

  // Obtain a stored ETS export for the selected IP interface.
  getGroupAddressList() {
    // console.log('Getting ga for interface:', this.selectedInterfaceMAC);
    if (this.selectedInterfaceMAC) {
      const result = this.homey.settings.get(`etsimport${this.selectedInterfaceMAC}`);
      if (result) {
        return Object.values(result).map((groupAddress) => {
          return {
            name: groupAddress.name,
            address: groupAddress.ga,
            datapoint: groupAddress.dpt,
          };
        });
      }
      // console.error('No addresses known for this mac!');
      return null;
    }
    this.error('A IP interface MAC should be selected first!');
    return new Error(this.homey.__('errors.ip.interface_not_selected'));
  }

  async onPair(session) {
    this.selectedInterfaceMAC = '';
    this.manualInterfaceIP = '';

    // Generate and return an uuid
    session.setHandler('get_uuid', async () => {
      return uuidv4();
    });

    // List al the found or added IP interfaces.
    session.setHandler('list_interfaces', async () => {
      return this.knxInterfaceManager.getSimpleInterfaceList();
    });

    // However the structure seems to be the same as the manual entry, which does work.
    // Trigger the interface manager to search for KNX IP interfaces
    session.setHandler('search_interfaces', async () => {
      try {
        await this.knxInterfaceManager.searchInterfaces();
        return this.knxInterfaceManager.getSimpleInterfaceList();
      } catch (error) {
        throw new Error(this.homey.__(`errors.ip.${error.message}`));
      }
    });

    // Check if the given IP can be used for an KNX connection.
    session.setHandler('manual_ip_address', async (manualIPAddress) => {
      try {
        await this.knxInterfaceManager.discoverKNXInterfaceOnIP(manualIPAddress);
        return this.knxInterfaceManager.getSimpleInterfaceList();
      } catch (error) {
        throw new Error(this.homey.__(`errors.ip.${error.message}`));
      }
    });

    // Let the interface manager know which interface to use.
    session.setHandler('selected_interface', async (mac) => {
      if (mac && mac !== '') {
        this.selectedInterfaceMAC = mac;
        this.knxInterfaceManager.connectInterface(this.selectedInterfaceMAC);
      } else {
        throw new Error(this.homey.__('errors.ip.no_valid_mac'));
      }
    });

    session.setHandler('return_selected_interface', async () => {
      if (this.selectedInterfaceMAC) {
        return this.selectedInterfaceMAC;
      }

      throw new Error('no_matching_interface');
    });

    // ETS export stuff
    // TODO not used?
    session.setHandler('checks_existing_groupaddresses', async () => {
      return this.homey.settings.get('etsimport');
    });

    // Save the uploaded ETS export as a setting under the mac address of the interface.
    session.setHandler('uploaded_groupaddresses', async (data) => {
      if (this.selectedInterfaceMAC) {
        this.homey.settings.set(`etsimport${this.selectedInterfaceMAC}`, data);
      } else {
        this.error('A IP interface MAC should be selected first!');
      }
    });

    session.setHandler('list_etsimport', async () => {
      const result = this.getGroupAddressList();
      // check if listing the ETS import returned errors
      if (result instanceof Error) {
        throw result;
      } else {
        return result;
      }
    });

    // Learnmode stuff
    session.setHandler('learnmode', async () => {
      const time = 9000; // 9 second because there is a 'bug' somewhere that stops the socket from sending results after 10 sec.

      // If there is a selected interface, start the learnmode on it.
      if (this.selectedInterfaceMAC) {
        return this.homey.app.startLearnmodeSwitch(this.selectedInterfaceMAC, time);
      }
      throw new Error();
    });

    // Groupaddress stuff

    // Test the user-selected groupaddress through the selected interface.
    session.setHandler('test_groupaddress', async (data) => {
      if (this.selectedInterfaceMAC) {
        this.log('going to test ga', data.address, 'time', data.time);
        return this.knxInterfaceManager.testGroupAddress(this.selectedInterfaceMAC, data.address, data.time);
      }
      throw new Error();
    });
  }

}

module.exports = GenericKNXDriver;
