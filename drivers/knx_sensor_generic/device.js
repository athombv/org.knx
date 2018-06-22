'use strict';

const KNXGeneric = require('./../../lib/generic_knx_device.js');
const DatapointTypeParser = require('./../../lib/DatapointTypeParser.js');

class KNXSensorGeneric extends KNXGeneric {
    onInit() {
        super.onInit();
        this.log('KNX sensor init');
        this.KNXSensorHandler = this.onKNXSensorEvent.bind(this);
    }

    // Override because of non-shared capabilities
    setKNXInterface(knxInterface) {
        this.knxInterface = knxInterface;
        // Add the handlers.
        this.knxInterface.onKNXConnectionListener(this.KNXConnectionHandler);
        // On/off eventlisteners
        this.knxInterface.addKNXEventListener(this.settings.ga_sensor, this.KNXSensorHandler);

        //this.log(this.getName(), 'is using interface:', this.knxInterface.name);
        // Connect the interface. This is safe, because the object is already created and thus verified.
        this.knxInterface._connectKNX();
    }

    onKNXSensorEvent(groupaddress, data) {
        if (groupaddress === this.settings.ga_sensor) {
            this.log('sensor triggered', data);
            this.setCapabilityValue('onoff', DatapointTypeParser.onoff(data));
        }
    }

    // emtpy to just catch onoff and dim capabilites
    onKNXEvent(groupaddress, data) { }

    async onKNXConnection() {
        // check if there is a correct IP interface and a status address
        if (this.knxInterface && this.settings.ga_sensor) {
            const sensorValue = await this.knxInterface.readKNXGroupAddress(this.settings.ga_sensor)
            .catch((knxerror) => {
                this.log(knxerror);
            });
            this.log(sensorValue);
            this.setCapabilityValue('onoff', DatapointTypeParser.onoff(sensorValue));
        }
    }
}

module.exports = KNXSensorGeneric;