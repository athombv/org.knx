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
  }

}

module.exports = VimarThermostat02952BDriver;
