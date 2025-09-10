'use strict';

const KNXGenericSensor = require('../../lib/GenericKNXSensor');
const DatapointTypeParser = require('../../lib/DatapointTypeParser');

class KNXRoomControllerDevice extends KNXGenericSensor {

  async onInit() {
    await super.onInit();
    
    // Register listeners for button capabilities
    this.registerCapabilityListener('onoff.button1', this.onCapabilityButton1.bind(this));
    this.registerCapabilityListener('onoff.button2', this.onCapabilityButton2.bind(this));
    
    this.log('KNX Room Controller device has been initialized');
  }

  // Override sensor logic to handle multiple sensors
  onKNXEvent(groupaddress, data) {
    const settings = this.getSettings();
    this.log('🔥 KNX Event received:', { groupaddress, data });

    // Handle Button 1 events
    if (groupaddress === settings.ga_button1_feedback || 
        (groupaddress === settings.ga_button1_switch && !settings.ga_button1_feedback)) {
      this.log('🔘 Processing Button 1 event');
      const value = DatapointTypeParser.bitFormat(data);
      this.setCapabilityValue('onoff.button1', value).catch(this.error);
      this.log(`✅ Button 1 updated: ${value}`);
      return;
    }

    // Handle Button 2 events  
    if (groupaddress === settings.ga_button2_feedback || 
        (groupaddress === settings.ga_button2_switch && !settings.ga_button2_feedback)) {
      this.log('🔘 Processing Button 2 event');
      const value = DatapointTypeParser.bitFormat(data);
      this.setCapabilityValue('onoff.button2', value).catch(this.error);
      this.log(`✅ Button 2 updated: ${value}`);
      return;
    }

    // Handle Temperature events
    if (groupaddress === settings.ga_temperature) {
      this.log('🌡️ Processing Temperature event');
      const value = DatapointTypeParser.dpt9(data);
      this.setCapabilityValue('measure_temperature', value).catch(this.error);
      this.log(`✅ Temperature updated: ${value}°C`);
      
      // Trigger flow cards
      this.homey.flow.getDeviceTriggerCard('temperature_changed')
        .trigger(this, { temperature: value })
        .catch((err) => this.error('Temperature changed trigger error', err));
      return;
    }

    // Handle Humidity events
    if (groupaddress === settings.ga_humidity) {
      this.log('💧 Processing Humidity event');
      const value = DatapointTypeParser.dpt9(data);
      this.setCapabilityValue('measure_humidity', value).catch(this.error);
      this.log(`✅ Humidity updated: ${value}%`);
      
      // Trigger flow cards
      this.homey.flow.getDeviceTriggerCard('humidity_changed')
        .trigger(this, { humidity: value })
        .catch((err) => this.error('Humidity changed trigger error', err));
      return;
    }

    // Call parent for any other events
    super.onKNXEvent(groupaddress, data);
  }

  // Override to add all our subscriptions
  addKNXEventListeners(settings) {
    // Add button subscriptions
    if (settings.ga_button1_switch) {
      this.knxInterface.addKNXEventListener(settings.ga_button1_switch, this.KNXEventHandler);
      this.log('🔗 Subscribed to Button 1 switch');
    }
    if (settings.ga_button1_feedback) {
      this.knxInterface.addKNXEventListener(settings.ga_button1_feedback, this.KNXEventHandler);
      this.log('🔗 Subscribed to Button 1 feedback');
    }
    if (settings.ga_button2_switch) {
      this.knxInterface.addKNXEventListener(settings.ga_button2_switch, this.KNXEventHandler);
      this.log('🔗 Subscribed to Button 2 switch');
    }
    if (settings.ga_button2_feedback) {
      this.knxInterface.addKNXEventListener(settings.ga_button2_feedback, this.KNXEventHandler);
      this.log('🔗 Subscribed to Button 2 feedback');
    }
    
    // Add sensor subscriptions
    if (settings.ga_temperature) {
      this.knxInterface.addKNXEventListener(settings.ga_temperature, this.KNXEventHandler);
      this.log('🔗 Subscribed to Temperature');
    }
    if (settings.ga_humidity) {
      this.knxInterface.addKNXEventListener(settings.ga_humidity, this.KNXEventHandler);
      this.log('🔗 Subscribed to Humidity');
    }
  }

  // Override to remove all our subscriptions
  removeKNXEventListeners(settings) {
    if (settings.ga_button1_switch) {
      this.knxInterface.removeKNXEventListener(settings.ga_button1_switch, this.KNXEventHandler);
    }
    if (settings.ga_button1_feedback) {
      this.knxInterface.removeKNXEventListener(settings.ga_button1_feedback, this.KNXEventHandler);
    }
    if (settings.ga_button2_switch) {
      this.knxInterface.removeKNXEventListener(settings.ga_button2_switch, this.KNXEventHandler);
    }
    if (settings.ga_button2_feedback) {
      this.knxInterface.removeKNXEventListener(settings.ga_button2_feedback, this.KNXEventHandler);
    }
    if (settings.ga_temperature) {
      this.knxInterface.removeKNXEventListener(settings.ga_temperature, this.KNXEventHandler);
    }
    if (settings.ga_humidity) {
      this.knxInterface.removeKNXEventListener(settings.ga_humidity, this.KNXEventHandler);
    }
  }

  onKNXConnection(connectionStatus) {
    super.onKNXConnection(connectionStatus);

    if (connectionStatus === 'connected') {
      const settings = this.getSettings();
      
      // Read initial button values
      if (settings.ga_button1_feedback) {
        this.knxInterface.readKNXGroupAddress(settings.ga_button1_feedback).catch(this.error);
      } else if (settings.ga_button1_switch) {
        this.knxInterface.readKNXGroupAddress(settings.ga_button1_switch).catch(this.error);
      }

      if (settings.ga_button2_feedback) {
        this.knxInterface.readKNXGroupAddress(settings.ga_button2_feedback).catch(this.error);
      } else if (settings.ga_button2_switch) {
        this.knxInterface.readKNXGroupAddress(settings.ga_button2_switch).catch(this.error);
      }
      
      // Read initial sensor values
      if (settings.ga_temperature) {
        this.knxInterface.readKNXGroupAddress(settings.ga_temperature).catch(this.error);
      }
      if (settings.ga_humidity) {
        this.knxInterface.readKNXGroupAddress(settings.ga_humidity).catch(this.error);
      }
    }
  }

  async onCapabilityButton1(value) {
    try {
      const settings = this.getSettings();
      if (settings.ga_button1_switch) {
        await this.knxInterface.writeKNXGroupAddress(settings.ga_button1_switch, value ? 1 : 0);
        this.log(`Button 1 switched to: ${value}`);
      }
      return value;
    } catch (error) {
      this.error('Error switching button 1:', error);
      throw error;
    }
  }

  async onCapabilityButton2(value) {
    try {
      const settings = this.getSettings();
      if (settings.ga_button2_switch) {
        await this.knxInterface.writeKNXGroupAddress(settings.ga_button2_switch, value ? 1 : 0);
        this.log(`Button 2 switched to: ${value}`);
      }
      return value;
    } catch (error) {
      this.error('Error switching button 2:', error);
      throw error;
    }
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('Settings changed:', changedKeys);
    await super.onSettings({ oldSettings, newSettings, changedKeys });
  }

  async onDeleted() {
    this.log('KNX Room Controller device deleted');
    await super.onDeleted();
  }

}

module.exports = KNXRoomControllerDevice;