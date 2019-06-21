const InterfaceManager = require('../lib/KNXInterfaceManager');

KNXManager = new InterfaceManager('192.168.87.250'); // localhost works as well as an normal IP
this.KNXInterfaces = KNXManager.getKNXInterfaceList();

KNXManager.on('interface_found', (interface) => {
    if (interface.macAddress.startsWith('000e8c')) {
        // hager filtering
        interface._connectKNX();
    }
});
