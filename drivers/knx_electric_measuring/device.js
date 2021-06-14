'use strict';

const KNXGenericDevice = require('../../lib/GenericKNXDevice');
const DatapointTypeParser = require('../../lib/DatapointTypeParser');

class KNXElectricSensor extends KNXGenericDevice {

  onInit() {
    super.onInit();
  }

  onKNXEvent(groupaddress, data) {
    super.onKNXEvent(groupaddress, data);
    if (groupaddress === this.settings.ga_sensor) {
      this.setCapabilityValue('measure_power', DatapointTypeParser.dpt14(data))
        .catch(knxerror => {
          this.log('Set measure_power error', knxerror);
        });
    }
  }

  onKNXConnection(connectionStatus) {
    // super.onKNXConnection(connectionStatus);

    if (connectionStatus === 'connected') {
      // Reading the groupaddress will trigger a event on the bus.
      // This will be catched by onKNXEvent, hence the return value is not used.
      if (this.settings.ga_sensor) {
        this.knxInterface.readKNXGroupAddress(this.settings.ga_sensor)
          .catch(knxerror => {
            this.log(knxerror);
          });
      }
    }
  }

  getMeasuredTemperature() {
    if (this.settings.ga_sensor) {
      this.knxInterface.readKNXGroupAddress(this.settings.ga_sensor)
        .catch(knxerror => {
          this.log(knxerror);
          throw new Error(this.homey.__('errors.temperature_get_failed'));
        });
    }
  }

}

module.exports = KNXElectricSensor;
