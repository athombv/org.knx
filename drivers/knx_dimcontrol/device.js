'use strict';

const KNXGenericDevice = require('../../lib/GenericKNXDevice');
const DatapointTypeParser = require('../../lib/DatapointTypeParser');

class KNXDimControl extends KNXGenericDevice {

  onInit() {
    super.onInit();
    this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
    this.registerCapabilityListener('dimcontrol_up', this.onCapabilityDimControlUp.bind(this));
    this.registerCapabilityListener('dimcontrol_down', this.onCapabilityDimControlDown.bind(this));
  }

  onKNXEvent(groupaddress, data) {
    super.onKNXEvent(groupaddress, data);
    if (groupaddress === this.settings.ga_status) {
      this.setCapabilityValue('onoff', DatapointTypeParser.onoff(data));
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
    }
  }

  onCapabilityOnoff(value, opts) {
    this.log('onoff');
    if (this.knxInterface && this.settings.ga_switch) {
      return this.knxInterface.writeKNXGroupAddress(this.settings.ga_switch, value, 'DPT1')
        .catch(knxerror => {
          this.log(knxerror);
          throw new Error(this.homey.__('errors.switch_failed'));
        });
    }
    return null;
  }

  onCapabilityDimControlUp(value, opts) {
    if (this.knxInterface && this.settings.ga_dim && value === true) {
      const dpt3Data = {
        decr_incr: 1, // fixed because it's the Up capability
        data: parseInt(this.settings.dim_step, 10),
      };

      return this.knxInterface.writeKNXGroupAddress(this.settings.ga_dim, dpt3Data, 'DPT3')
        .catch(knxerror => {
          this.log(knxerror);
          throw new Error(this.homey.__('errors.dim_failed'));
        });
    }
    return null;
  }

  onCapabilityDimControlDown(value, opts) {
    if (this.knxInterface && this.settings.ga_dim && value === true) {
      const dpt3Data = {
        decr_incr: 0, // fixed because it's the down capability
        data: parseInt(this.settings.dim_step, 10),
      };

      return this.knxInterface.writeKNXGroupAddress(this.settings.ga_dim, dpt3Data, 'DPT3')
        .catch(knxerror => {
          this.log(knxerror);
          throw new Error(this.homey.__('errors.dim_failed'));
        });
    }
    return null;
  }

}

module.exports = KNXDimControl;
