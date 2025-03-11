'use strict';

const KNXGenericDevice = require('../../lib/GenericKNXDevice');
const DatapointTypeParser = require('../../lib/DatapointTypeParser');

class KNXWindowCovering extends KNXGenericDevice {

  onInit() {
    super.onInit();
    this.registerCapabilityListener('windowcoverings_state', this.onCapabilityWindowCovering.bind(this));
  }

  onKNXEvent(groupaddress, data) {
    super.onKNXEvent(groupaddress, data);
    if (groupaddress === this.settings.ga_status) {
      const state = DatapointTypeParser.bitFormat(data);
      if (state) {
        if (this.settings.invert_updown === true) {
          this.setCapabilityValue('windowcoverings_state', 'up')
            .catch((knxerror) => {
              this.log('Set windowcoverings_state error', knxerror);
            });
        } else {
          this.setCapabilityValue('windowcoverings_state', 'down')
            .catch((knxerror) => {
              this.log('Set windowcoverings_state error', knxerror);
            });
        }
      } else if (this.settings.invert_updown === true) {
        this.setCapabilityValue('windowcoverings_state', 'down')
          .catch((knxerror) => {
            this.log('Set windowcoverings_state error', knxerror);
          });
      } else {
        this.setCapabilityValue('windowcoverings_state', 'up')
          .catch((knxerror) => {
            this.log('Set windowcoverings_state error', knxerror);
          });
      }
      this.log(state);
    }
  }

  onCapabilityWindowCovering(value, opts) {
    this.log(value);
    if (this.knxInterface) {
      switch (value) {
        case 'up':
          if (this.settings.invert_updown === true) {
            return this.knxInterface.writeKNXGroupAddress(this.settings.ga_up_down, 1, 'DPT1')
              .catch((knxerror) => {
                throw new Error(this.homey.__('errors.windowcovering_failed'), knxerror);
              });
          }
          return this.knxInterface.writeKNXGroupAddress(this.settings.ga_up_down, 0, 'DPT1')
            .catch((knxerror) => {
              throw new Error(this.homey.__('errors.windowcovering_failed'), knxerror);
            });
        case 'down':
          if (this.settings.invert_updown === true) {
            return this.knxInterface.writeKNXGroupAddress(this.settings.ga_up_down, 0, 'DPT1')
              .catch((knxerror) => {
                throw new Error(this.homey.__('errors.windowcovering_failed'), knxerror);
              });
          }
          return this.knxInterface.writeKNXGroupAddress(this.settings.ga_up_down, 1, 'DPT1')
            .catch((knxerror) => {
              throw new Error(this.homey.__('errors.windowcovering_failed'), knxerror);
            });
        case 'idle':
          this.log('stop selected, stop address', this.settings.ga_stop);
          if (this.settings.ga_stop) {
            return this.knxInterface.writeKNXGroupAddress(this.settings.ga_stop, 1, 'DPT1')
              .catch((knxerror) => {
                throw new Error(this.homey.__('errors.windowcovering_failed'), knxerror);
              });
          }
          break;
        default:
          throw new Error(this.homey.__('errors.windowcovering_failed'));
      }
    }
    return null;
  }

}

module.exports = KNXWindowCovering;
