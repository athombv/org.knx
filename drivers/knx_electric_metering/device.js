'use strict';

const KNXGenericDevice = require('../../lib/GenericKNXDevice');
const DatapointTypeParser = require('../../lib/DatapointTypeParser');

class KNXElectricMeteringSensor extends KNXGenericDevice {

  onKNXEvent(groupaddress, data) {
    super.onKNXEvent(groupaddress, data);
    if (groupaddress === this.settings.ga_sensor) {
      this.setCapabilityValue('meter_power', DatapointTypeParser.dpt14(data))
        .catch((knxerror) => {
          this.log('Set meter_power error', knxerror);
        });
    }
  }

  onKNXConnection(connectionStatus) {
    // super.onKNXConnection(connectionStatus);

    if (connectionStatus !== 'connected') {
      return;
    }
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

module.exports = KNXElectricMeteringSensor;
