'use strict';

const KNXGenericDevice = require('../../lib/GenericKNXDevice');
const DatapointTypeParser = require('../../lib/DatapointTypeParser');

class KNXSwitch extends KNXGenericDevice {

  onInit() {
    super.onInit();
    this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
  }

  onKNXEvent(groupaddress, data) {
    super.onKNXEvent(groupaddress, data);

    // A switch can optionally have a different status address then the switch address
    let statusAddress = this.settings.ga_switch;
    if (typeof this.settings.ga_status === 'string' && this.settings.ga_status !== '') {
      statusAddress = this.settings.ga_status;
    }

    if (groupaddress === statusAddress) {
      const value = DatapointTypeParser.onoff(data);
      this.setCapabilityValue('onoff', value)
        .catch((knxerror) => {
          this.log('Set onoff error', knxerror);
        });
      this.homey.flow.getDeviceTriggerCard('changed')
        .trigger(this, { status: value })
        .catch((err) => this.log(err));
    }
  }

  onKNXConnection(connectionStatus) {
    super.onKNXConnection(connectionStatus);

    if (connectionStatus === 'connected') {
      // Reading the groupaddress will trigger a event on the bus.
      // This will be catched by onKNXEvent, hence the return value is not used.

      // A switch can optionally have a different status address then the switch address
      let statusAddress = this.settings.ga_switch;
      if (typeof this.settings.ga_status === 'string' && this.settings.ga_status !== '') {
        statusAddress = this.settings.ga_status;
      }

      if (statusAddress) {
        // switches don't have a seperate status address
        this.knxInterface.readKNXGroupAddress(statusAddress)
          .catch((knxerror) => {
            this.log(knxerror);
          });
      }
    }
  }

  onCapabilityOnoff(value, opts) {
    if (this.knxInterface && this.settings.ga_switch) {
      if (this.settings.inverted === true) {
        return this.knxInterface.writeKNXGroupAddress(this.settings.ga_switch, !value, 'DPT1')
          .catch((knxerror) => {
            this.log(knxerror);
            throw new Error(this.homey.__('errors.switch_failed'));
          });
      }
      return this.knxInterface.writeKNXGroupAddress(this.settings.ga_switch, value, 'DPT1')
        .catch((knxerror) => {
          this.log(knxerror);
          throw new Error(this.homey.__('errors.switch_failed'));
        });
    }
    return null;
  }

}

module.exports = KNXSwitch;
