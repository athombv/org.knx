'use strict';

const KNXGenericDevice = require('../../lib/GenericKNXDevice');
const DatapointTypeParser = require('../../lib/DatapointTypeParser');

class KNXWindowCovering extends KNXGenericDevice {

  async onInit() {
    this.registerCapabilityListener('windowcoverings_state', this.onCapabilityWindowCovering.bind(this));
    if (this.settings.ga_height) {
      await this.addCapabilityIfNotExists('windowcoverings_set');
      this.registerCapabilityListener('windowcoverings_set', this.onCapabilityWindowCoveringSet.bind(this));
    } else {
      await this.removeCapabilityIfExists('windowcoverings_set');
    }
    super.onInit();
  }

  async onKNXEvent(groupaddress, data) {
    super.onKNXEvent(groupaddress, data);
    if (groupaddress === this.settings.ga_status) {
      const state = DatapointTypeParser.bitFormat(data);
      if (state) {
        if (this.settings.invert_updown === true) {
          await this.setCapabilityValue('windowcoverings_state', 'up')
            .catch((knxerror) => {
              this.error('Set windowcoverings_state error', knxerror);
            });
        } else {
          await this.setCapabilityValue('windowcoverings_state', 'down')
            .catch((knxerror) => {
              this.error('Set windowcoverings_state error', knxerror);
            });
        }
      } else if (this.settings.invert_updown === true) {
        await this.setCapabilityValue('windowcoverings_state', 'down')
          .catch((knxerror) => {
            this.error('Set windowcoverings_state error', knxerror);
          });
      } else {
        await this.setCapabilityValue('windowcoverings_state', 'up')
          .catch((knxerror) => {
            this.error('Set windowcoverings_state error', knxerror);
          });
      }
      this.log(state);
    }

    if (groupaddress === this.getStatusAddress('ga_height')) {
      await this.setCapabilityValue('windowcoverings_set', DatapointTypeParser.dim(data))
        .catch((knxerror) => {
          this.error('Set windowcoverings_set error', knxerror);
        });
    }
  }

  onKNXConnection(connectionStatus) {
    super.onKNXConnection(connectionStatus);

    if (connectionStatus !== 'connected') {
      return;
    }
    // Reading the groupaddress will trigger an event on the bus.
    // This will be catched by onKNXEvent, hence the return value is not used.
    this.getWindowCoveringHeight();
  }

  onCapabilityWindowCovering(value) {
    this.log(value);
    if (this.knxInterface) {
      switch (value) {
        case 'up':
          if (this.settings.invert_updown === true) {
            return this.knxInterface.writeKNXGroupAddress(this.settings.ga_up_down, 1, 'DPT1')
              .catch((knxerror) => {
                throw new Error(this.homey.__('errors.windowcovering_failed'), knxerror);
              });
          }
          return this.knxInterface.writeKNXGroupAddress(this.settings.ga_up_down, 0, 'DPT1')
            .catch((knxerror) => {
              throw new Error(this.homey.__('errors.windowcovering_failed'), knxerror);
            });
        case 'down':
          if (this.settings.invert_updown === true) {
            return this.knxInterface.writeKNXGroupAddress(this.settings.ga_up_down, 0, 'DPT1')
              .catch((knxerror) => {
                throw new Error(this.homey.__('errors.windowcovering_failed'), knxerror);
              });
          }
          return this.knxInterface.writeKNXGroupAddress(this.settings.ga_up_down, 1, 'DPT1')
            .catch((knxerror) => {
              throw new Error(this.homey.__('errors.windowcovering_failed'), knxerror);
            });
        case 'idle':
          this.log('stop selected, stop address', this.settings.ga_stop);
          if (this.settings.ga_stop) {
            return this.knxInterface.writeKNXGroupAddress(this.settings.ga_stop, 1, 'DPT1')
              .catch((knxerror) => {
                throw new Error(this.homey.__('errors.windowcovering_failed'), knxerror);
              });
          }
          break;
        default:
          throw new Error(this.homey.__('errors.windowcovering_failed'));
      }
    }
    return null;
  }

  getWindowCoveringHeight() {
    if (!this.knxInterface) {
      return;
    }
    const statusAddress = this.getStatusAddress('ga_height');
    if (!statusAddress) {
      return;
    }
    this.knxInterface.readKNXGroupAddress(statusAddress)
      .catch(this.error);
  }

  onCapabilityWindowCoveringSet(value) {
    if (!this.knxInterface || !this.settings.ga_height) {
      return null;
    }

    return this.knxInterface.writeKNXGroupAddress(this.settings.ga_height, value * 255, 'DPT5')
      .catch((knxerror) => {
        throw new Error(this.homey.__('errors.windowcovering_failed'), knxerror);
      });
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    if (changedKeys.includes('ga_height')) {
      if (typeof newSettings.ga_height === 'string' && newSettings.ga_height !== '') {
        await this.addCapabilityIfNotExists('windowcoverings_set');
        this.registerCapabilityListener('windowcoverings_set', this.onCapabilityWindowCoveringSet.bind(this));
      } else {
        await this.removeCapabilityIfExists('windowcoverings_set');
      }
    }
    await super.onSettings({ oldSettings, newSettings, changedKeys });
  }

}

module.exports = KNXWindowCovering;
