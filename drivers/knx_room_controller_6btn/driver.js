'use strict';

const KNXGenericDriver = require('../../lib/GenericKNXDriver');

class KNXRoomController6Btn extends KNXGenericDriver {

  async onInit() {
    await super.onInit();
    this.log('KNX Room Controller 6-Button driver has been initialized');
  }

  async onPairListDevices() {
    return [
      {
        name: this.homey.__('pair.room_controller_6btn.name'),
        data: {
          id: Math.random().toString(36).substr(2, 9),
        },
      },
    ];
  }

}

module.exports = KNXRoomController6Btn;