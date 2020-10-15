'use strict';

const Homey = require('homey');

const ColorConverter = require('color-convert');

const KNXGenericDevice = require('../../lib/GenericKNXDevice');
const DatapointTypeParser = require('../../lib/DatapointTypeParser');

class KNXRGB extends KNXGenericDevice {

  onInit() {
    this._KNXToggleEventHandler = this.onKNXToggleEvent.bind(this);
    this._KNXRGBEventHandler = this.onKNXRGBEvent.bind(this);

    this._rgbTimeout = null;
    this._rgbTimeoutInterval = 500;

    super.onInit();

    this._onOffEventHandlerObject = { r: false, g: false, b: false };
    this._onOffEventHandlerObject.r = this.getCapabilityValue('onoff') || false;
    this._onOffEventHandlerObject.g = this.getCapabilityValue('onoff') || false;
    this._onOffEventHandlerObject.b = this.getCapabilityValue('onoff') || false;

    this._hsvEventHandlerObject = { h: 0, s: 0, v: 0 };
    this._hsvEventHandlerObject.h = this.getCapabilityValue('light_hue') || 0;
    this._hsvEventHandlerObject.s = this.getCapabilityValue('light_saturation') || 0;
    this._hsvEventHandlerObject.v = this.getCapabilityValue('dim') || 0;

    this.registerCapabilityListener('onoff', this.onCapabilityOnOff.bind(this));
    this.registerMultipleCapabilityListener(['dim', 'light_hue', 'light_saturation'], this.onCapabilityHSV.bind(this), 500);
  }

  // Override because of non-shared capabilities
  setKNXInterface(knxInterface) {
    this.knxInterface = knxInterface;

    // Add the handlers.
    this.knxInterface.onKNXConnectionListener(this.KNXConnectionHandler);

    // On/off event listeners
    this.knxInterface.addKNXEventListener(this.settings.ga_red_toggle_status,
      this._KNXToggleEventHandler);
    this.knxInterface.addKNXEventListener(this.settings.ga_green_toggle_status,
      this._KNXToggleEventHandler);
    this.knxInterface.addKNXEventListener(this.settings.ga_blue_toggle_status,
      this._KNXToggleEventHandler);

    // // RGB value event listeners
    this.knxInterface.addKNXEventListener(this.settings.ga_red_dim_status,
      this._KNXRGBEventHandler);
    this.knxInterface.addKNXEventListener(this.settings.ga_green_dim_status,
      this._KNXRGBEventHandler);
    this.knxInterface.addKNXEventListener(this.settings.ga_blue_dim_status,
      this._KNXRGBEventHandler);

    this.log('Using interface:', this.knxInterface.name, this.knxInterface.getConnectedIPAddress());
    this.setSettings({
      ipAddress: this.knxInterface.getConnectedIPAddress(),
    });

    // Connect the interface. This is safe, because the object is already created and thus verified.
    this.knxInterface._connectKNX();

    // Make the device available since we have a KNX interface
    this.setAvailable();
  }

  /**
   * On init of of the device, request the status from the KNX network
   *
   * @param connectionStatus
   */
  onKNXConnection(connectionStatus) {
    super.onKNXConnection(connectionStatus);

    if (connectionStatus === 'connected') {
      // Reading the group address will trigger a event on the bus.

      // This will be catched by onKNXToggleEvent, hence the return value is not used.
      this.readSettingAddress(['ga_red_toggle_status', 'ga_green_toggle_status', 'ga_blue_toggle_status'])
        .catch(readError => {
          this.log('onKNXConnection error', readError);
        });
      // This will be catched by onKNXDimEvent, hence the return value is not used.
      this.readSettingAddress(['ga_red_dim_status', 'ga_green_dim_status', 'ga_blue_dim_status'])
        .catch(readError => {
          this.log('onKNXConnection error', readError);
        });
    }
  }

  /**
   * Toggle event handler
   *
   * @param groupAddress
   * @param data
   * @returns {Promise<void>}
   */
  async onKNXToggleEvent(groupAddress, data) {
    if (data) {
      const value = DatapointTypeParser.onoff(data);

      if (groupAddress === this.settings.ga_red_toggle_status) {
        this._onOffEventHandlerObject.r = value;
      }
      if (groupAddress === this.settings.ga_green_toggle_status) {
        this._onOffEventHandlerObject.g = value;
      }
      if (groupAddress === this.settings.ga_blue_toggle_status) {
        this._onOffEventHandlerObject.b = value;
      }
      this._setOnOffCapability();
    }
  }

  /**
   * Set the on off to false only if r, g and b are off, else it is on
   *
   * @private
   */
  _setOnOffCapability() {
    if (this._onOffEventHandlerObject) {
      if (!this._onOffEventHandlerObject.r
        && !this._onOffEventHandlerObject.g
        && !this._onOffEventHandlerObject.b) {
        this.setCapabilityValue('onoff', false);
      }
      else {
        this.setCapabilityValue('onoff', true);
      }
    }
  }

