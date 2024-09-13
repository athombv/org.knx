'use strict';

const KNXGenericDevice = require('../../lib/GenericKNXDevice');
const DatapointTypeParser = require('../../lib/DatapointTypeParser');

class KNXSunBlind extends KNXGenericDevice {

  onInit() {
    super.onInit();
    this.registerCapabilityListener('windowcoverings_set', this.onCapabilitySunBlindPosition.bind(this));
    this.registerCapabilityListener('windowcoverings_tilt_set', this.onCapabilitySlatSunBlindPosition.bind(this));
  }

  onKNXEvent(groupaddress, data) {
    super.onKNXEvent(groupaddress, data);
    if (groupaddress === this.settings.ga_store_position) {
      this.setCapabilityValue('windowcoverings_set', DatapointTypeParser.dim(data))
        .catch((knxerror) => {
          this.log('Set store position error', knxerror);
        });
    }
    if (groupaddress === this.settings.ga_slat_position) {
      this.setCapabilityValue('windowcoverings_tilt_set', DatapointTypeParser.dim(data))
        .catch((knxerror) => {
          this.log('Set slat position error', knxerror);
        });
    }
  }

  onCapabilitySunBlindPosition(value, opts) {
    if (this.knxInterface && this.settings.ga_store_position) {
      return this.knxInterface.writeKNXGroupAddress(this.settings.ga_store_position, 255 - value * 255, 'DPT5')
        .catch((knxerror) => {
          this.log(knxerror);
          throw new Error(this.homey.__('errors.windowcoverings_set_failed'));
        });
    }
    return null;
  }

  onCapabilitySlatSunBlindPosition(value, opts) {
    if (this.knxInterface && this.settings.ga_slat_position) {
      return this.knxInterface.writeKNXGroupAddress(this.settings.ga_slat_position, 255 - value * 255, 'DPT5')
        .catch((knxerror) => {
          this.log(knxerror);
          throw new Error(this.homey.__('errors.windowcoverings_tilt_set_failed'));
        });
    }
    return null;
  }

}

module.exports = KNXSunBlind;
