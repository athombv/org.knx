'use strict';

const Homey = require('homey');
const uuidv4 = require('uuid/v4');

class KNXGenericDriver extends Homey.Driver {

    /* onPairListDevices(data, callback){
        callback(null, [
            {
                name: 'KNX generic device',
                data: {
                    id: uuidv4()
                },
                settings: {
                    macAddress: "00246d0157"
                }
            }
        ]);
    } */

    getInterfaceList() {
        return Object.values(Homey.app.returnKNXInterfacesList()).map((knxInterface) => {
            return {
                name: knxInterface.name,
                mac: knxInterface.macAddress,
                ip: knxInterface.ipAddress
            }
        });
    }

    getGroupAddressList() {
        console.log('getting ga for interface:', this.selectedInterfaceMAC);
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
                console.error('No addresses know for this mac!');
                return null;
            }
        } else { console.error('A IP interface MAC should be selected first!')}
    }

    onPair(socket) {
        this.selectedInterfaceMAC;
        this.manualInterfaceIP;

        socket.on('list_interfaces', (data, callback) => {
            callback(null, this.getInterfaceList());
        });

        socket.on('search_interfaces', () => {
            Homey.app.searchInterfaces();
        });

        socket.on("manual_ip_address", (manualIPAddress, callback) => {
            this.manualInterfaceIP = manualIPAddress;
            console.log('manual ip', this.manualInterfaceIP);
            Homey.app.discoverKNXInterfaceOnIP(this.manualInterfaceIP)
                .then(() => {
                    callback(null, this.getInterfaceList());
                })
                .catch(callback);
        });

        socket.on('selected_interface', (mac, callback) => {
            this.selectedInterfaceMAC = mac;
            console.log('selected mac in driver', this.selectedInterfaceMAC);
            Homey.app.connectInterface(this.selectedInterfaceMAC);
        });

        socket.on('checks_existing_groupaddresses', (data, callback) =>{
            if (Homey.ManagerSettings.get('etsimport')) {
                callback(true);
            } else { callback(false); }
        });

        socket.on('uploaded_groupaddresses', (data) => {
            if(this.selectedInterfaceMAC) {
                Homey.ManagerSettings.set('etsimport' + this.selectedInterfaceMAC, data);
            } else { console.error('A IP interface MAC should be selected first!')}
        });

        socket.on('list_etsimport', (data, callback) => {
            //callback(null, Homey.ManagerSettings.get('etsimport'));
            callback(null, this.getGroupAddressList());
        });

        socket.on('set_devicedata', (data, callback) => {
            this.groupAdresses = data.groupAddress;
            this.name = data.name;
        });
    }
}

module.exports = KNXGenericDriver;