'use strict';

const KNXGenericDevice = require('../../lib/GenericKNXDevice');
const DatapointTypeParser = require('../../lib/DatapointTypeParser');

class KNXScene extends KNXGenericDevice {

  onInit() {
    super.onInit();
    this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));

    this.homey.flow
      .getActionCard('trigger_to_scene')
      .registerRunListener(async (args, state) => {
        await this.triggerToScene();
      });

    this.triggerFlowFromScene = this.homey.flow.getDeviceTriggerCard('trigger_from_scene');
  }

  onKNXEvent(groupaddress, data) {
    super.onKNXEvent(groupaddress, data);

    if (groupaddress === this.settings.ga_scene) {
      this.setCapabilityValue('onoff', DatapointTypeParser.onoff(data));
      // Trigger any flow that is bound on this device.
      this.triggerFlowFromScene.trigger()
        .catch(err => this.log(err));
    }
  }

  onCapabilityOnoff(value, opts) {
    if (this.knxInterface && this.settings.ga_scene && value === true) {
      return this.triggerToScene();
    }
    return null;
  }

  // This function triggers a scene from Homey.
  // Either from the button in de device overview or from a flow card.
  async triggerToScene() {
    // The -1 is temporary until the knx.js lib fully supports scenes
    return this.knxInterface.writeKNXGroupAddress(this.settings.ga_scene, (this.settings.scene_number - 1), 'DPT17')
      .catch(knxerror => {
        throw new Error(this.homey.__('errors.switch_failed'), knxerror);
      });
  }

}

module.exports = KNXScene;
