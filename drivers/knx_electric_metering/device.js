'use strict';

const KNXGenericDevice = require('../../lib/GenericKNXDevice');
const DatapointTypeParser = require('../../lib/DatapointTypeParser');

class KNXElectricMeteringSensor extends KNXGenericDevice {

  onKNXEvent(groupaddress, data) {
    super.onKNXEvent(groupaddress, data);
    if (groupaddress === this.settings.ga_sensor) {
      const dpt14 = DatapointTypeParser.dpt14(data);
      if (dpt14 === false) {
        // Invalid DPT14, log error
        this.error('Invalid DPT14 received');
        return;
      }
      this.setCapabilityValue('meter_power', dpt14)
        .catch((knxerror) => {
          this.error('Set meter_power error', knxerror);
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
        .catch(this.error);
    }
  }

}

module.exports = KNXElectricMeteringSensor;
