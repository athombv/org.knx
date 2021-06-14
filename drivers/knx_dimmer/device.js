'use strict';

const KNXGenericDevice = require('../../lib/GenericKNXDevice');
const DatapointTypeParser = require('../../lib/DatapointTypeParser');

class KNXDimmer extends KNXGenericDevice {

  onInit() {
    super.onInit();
    this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
    this.registerCapabilityListener('dim', this.onCapabilityDim.bind(this));
  }

  onKNXEvent(groupaddress, data) {
    super.onKNXEvent(groupaddress, data);
    if (groupaddress === this.settings.ga_status) {
      this.setCapabilityValue('onoff', DatapointTypeParser.onoff(data))
        .catch(knxerror => {
          this.log('Set onoff error', knxerror);
        });
    }
    if (groupaddress === this.settings.ga_dim_status) {
      this.setCapabilityValue('dim', DatapointTypeParser.dim(data))
        .catch(knxerror => {
          this.log('Set dim error', knxerror);
        });
    }
  }

  onKNXConnection(connectionStatus) {
    super.onKNXConnection(connectionStatus);

    if (connectionStatus === 'connected') {
      // Reading the groupaddress will trigger a event on the bus.
      // This will be catched by onKNXEvent, hence the return value is not used.
      if (this.settings.ga_status) {
        this.knxInterface.readKNXGroupAddress(this.settings.ga_status)
          .catch(knxerror => {
            this.log(knxerror);
          });
      }
      if (this.settings.ga_dim_status) {
        this.knxInterface.readKNXGroupAddress(this.settings.ga_dim_status)
          .catch(knxerror => {
            this.log(knxerror);
          });
      }
    }
  }

  onCapabilityOnoff(value, opts) {
    if (this.knxInterface && this.settings.ga_switch) {
      return this.knxInterface.writeKNXGroupAddress(this.settings.ga_switch, value, 'DPT1')
        .catch(knxerror => {
          this.log(knxerror);
          throw new Error(this.homey.__('errors.switch_failed'));
        });
    }
    return null;
  }

  onCapabilityDim(value, opts) {
    if (this.knxInterface && this.settings.ga_dim) {
      if (value > 0) {
        this.setCapabilityValue('onoff', true)
          .catch(knxerror => {
            this.log('Set onoff error', knxerror);
          });
      } else {
        this.setCapabilityValue('onoff', false)
          .catch(knxerror => {
            this.log('Set onoff error', knxerror);
          });
      }
      return this.knxInterface.writeKNXGroupAddress(this.settings.ga_dim, value * 255, 'DPT5')
        .catch(knxerror => {
          this.log(knxerror);
          throw new Error(this.homey.__('errors.dim_failed'));
        });
    }
    return null;
  }

}

module.exports = KNXDimmer;
