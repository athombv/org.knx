'use strict';

const KNXGenericDevice = require('./GenericKNXDevice');
const DatapointTypeParser = require('./DatapointTypeParser');

module.exports = class GenericKNXSensor extends KNXGenericDevice {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    super.onInit();
  }

  onKNXEvent(groupaddress, data) {
    const capability = this.getCapabilities()[0];
    let value;
    super.onKNXEvent(groupaddress, data);

    if (groupaddress === this.settings.ga_sensor) {
      switch (capability) {
        case 'alarm_contact':
        case 'alarm_smoke':
        case 'alarm_tamper':
        case 'alarm_motion':
        case 'homealarm_state':
          value = DatapointTypeParser.bitFormat(data);
          break;
        case 'measure_luminance':
        case 'measure_temperature':
          value = DatapointTypeParser.dpt9(data);
          break;
        case 'measure_humidity':
          value = DatapointTypeParser.dpt9(data);
          break;
        default:
          value = 0;
      }
      this.setCapabilityValue(capability, value)
        .catch((knxerror) => {
          this.error(`Set ${capability} error`, knxerror);
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
            this.error(knxerror);
          });
      }
    }
  }

  getDeviceData() {
    if (this.settings.ga_sensor) {
      this.knxInterface.readKNXGroupAddress(this.settings.ga_sensor)
        .catch((knxerror) => {
          this.error(knxerror);
          throw new Error(knxerror);
        });
    }
  }

};
