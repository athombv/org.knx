'use strict';

const InterfaceManager = require('../lib/KNXInterfaceManager');

const KNXManager = new InterfaceManager('192.168.21.191'); // localhost works as well as an normal IP
this.KNXInterfaces = KNXManager.getKNXInterfaceList();

KNXManager.on('interface_found', (foundInterface) => {
  if (foundInterface.macAddress.startsWith('000e8c')) {
    // hager filtering
    foundInterface._connectKNX();
  }
});
