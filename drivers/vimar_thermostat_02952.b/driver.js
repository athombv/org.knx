'use strict';

const KNXGenericDriver = require('../../lib/GenericKNXDriver');

class VimarThermostat02952BDriver extends KNXGenericDriver {

  onInit() {
    super.onInit();

    this.homey.flow.getActionCard('set-window-switch').registerRunListener(async (args, state) => {
      return args.device.knxInterface.writeKNXGroupAddress(args.device.settings.ga_window_switch, args.open, 'DPT1')
        .catch((knxerror) => {
          this.log(knxerror);
          throw new Error(this.homey.__('errors.window_switch_failed'));
        });
    });

    this.homey.flow.getActionCard('reset_to_basesetpoint').registerRunListener(async (args, state) => {
      return args.device.knxInterface.writeKNXGroupAddress(args.device.settings.ga_temperature_target, 0, 'DPT9.1')
        .catch((knxerror) => {
          this.log(knxerror);
          throw new Error(this.homey.__('errors.reset_to_basesetpoint_failed'));
        });
    });
  }

}

module.exports = VimarThermostat02952BDriver;