  /**
   * Writes the state value to the KNX network
   *
   * @param value
   * @param opts
   * @returns {null|Promise<void[] | void>}
   */
  onCapabilityOnOff(value, opts) {
    const dim = value ? this.getCapabilityValue('dim') : 0;

    // We are not setting the rgb toggles here because else the color will always be set to full white
    this.onCapabilityHSV({ dim });

    return null;
  }

  /**
   * rgb event handler
   *
   * @param groupAddress
   * @param data
   */
  onKNXRGBEvent(groupAddress, data) {
    if (groupAddress === this.settings.ga_red_dim_status) {
      this._setColorOnHSV({ r: DatapointTypeParser.colorChannel(data) });
    }
    if (groupAddress === this.settings.ga_green_dim_status) {
      this._setColorOnHSV({ g: DatapointTypeParser.colorChannel(data) });
    }
    if (groupAddress === this.settings.ga_blue_dim_status) {
      this._setColorOnHSV({ b: DatapointTypeParser.colorChannel(data) });
    }

    if (this._rgbTimeout) {
      clearTimeout(this._rgbTimeout);
    }

    this._rgbTimeout = setTimeout(this._setHSVCapability.bind(this), this._rgbTimeoutInterval);
  }

  /**
   * triggered by the this._rgbTimeout to debounce the rgb values received from the KNX bus
   *
   * @private
   */
  _setHSVCapability() {
    if (this._hsvEventHandlerObject) {
      if (this._hsvEventHandlerObject.h !== 0) this.setCapabilityValue('light_hue', this._hsvEventHandlerObject.h);
      if (this._hsvEventHandlerObject.s !== 0) this.setCapabilityValue('light_saturation', this._hsvEventHandlerObject.s);
      if (this._hsvEventHandlerObject.v !== 0) this.setCapabilityValue('dim', this._hsvEventHandlerObject.v);
    }
  }

  /**
   * multiple capability listener for the set color
   *
   * @param values
   * @param opts
   * @returns {null|Promise<void>}
   */
  onCapabilityHSV(values, opts) {
    if (typeof (values['light_hue']) === 'undefined') {
      this._hsvEventHandlerObject.h = this.getCapabilityValue('light_hue') || 0;
    }
    else {
      this._hsvEventHandlerObject.h = values['light_hue'];
    }

    if (typeof (values['light_saturation']) === 'undefined') {
      this._hsvEventHandlerObject.s = this.getCapabilityValue('light_saturation') || 0;
    }
    else {
      this._hsvEventHandlerObject.s = values['light_saturation'];
    }

    if (typeof (values['dim']) === 'undefined') {
      this._hsvEventHandlerObject.v = this.getCapabilityValue('dim') || 0;
    }
    else {
      this._hsvEventHandlerObject.v = values['dim'];
    }

    const colors = this._hsvToRGB(this._hsvEventHandlerObject);

    // Set the internal rgb toggle state because else the onoff capability is not triggered correctly
    this._onOffEventHandlerObject.r = (colors.r !== 0);
    this._onOffEventHandlerObject.g = (colors.g !== 0);
    this._onOffEventHandlerObject.b = (colors.b !== 0);

    if (this.knxInterface) {
      const promiseQue = [];
      if (this.settings.ga_red_dim) {
        promiseQue.push(this.knxInterface.writeKNXGroupAddress(this.settings.ga_red_dim, (colors.r), 'DPT5'));
      }
      if (this.settings.ga_green_dim) {
        promiseQue.push(this.knxInterface.writeKNXGroupAddress(this.settings.ga_green_dim, (colors.g), 'DPT5'));
      }
      if (this.settings.ga_blue_dim) {
        promiseQue.push(this.knxInterface.writeKNXGroupAddress(this.settings.ga_blue_dim, (colors.b), 'DPT5'));
      }

      return Promise.all(promiseQue)
        .catch(knxerror => {
          this.log(knxerror);
          throw new Error(Homey.__('errors.switch_failed'));
        });
    }
    return null;
  }

  /**
   * Converts hsv to rgb object
   *
   * @param h
   * @param s
   * @param v
   * @returns {{r: *, b: *, g: *}}
   * @private
   */
  _hsvToRGB({ h, s, v }) {
    // convert hsv to rgb
    const conversion = ColorConverter.hsv.rgb(
      (h * 360),
      (s * 100),
      (v * 100),
    );

    const colors = {
      r: conversion[0],
      g: conversion[1],
      b: conversion[2],
    };

    return colors;
  }

  /**
   * Add a r g or b to the current hsv to the c
   *
   * @param r
   * @param g
   * @param b
   * @private
   */
  _setColorOnHSV({ r, g, b }) {
    // convert hsv to rgb
    const colors = this._hsvToRGB(this._hsvEventHandlerObject);

    // add the changed rgb color
    if (r) colors.r = r;
    if (g) colors.g = g;
    if (b) colors.b = b;

    // convert back to hsv
    const hsvValues = ColorConverter.rgb.hsv(
      colors.r,
      colors.g,
      colors.b,
    );

    this._hsvEventHandlerObject = {
      h: (hsvValues[0] / 360),
      s: (hsvValues[1] / 100),
      v: (hsvValues[2] / 100),
    };
  }

}

module.exports = KNXRGB;
