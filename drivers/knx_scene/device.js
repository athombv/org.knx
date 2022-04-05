'use strict';

const KNXGenericDevice = require('../../lib/GenericKNXDevice');
const DatapointTypeParser = require('../../lib/DatapointTypeParser');

class KNXScene extends KNXGenericDevice {

  async onInit() {
    // Migration
    // Add the new scene capability
    if (!this.hasCapability('scene_capability')) {
      await this.addCapability('scene_capability');
    }
    // Remove the old onoff capability
    if (this.hasCapability('onoff')) {
      await this.removeCapability('onoff');
    }

    super.onInit();

    this.registerCapabilityListener('scene_capability', this.triggerToScene.bind(this));
  }

  onKNXEvent(groupaddress, data) {
    super.onKNXEvent(groupaddress, data);

    if (groupaddress === this.settings.ga_scene
      && DatapointTypeParser.dpt17(data) === this.settings.scene_number - 1) {
      // Trigger any flow that is bound on this device.
      this.homey.flow.getDeviceTriggerCard('trigger_from_scene')
        .trigger(this)
        .catch(err => this.log(err));
    }
  }

  // This function triggers a scene from Homey.
  // Either from the button in de device overview or from a flow card.
  async triggerToScene() {
    if (!this.knxInterface) {
      throw new Error(this.homey.__('errors.ip.interface_not_found'));
    }

    if (!this.settings.ga_scene) {
      throw new Error(this.homey.__('errors.invalid_group_address'));
    }

    if (!this.settings.scene_number) {
      throw new Error(this.homey.__('errors.invalid_scene_number'));
    }
    // The -1 is temporary until the knx.js lib fully supports scenes
    return this.knxInterface.writeKNXGroupAddress(this.settings.ga_scene, (this.settings.scene_number - 1), 'DPT17')
      .catch(knxerror => {
        throw new Error(this.homey.__('errors.switch_failed'), knxerror);
      });
  }

}

module.exports = KNXScene;
