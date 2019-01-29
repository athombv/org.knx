'use strict';

const Homey = require('homey');

const KNXGeneric = require('./../../lib/generic_knx_device.js');
const ColorConverter = require('color-convert');
const DatapointTypeParser = require('./../../lib/DatapointTypeParser.js');

class KNXRGB extends KNXGeneric {
    onInit() {
        super.onInit();
        this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
        this.registerMultipleCapabilityListener(['dim', 'light_hue', 'light_saturation'], this.onCapabilityHSV.bind(this), 500);

        this.KNXToggleEventHandler = this.onKNXToggleEvent.bind(this);
        this.KNXRGBEventHandler = this.onKNXRGBEvent.bind(this);

        this.ignoreEvent = false;
        this.ignoreEventTimeOut = 3000;
        this.ignoreTimeOut;
    }

    // Override because of non-shared capabilities
    setKNXInterface(knxInterface) {
        this.knxInterface = knxInterface;
        // Add the handlers.
        this.knxInterface.onKNXConnectionListener(this.KNXConnectionHandler);
        // On/off eventlisteners
        this.knxInterface.addKNXEventListener(this.settings.ga_red_toggle_status, this.KNXToggleEventHandler);
        this.knxInterface.addKNXEventListener(this.settings.ga_green_toggle_status, this.KNXToggleEventHandler);
        this.knxInterface.addKNXEventListener(this.settings.ga_blue_toggle_status, this.KNXToggleEventHandler);

        // RGB value evenlisteners
        this.knxInterface.addKNXEventListener(this.settings.ga_red_dim_status, this.KNXRGBEventHandler);
        this.knxInterface.addKNXEventListener(this.settings.ga_green_dim_status, this.KNXRGBEventHandler);
        this.knxInterface.addKNXEventListener(this.settings.ga_blue_dim_status, this.KNXRGBEventHandler);

        //this.log(this.getName(), 'is using interface:', this.knxInterface.name);
        // Connect the interface. This is safe, because the object is already created and thus verified.
        this.knxInterface._connectKNX();
    }

    async onKNXToggleEvent(groupaddress, data) {
        if (data && !this.ignoreEvent) {
            const onoffvalues = await this.readSettingAddress(['ga_red_toggle_status', 'ga_green_toggle_status', 'ga_blue_toggle_status'])
                .catch((error) => {
                    this.log('Error while reading RGB switch values', error);
                });
            if (onoffvalues) {
                if (onoffvalues.map(buffer => buffer.readInt8()).includes(1)) {
                    this.setCapabilityValue('onoff', true);
                } else {
                    this.setCapabilityValue('onoff', false);
                }
            }
        }
    }

    async onKNXRGBEvent(groupaddress, data) {
        this.log('received rgb event');
        const curValues = await this.getCurrentHSVColor();
        if (curValues && !this.ignoreEvent) {
            if(curValues.h !== 0) this.setCapabilityValue('light_hue', curValues.h);
            if(curValues.s !== 0) this.setCapabilityValue('light_saturation', curValues.s);
            if(curValues.v !== 0) this.setCapabilityValue('dim', curValues.v);
        }
    }

    async onKNXConnection(connectionStatus) {
        super.onKNXConnection(connectionStatus);

        if (connectionStatus === 'connected') {
            // Reading the groupaddress will trigger a event on the bus.
            // This will be catched by onKNXEvent, hence the return value is not used.
            const onoffvalues = await this.readSettingAddress(['ga_red_toggle_status', 'ga_green_toggle_status', 'ga_blue_toggle_status'])
            .catch((readError) => {
                this.log(readError);
            });
            if (onoffvalues) {
                if (onoffvalues.map(buf => buf.readInt8()).includes(1)) {
                    this.setCapabilityValue('onoff', true);
                } else {
                    this.setCapabilityValue('onoff', false);
                }
                const curValues = await this.getCurrentHSVColor();
                if (curValues) {
                    this.setCapabilityValue('light_hue', curValues.h);
                    this.setCapabilityValue('light_saturation', curValues.s);
                    this.setCapabilityValue('dim', curValues.v);
                }
            }
        }
    }

