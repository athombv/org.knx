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
    onPair(socket) {
        socket.on('list_interfaces', (data, callback) => {
            callback(null, Object.values(Homey.app.returnKNXInterfacesList()).map((interface) => {
                return {
                    name: interface.name,
                    mac: interface.macAddress
                }
            }));
        });
    }
}

module.exports = KNXGenericDriver;