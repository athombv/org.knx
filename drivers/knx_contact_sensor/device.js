'use strict';

const KNXGenericDevice = require('../../lib/GenericKNXDevice');
const DatapointTypeParser = require('../../lib/DatapointTypeParser');

module.exports = class KNXContactSensor extends KNXGenericDevice {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    super.onInit();
  }

  onKNXEvent(groupaddress, data) {
    super.onKNXEvent(groupaddress, data);
    if (groupaddress === this.settings.ga_sensor) {
      this.setCapabilityValue('alarm_contact', DatapointTypeParser.bitFormat(data))
        .catch((knxerror) => {
          this.log('Set alarm_contact error', knxerror);
        });
    }
  }

  onKNXConnection(connectionStatus) {
    super.onKNXConnection(connectionStatus);

    if (connectionStatus === 'connected') {
      // Reading the groupaddress will trigger a event on the bus.
      // This will be catched by onKNXEvent, hence the return value is not used.
      if (this.settings.ga_sensor) {
        this.knxInterface.readKNXGroupAddress(this.settings.ga_sensor)
          .catch((knxerror) => {
            this.log(knxerror);
          });
      }
    }
  }

};
