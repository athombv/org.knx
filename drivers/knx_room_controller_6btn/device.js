'use strict';

const KNXGenericSensor = require('../../lib/GenericKNXSensor');
const DatapointTypeParser = require('../../lib/DatapointTypeParser');

class KNXRoomController6BtnDevice extends KNXGenericSensor {

  async onInit() {
    await super.onInit();
    
    // Register listeners for all 6 button capabilities
    this.registerCapabilityListener('onoff.button1', this.onCapabilityButton1.bind(this));
    this.registerCapabilityListener('onoff.button2', this.onCapabilityButton2.bind(this));
    this.registerCapabilityListener('onoff.button3', this.onCapabilityButton3.bind(this));
    this.registerCapabilityListener('onoff.button4', this.onCapabilityButton4.bind(this));
    this.registerCapabilityListener('onoff.button5', this.onCapabilityButton5.bind(this));
    this.registerCapabilityListener('onoff.button6', this.onCapabilityButton6.bind(this));
    
    this.log('KNX Room Controller 6-Button device has been initialized');
  }

  // Override sensor logic to handle multiple sensors and 6 buttons
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

    // Handle Button 3 events  
    if (groupaddress === settings.ga_button3_feedback || 
        (groupaddress === settings.ga_button3_switch && !settings.ga_button3_feedback)) {
      this.log('🔘 Processing Button 3 event');
      const value = DatapointTypeParser.bitFormat(data);
      this.setCapabilityValue('onoff.button3', value).catch(this.error);
      this.log(`✅ Button 3 updated: ${value}`);
      return;
    }

    // Handle Button 4 events  
    if (groupaddress === settings.ga_button4_feedback || 
        (groupaddress === settings.ga_button4_switch && !settings.ga_button4_feedback)) {
      this.log('🔘 Processing Button 4 event');
      const value = DatapointTypeParser.bitFormat(data);
      this.setCapabilityValue('onoff.button4', value).catch(this.error);
      this.log(`✅ Button 4 updated: ${value}`);
      return;
    }

    // Handle Button 5 events  
    if (groupaddress === settings.ga_button5_feedback || 
        (groupaddress === settings.ga_button5_switch && !settings.ga_button5_feedback)) {
      this.log('🔘 Processing Button 5 event');
      const value = DatapointTypeParser.bitFormat(data);
      this.setCapabilityValue('onoff.button5', value).catch(this.error);
      this.log(`✅ Button 5 updated: ${value}`);
      return;
    }

    // Handle Button 6 events  
    if (groupaddress === settings.ga_button6_feedback || 
        (groupaddress === settings.ga_button6_switch && !settings.ga_button6_feedback)) {
      this.log('🔘 Processing Button 6 event');
      const value = DatapointTypeParser.bitFormat(data);
      this.setCapabilityValue('onoff.button6', value).catch(this.error);
      this.log(`✅ Button 6 updated: ${value}`);
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


    // Only call parent for logging, but don't let it process our sensor events
    this.log('received', groupaddress, data);
  }

  // Override to add all our subscriptions
  addKNXEventListeners(settings) {
    // Add all 6 button subscriptions
    for (let i = 1; i <= 6; i++) {
      if (settings[`ga_button${i}_switch`]) {
        this.knxInterface.addKNXEventListener(settings[`ga_button${i}_switch`], this.KNXEventHandler);
        this.log(`🔗 Subscribed to Button ${i} switch`);
      }
      if (settings[`ga_button${i}_feedback`]) {
        this.knxInterface.addKNXEventListener(settings[`ga_button${i}_feedback`], this.KNXEventHandler);
        this.log(`🔗 Subscribed to Button ${i} feedback`);
      }
    }
    
    // Add sensor subscriptions
    if (settings.ga_temperature) {
      this.knxInterface.addKNXEventListener(settings.ga_temperature, this.KNXEventHandler);
      this.log('🔗 Subscribed to Temperature');
    }
  }

  // Override to remove all our subscriptions
  removeKNXEventListeners(settings) {
    // Remove all 6 button subscriptions
    for (let i = 1; i <= 6; i++) {
      if (settings[`ga_button${i}_switch`]) {
        this.knxInterface.removeKNXEventListener(settings[`ga_button${i}_switch`], this.KNXEventHandler);
      }
      if (settings[`ga_button${i}_feedback`]) {
        this.knxInterface.removeKNXEventListener(settings[`ga_button${i}_feedback`], this.KNXEventHandler);
      }
    }
    
    // Remove sensor subscriptions
    if (settings.ga_temperature) {
      this.knxInterface.removeKNXEventListener(settings.ga_temperature, this.KNXEventHandler);
    }
  }

  onKNXConnection(connectionStatus) {
    // Don't call parent's onKNXConnection - handle everything ourselves
    if (connectionStatus === 'connected') {
      this.setAvailable();
    } else if (connectionStatus === 'disconnected') {
      this.setUnavailable(this.homey.__('errors.ip.interface_not_available'));
    }

    if (connectionStatus === 'connected') {
      const settings = this.getSettings();
      this.log('🔗 Room Controller 6-Button connected to KNX');
      
      // Read initial values for all 6 buttons
      for (let i = 1; i <= 6; i++) {
        if (settings[`ga_button${i}_feedback`]) {
          this.knxInterface.readKNXGroupAddress(settings[`ga_button${i}_feedback`]).catch(this.error);
        } else if (settings[`ga_button${i}_switch`]) {
          this.knxInterface.readKNXGroupAddress(settings[`ga_button${i}_switch`]).catch(this.error);
        }
      }
      
      // Read initial sensor values
      if (settings.ga_temperature) {
        this.knxInterface.readKNXGroupAddress(settings.ga_temperature).catch(this.error);
        this.log('🌡️ Reading initial temperature');
      }
    }
  }

  // Button capability handlers
  async onCapabilityButton1(value) {
    return this.handleButtonCapability(1, value);
  }

  async onCapabilityButton2(value) {
    return this.handleButtonCapability(2, value);
  }

  async onCapabilityButton3(value) {
    return this.handleButtonCapability(3, value);
  }

  async onCapabilityButton4(value) {
    return this.handleButtonCapability(4, value);
  }

  async onCapabilityButton5(value) {
    return this.handleButtonCapability(5, value);
  }

  async onCapabilityButton6(value) {
    return this.handleButtonCapability(6, value);
  }

  // Generic button handler to avoid code duplication
  async handleButtonCapability(buttonNumber, value) {
    try {
      const settings = this.getSettings();
      const switchAddress = settings[`ga_button${buttonNumber}_switch`];
      
      if (switchAddress) {
        await this.knxInterface.writeKNXGroupAddress(switchAddress, value ? 1 : 0);
        this.log(`Button ${buttonNumber} switched to: ${value}`);
      }
      return value;
    } catch (error) {
      this.error(`Error switching button ${buttonNumber}:`, error);
      throw error;
    }
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('Settings changed:', changedKeys);
    await super.onSettings({ oldSettings, newSettings, changedKeys });
  }

  async onDeleted() {
    this.log('KNX Room Controller 6-Button device deleted');
    await super.onDeleted();
  }

}

module.exports = KNXRoomController6BtnDevice;