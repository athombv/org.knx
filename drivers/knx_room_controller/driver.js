'use strict';

const KNXGenericDriver = require('../../lib/GenericKNXDriver');

class KNXRoomController extends KNXGenericDriver {

  async onInit() {
    await super.onInit();
    this.log('KNX Room Controller driver has been initialized');
  }

  async onPairListDevices() {
    return [
      {
        name: this.homey.__('pair.room_controller.name'),
        data: {
          id: Math.random().toString(36).substr(2, 9),
        },
      },
    ];
  }

}

module.exports = KNXRoomController;
