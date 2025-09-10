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

      this._triggerFlowCards(capability, value);
    }
  }

  _triggerFlowCards(capability, value) {
    switch (capability) {
      case 'alarm_motion':
        if (value) {
          this.homey.flow.getDeviceTriggerCard('motion_detected')
            .trigger(this, { motion: value })
            .catch((err) => this.error('Motion detected trigger error', err));
        } else {
          this.homey.flow.getDeviceTriggerCard('motion_stopped')
            .trigger(this, { motion: value })
            .catch((err) => this.error('Motion stopped trigger error', err));
        }
        this.homey.flow.getDeviceTriggerCard('motion_changed')
          .trigger(this, { motion: value })
          .catch((err) => this.error('Motion changed trigger error', err));
        break;
      case 'alarm_contact':
        if (value) {
          this.homey.flow.getDeviceTriggerCard('contact_opened')
            .trigger(this, { contact: value })
            .catch((err) => this.error('Contact opened trigger error', err));
        } else {
          this.homey.flow.getDeviceTriggerCard('contact_closed')
            .trigger(this, { contact: value })
            .catch((err) => this.error('Contact closed trigger error', err));
        }
        this.homey.flow.getDeviceTriggerCard('contact_changed')
          .trigger(this, { contact: value })
          .catch((err) => this.error('Contact changed trigger error', err));
        break;
      case 'alarm_smoke':
        if (value) {
          this.homey.flow.getDeviceTriggerCard('smoke_detected')
            .trigger(this, { smoke: value })
            .catch((err) => this.error('Smoke detected trigger error', err));
        } else {
          this.homey.flow.getDeviceTriggerCard('smoke_cleared')
            .trigger(this, { smoke: value })
            .catch((err) => this.error('Smoke cleared trigger error', err));
        }
        this.homey.flow.getDeviceTriggerCard('smoke_changed')
          .trigger(this, { smoke: value })
          .catch((err) => this.error('Smoke changed trigger error', err));
        break;
      case 'alarm_tamper':
        if (value) {
          this.homey.flow.getDeviceTriggerCard('tamper_detected')
            .trigger(this, { tamper: value })
            .catch((err) => this.error('Tamper detected trigger error', err));
        } else {
          this.homey.flow.getDeviceTriggerCard('tamper_cleared')
            .trigger(this, { tamper: value })
            .catch((err) => this.error('Tamper cleared trigger error', err));
        }
        this.homey.flow.getDeviceTriggerCard('tamper_changed')
          .trigger(this, { tamper: value })
          .catch((err) => this.error('Tamper changed trigger error', err));
        break;
      case 'measure_humidity':
        this.homey.flow.getDeviceTriggerCard('humidity_changed')
          .trigger(this, { humidity: value })
          .catch((err) => this.error('Humidity changed trigger error', err));
        break;
      case 'measure_temperature':
        this.homey.flow.getDeviceTriggerCard('temperature_changed')
          .trigger(this, { temperature: value })
          .catch((err) => this.error('Temperature changed trigger error', err));
        break;
      case 'measure_luminance':
        this.homey.flow.getDeviceTriggerCard('luminance_changed')
          .trigger(this, { luminance: value })
          .catch((err) => this.error('Luminance changed trigger error', err));
        break;
      case 'homealarm_state':
        this.homey.flow.getDeviceTriggerCard('alarm_state_changed')
          .trigger(this, { alarm_state: value })
          .catch((err) => this.error('Alarm state changed trigger error', err));
        break;
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
