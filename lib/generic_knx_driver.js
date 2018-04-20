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
                mac: knxInterface.macAddress
            }
        });
    }

    getGroupAddressList() {
        return Object.values(Homey.ManagerSettings.get('etsimport')).map((groupAddress) => {
            return {
                name: groupAddress.name,
                address: groupAddress.ga
            }
        });
    }

    onPair(socket) {
        let selectedInterfaceMAC;
        let manualInterfaceIP;
        socket.on('list_interfaces', (data, callback) => {
            callback(null, this.getInterfaceList());
        });

        socket.on('selected_interface', (mac, callback) => {
            selectedInterfaceMAC = mac;
            console.log('selected mac in driver', selectedInterfaceMAC);
        });

        socket.on("manual_ip_address", (manualIPAddress, callback) => {
            manualInterfaceIP = manualIPAddress;
            console.log('manual ip', manualInterfaceIP);
            Homey.app.discoverKNXInterfaceOnIP(manualInterfaceIP)
                .then(() => {
                    callback(null, this.getInterfaceList());
                })
                .catch(callback);
        });

        socket.on('checks_existing_groupaddresses', (data, callback) =>{
            if (Homey.ManagerSettings.get('etsimport')) {
                callback(true);
            } else { callback(false); }
        });

        socket.on('uploaded_groupaddresses', (data) => {
            Homey.ManagerSettings.set('etsimport', data);
        });

        socket.on('list_etsimport', (data, callback) => {
            //callback(null, Homey.ManagerSettings.get('etsimport'));
            callback(null, this.getGroupAddressList());
        });
    }
}

module.exports = KNXGenericDriver;