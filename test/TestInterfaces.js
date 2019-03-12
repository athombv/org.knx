const InterfaceManager = require('../lib/KNXInterfaceManager');

KNXManager = new InterfaceManager('127.0.0.1'); // localhost works as well as an normal IP
this.KNXInterfaces = KNXManager.getKNXInterfaceList();

KNXManager.on('interface_found', (interface) => {
    if (interface.macAddress.startsWith('000e8c')) {
        // hager filtering
        interface._connectKNX();
    }
});
