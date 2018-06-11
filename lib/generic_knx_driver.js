'use strict';

const Homey = require('homey');
const uuidv4 = require('uuid/v4');

class KNXGenericDriver extends Homey.Driver {
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
        } else { console.error('A IP interface MAC should be selected first!')}
    }

    onPair(socket) {
        this.selectedInterfaceMAC;
        this.manualInterfaceIP;

        // List al the found or added IP interfaces.
        socket.on('list_interfaces', (data, callback) => {
            callback(null, this.getInterfaceList());
        });


        // Trigger the interfacemanager to search for KNX IP interfaces
        socket.on('search_interfaces', () => {
            Homey.app.searchInterfaces();
        });


        // Check if the given IP can be used for an KNX connection.
        socket.on("manual_ip_address", (manualIPAddress, callback) => {
            this.manualInterfaceIP = manualIPAddress;
            Homey.app.discoverKNXInterfaceOnIP(this.manualInterfaceIP)
                .then(() => {
                    callback(null, this.getInterfaceList());
                })
                .catch(callback);
        });


        // Let the interface manager know which interface to use.
        socket.on('selected_interface', (mac, callback) => {
            this.selectedInterfaceMAC = mac;
            Homey.app.connectInterface(this.selectedInterfaceMAC);
        });

        socket.on('return_selected_interface', (data, callback) => {
            if(this.selectedInterfaceMAC) {
                callback(null, this.selectedInterfaceMAC);
            }
            else {
                callback('no_matching_interface');
            }
            // !!return an error when there is no selected MAC!! Homey.error("No interface") or something?
        });

        // ETS export stuff
        socket.on('checks_existing_groupaddresses', (data, callback) =>{
            if (Homey.ManagerSettings.get('etsimport')) {
                callback(null, true);
            } else { callback(null, false); }
        });

        // Save the uploaded ETS export as a setting under the mac address of the interface.
        socket.on('uploaded_groupaddresses', (data) => {
            if (this.selectedInterfaceMAC) {
                Homey.ManagerSettings.set('etsimport' + this.selectedInterfaceMAC, data);
            } else { console.error('A IP interface MAC should be selected first!')}
        });

        socket.on('list_etsimport', (data, callback) => {;
            callback(null, this.getGroupAddressList());
        });

        // Learnmode stuff
        socket.on('learnmode', (data, callback) => {
            let time = 10000;
            // If there is a selected interface, start the learnmode on it.
            if (this.selectedInterfaceMAC) {
                console.log('Starting learnmode');
                Homey.app.startLearnmodeSwitch(this.selectedInterfaceMAC, time)
                    .then(result => {
                        callback(null, result);
                    })
                    .catch(err => {
                        callback(err);
                    })
            }
        });

        // Groupaddress stuff

        // Test the user-selected groupaddress through the selected interface.
        socket.on('test_groupaddress', (data, callback) => {
            if (this.selectedInterfaceMAC) {
                console.log('going to test ga', data.address, 'time', data.time);
                callback(Homey.app.testGroupAddress(this.selectedInterfaceMAC, data.address, data.time));
            }
        });
    }
}

module.exports = KNXGenericDriver;