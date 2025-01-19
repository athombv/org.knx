'use strict';

const KNXGenericDevice = require('./GenericKNXDevice');
const DatapointTypeParser = require('./DatapointTypeParser');

module.exports = class GenericKNXSensor extends KNXGenericDevice {

  capability;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    super.onInit();
    const deviceCapabilities = this.getCapabilities();

    if (deviceCapabilities.length > 1) {
      this.log('Too many capabilities on a sensor device ', this.getName())
    }
    capability = deviceCapabilities[0]

  }

  onKNXEvent(groupaddress, data) {
    super.onKNXEvent(groupaddress, data);


    if (groupaddress === this.settings.ga_sensor) {
      let value
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
        default:
        value = 99
      }
      this.setCapabilityValue(capability, value)
        .catch((knxerror) => {
          this.log(`Set ${capability} error`, knxerror);
        });
      this.flow.getDeviceTriggerCard('changed')
        .trigger(this, { status: value })
        .catch((err) => this.log(err));
    }
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

  getDeviceData() {
    if (this.settings.ga_sensor) {
      this.knxInterface.readKNXGroupAddress(this.settings.ga_sensor)
        .catch((knxerror) => {
          this.log(knxerror);
          throw new Error(this.homey.__(`errors.${capability}_get_failed`));
        });
    }
  }

};
