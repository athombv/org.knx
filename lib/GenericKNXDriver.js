'use strict';

const Homey = require('homey');
const uuidv4 = require('uuid/v4');

class GenericKNXDriver extends Homey.Driver {
    getInterfaceList() {
        return Object.values(Homey.app.returnKNXInterfacesList()).map((knxInterface) => {
            return {
                name: knxInterface.name,
                mac: knxInterface.macAddress,
                ip: knxInterface.ipAddress
            }
        });
    }

    // Obtain a stored ETS export for the selected IP interface.
    getGroupAddressList() {
        //console.log('Getting ga for interface:', this.selectedInterfaceMAC);
        if(this.selectedInterfaceMAC) {
            const result = Homey.ManagerSettings.get('etsimport' + this.selectedInterfaceMAC);
            if (result) {
                return Object.values(result).map((groupAddress) => {
                    return {
                        name: groupAddress.name,
                        address: groupAddress.ga,
                        datapoint: groupAddress.dpt
                    }
                });
            } else {
                //console.error('No addresses known for this mac!');
                return null;
            }
        } else { 
            this.error('A IP interface MAC should be selected first!');
            return new Error(Homey.__('errors.ip.interface_not_selected'));
        }
    }

    onPair(socket) {
        this.selectedInterfaceMAC;
        this.manualInterfaceIP;

        // Generate and return an uuid
        socket.on('get_uuid', (data, callback) => {
            callback(null, uuidv4());
        });

        // List al the found or added IP interfaces.
        socket.on('list_interfaces', (data, callback) => {
            callback(null, this.getInterfaceList());
        });

        //needs to be checked, then is not working correclty
           //  However the strucutre seems to be the same as the manual entry, which does work.
        // Trigger the interfacemanager to search for KNX IP interfaces
        socket.on('search_interfaces', (data, callback) => {
            Homey.app.searchInterfaces()
                .then(() => { callback(null, this.getInterfaceList()) })
                .catch((error) => { callback(new Error(Homey.__(`errors.ip.${error}`), null)) })
        });

        // Check if the given IP can be used for an KNX connection.
        socket.on("manual_ip_address", (manualIPAddress, callback) => {
            Homey.app.discoverKNXInterfaceOnIP(manualIPAddress)
                .then(() => { callback(null, this.getInterfaceList()) })
                .catch((error) => { callback(new Error(Homey.__(`errors.ip.${error}`), null)) })
        });

        // Let the interface manager know which interface to use.
        socket.on('selected_interface', (mac, callback) => {
            if (mac && mac !== '') {
                this.selectedInterfaceMAC = mac;
                Homey.app.connectInterface(this.selectedInterfaceMAC);
                callback(null, true);
            } else {
                callback(new Error(Homey.__(`errors.ip.${no_valid_mac}`), null));
            }
        });

        socket.on('return_selected_interface', (data, callback) => {
            if (this.selectedInterfaceMAC) { callback(null, this.selectedInterfaceMAC) }
            else { callback('no_matching_interface', null); }
        });

        // ETS export stuff
        socket.on('checks_existing_groupaddresses', (data, callback) =>{
            if (Homey.ManagerSettings.get('etsimport')) { callback(null, true) }
            else { callback(null, false) }
        });

        // Save the uploaded ETS export as a setting under the mac address of the interface.
        socket.on('uploaded_groupaddresses', (data) => {
            if (this.selectedInterfaceMAC) {
                Homey.ManagerSettings.set('etsimport' + this.selectedInterfaceMAC, data);
            } else { 
                this.error('A IP interface MAC should be selected first!');
            }
        });

        socket.on('list_etsimport', (data, callback) => {
            const result = this.getGroupAddressList();
            // check if listing the ETS import returned errors
            if (result instanceof Error) { callback(result, null) }
            else { callback(null, result) }
        });

        // Learnmode stuff
        socket.on('learnmode', (data, callback) => {
            let time = 10000;
            // If there is a selected interface, start the learnmode on it.
            if (this.selectedInterfaceMAC) {
                this.log('Starting learnmode');
                Homey.app.startLearnmodeSwitch(this.selectedInterfaceMAC, time)
                    .then(result => { callback(null, result) })
                    .catch(err => { callback(err) })
            }
        });

        // Groupaddress stuff

        // Test the user-selected groupaddress through the selected interface.
        socket.on('test_groupaddress', (data, callback) => {
            if (this.selectedInterfaceMAC) {
                this.log('going to test ga', data.address, 'time', data.time);
                callback(Homey.app.testGroupAddress(this.selectedInterfaceMAC, data.address, data.time));
            }
        });
    }
}

module.exports = GenericKNXDriver;