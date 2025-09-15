'use strict';

const KNXGenericDriver = require('../../lib/GenericKNXDriver');

class KNXAuro extends KNXGenericDriver {

  async onInit() {
    await super.onInit();
    this.log('KNX Auro driver has been initialized');
  }

  async onPairListDevices() {
    return [
      {
        name: this.homey.__('pair.auro.name'),
        data: {
          id: Math.random().toString(36).substr(2, 9),
        },
      },
    ];
  }

}

module.exports = KNXAuro;