    // this method is called when the Device has requested a state change (turned on or off)
    onCapabilityOnoff(value, opts) {
        if(this.knxInterface) {
            if (value === true) {
                if (this.settings.ga_red_toggle && this.settings.ga_green_toggle && this.settings.ga_blue_toggle) {
                    return Promise.all([
                        this.knxInterface.writeKNXGroupAddress(this.settings.ga_red_toggle, 1, 'DPT1'),
                        this.knxInterface.writeKNXGroupAddress(this.settings.ga_green_toggle, 1, 'DPT1'),
                        this.knxInterface.writeKNXGroupAddress(this.settings.ga_blue_toggle, 1, 'DPT1')
                    ])
                    .catch((knxerror) => {
                        this.log(knxerror);
                        throw new Error(Homey.__("errors.switch_failed"));
                    });
                }
            } else {
                if (this.settings.ga_red_toggle && this.settings.ga_green_toggle && this.settings.ga_blue_toggle) {
                    return Promise.all([
                        this.knxInterface.writeKNXGroupAddress(this.settings.ga_red_toggle, 0, 'DPT1'),
                        this.knxInterface.writeKNXGroupAddress(this.settings.ga_green_toggle, 0, 'DPT1'),
                        this.knxInterface.writeKNXGroupAddress(this.settings.ga_blue_toggle, 0, 'DPT1')
                    ])
                    .catch((knxerror) => {
                        this.log(knxerror);
                        throw new Error(Homey.__("errors.switch_failed"));
                    });
                }
            }
        }
    }

    onCapabilityHSV(values, opts) {
        if (!values.hasOwnProperty('dim')) {
            values.dim = this.getCapabilityValue('dim');
            if (!values.dim) {values.dim = 0;}
        }
        if (!values.hasOwnProperty('light_hue')) {
            values.light_hue = this.getCapabilityValue('light_hue');
            if (!values.light_hue) {values.light_hue = 0;}
        }
        if (!values.hasOwnProperty('light_saturation')) {
            values.light_saturation = this.getCapabilityValue('light_saturation');
            if (!values.light_saturation) {values.light_saturation = 0;}
        }
        // convert hsv to rgb
        const conversion = ColorConverter.hsv.rgb((values.light_hue*360), (values.light_saturation*100), (values.dim*100));
        const colors = {
            r: conversion[0],
            g: conversion[1],
            b: conversion[2]
        }

        if (this.knxInterface && this.settings.ga_red_dim && this.settings.ga_green_dim && this.settings.ga_blue_dim) {
            // We can set the colors
            this.ignoreEvent = true;
            if (this.ignoreTimeOut) { clearTimeout(this.ignoreTimeOut); }

            this.ignoreTimeOut = setTimeout(() => {
                this.ignoreEvent = false;
            }, this.ignoreEventTimeOut);

            return Promise.all([
                this.knxInterface.writeKNXGroupAddress(this.settings.ga_red_dim, (colors.r), 'DPT5'),
                this.knxInterface.writeKNXGroupAddress(this.settings.ga_green_dim, (colors.g), 'DPT5'),
                this.knxInterface.writeKNXGroupAddress(this.settings.ga_blue_dim, (colors.b), 'DPT5')
            ])
            .then(() => {
                this.setCapabilityValue('onoff', true);
            })
            .catch((error) => {
                this.log(error);
                throw new Error(Homey.__("errors.rgb_failed"));
            });
        }
    }

    async getCurrentHSVColor() {
        const dimValues = await this.readSettingAddress(['ga_red_dim_status', 'ga_green_dim_status', 'ga_blue_dim_status']);
        if (dimValues) {
            const hsvValues = ColorConverter.rgb.hsv(DatapointTypeParser.colorChannel(dimValues[0]),
                        DatapointTypeParser.colorChannel(dimValues[1]), DatapointTypeParser.colorChannel(dimValues[2]));
            const hsvColor = {
                h: (hsvValues[0]/360),
                s: (hsvValues[1]/100),
                v: (hsvValues[2]/100)
            }
            return hsvColor;
        }
    }
}

module.exports = KNXRGB;