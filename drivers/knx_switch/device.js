'use strict';

const Homey = require('homey');

const KNXGenericDevice = require('../../lib/GenericKNXDevice');
const DatapointTypeParser = require('../../lib/DatapointTypeParser');

class KNXSwitch extends KNXGenericDevice {

  onInit() {
    super.onInit();
    this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
  }

  onKNXEvent(groupaddress, data) {
    super.onKNXEvent(groupaddress, data);
    if (groupaddress === this.settings.ga_switch) {
      this.setCapabilityValue('onoff', DatapointTypeParser.onoff(data));
    }
  }

  onKNXConnection(connectionStatus) {
    super.onKNXConnection(connectionStatus);

    if (connectionStatus === 'connected') {
      // Reading the groupaddress will trigger a event on the bus.
      // This will be catched by onKNXEvent, hence the return value is not used.
      if (this.settings.ga_switch) {
        // switches don't have a seperate status address
        this.knxInterface.readKNXGroupAddress(this.settings.ga_switch)
          .catch(knxerror => {
            this.log(knxerror);
          });
      }
    }
  }

  onCapabilityOnoff(value, opts) {
    this.log('switching device', value);
    if (this.knxInterface && this.settings.ga_switch) {
      if (this.settings.inverted === true) {
        return this.knxInterface.writeKNXGroupAddress(this.settings.ga_switch, !value, 'DPT1')
          .catch(knxerror => {
            this.log(knxerror);
            throw new Error(Homey.__('errors.switch_failed'));
          });
      }
      return this.knxInterface.writeKNXGroupAddress(this.settings.ga_switch, value, 'DPT1')
        .catch(knxerror => {
          this.log(knxerror);
          throw new Error(Homey.__('errors.switch_failed'));
        });
    }
    return null;
  }

}

module.exports = KNXSwitch;
