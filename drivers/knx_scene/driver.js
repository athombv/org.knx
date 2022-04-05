'use strict';

const KNXGenericDriver = require('../../lib/GenericKNXDriver');

class KNXScene extends KNXGenericDriver {

  onInit() {
    super.onInit();

    this.homey.flow
      .getActionCard('trigger_to_scene')
      .registerRunListener(async args => {
        return args['knx_scene'].triggerToScene();
      });
  }

}

module.exports = KNXScene;
