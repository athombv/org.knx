'use strict';

const KNXGenericSensor = require('../../lib/GenericKNXSensor');

module.exports = class KNXMotionSensor extends KNXGenericSensor {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    try {
      this.log(`[${this.getName()}] Initializing motion sensor...`);
      
      // Validate device settings before initialization
      this._validateSettings();
      
      // Call parent initialization
      await super.onInit();
      
      // Set up specific motion sensor initialization
      await this._initializeMotionSensor();
      
      this.log(`[${this.getName()}] Motion sensor initialized successfully`);
    } catch (error) {
      this.error(`[${this.getName()}] Failed to initialize motion sensor:`, error);
      this.setUnavailable(`Initialization failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate device settings
   * @private
   */
  _validateSettings() {
    const settings = this.getSettings();
    
    if (!settings) {
      throw new Error('Device settings are missing');
    }
    
    if (!settings.ga_sensor) {
      throw new Error('Motion sensor group address (ga_sensor) is not configured');
    }
    
    if (!settings.macAddress) {
      throw new Error('KNX interface MAC address is not configured');
    }
    
    // Validate group address format (basic validation)
    if (!this._isValidGroupAddress(settings.ga_sensor)) {
      throw new Error(`Invalid group address format: ${settings.ga_sensor}`);
    }
    
    this.log(`[${this.getName()}] Settings validation passed`);
  }

  /**
   * Validate KNX group address format
   * @param {string} address - The group address to validate
   * @returns {boolean} - Whether the address is valid
   * @private
   */
  _isValidGroupAddress(address) {
    if (!address || typeof address !== 'string') {
      return false;
    }
    
    // Basic format validation for KNX group addresses (e.g., "1/2/3" or "1.2.3")
    const knxPattern = /^(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{1,3})|(\d{1,5})$/;
    return knxPattern.test(address);
  }

  /**
   * Initialize motion sensor specific functionality
   * @private
   */
  async _initializeMotionSensor() {
    try {
      // Check if alarm_motion capability exists
      if (!this.hasCapability('alarm_motion')) {
        this.error(`[${this.getName()}] Missing alarm_motion capability`);
        throw new Error('Motion sensor capability not found');
      }
      
      // Initialize motion state tracking
      this._lastMotionState = null;
      this._lastMotionTime = null;
      this._motionEventCount = 0;
      
      // Set up capability listener with error handling
      this.registerCapabilityListener('alarm_motion', this._onMotionCapabilityChanged.bind(this));
      
      this.log(`[${this.getName()}] Motion sensor specific initialization completed`);
    } catch (error) {
      this.error(`[${this.getName()}] Motion sensor initialization failed:`, error);
      throw error;
    }
  }

  /**
   * Handle motion capability changes
   * @param {boolean} value - The new motion state
   * @private
   */
  async _onMotionCapabilityChanged(value) {
    try {
      this.log(`[${this.getName()}] Motion capability changed to: ${value}`);
      
      // Validate the value
      if (typeof value !== 'boolean') {
        throw new Error(`Invalid motion value type: ${typeof value}, expected boolean`);
      }
      
      // Update tracking
      this._lastMotionState = value;
      this._lastMotionTime = new Date();
      this._motionEventCount++;
      
      // Log motion statistics
      this.log(`[${this.getName()}] Motion event #${this._motionEventCount}: ${value ? 'DETECTED' : 'STOPPED'}`);
      
      return true;
    } catch (error) {
      this.error(`[${this.getName()}] Error handling motion capability change:`, error);
      throw error;
    }
  }

  /**
   * Enhanced KNX event handling with better error management
   */
  onKNXEvent(groupaddress, data) {
    try {
      this.log(`[${this.getName()}] KNX Event - Address: ${groupaddress}, Data: ${JSON.stringify(data)}`);
      
      // Validate inputs
      if (!groupaddress) {
        throw new Error('Group address is missing in KNX event');
      }
      
      if (data === undefined || data === null) {
        throw new Error('Data is missing in KNX event');
      }
      
      // Validate this is our sensor address
      if (groupaddress !== this.getSettings().ga_sensor) {
        this.log(`[${this.getName()}] Ignoring KNX event for different address: ${groupaddress}`);
        return;
      }
      
      // Call parent with enhanced error handling
      super.onKNXEvent(groupaddress, data);
      
      this.log(`[${this.getName()}] KNX event processed successfully`);
    } catch (error) {
      this.error(`[${this.getName()}] Error processing KNX event:`, error);
      this.error(`[${this.getName()}] Event details - Address: ${groupaddress}, Data:`, data);
      
      // Don't throw here to prevent breaking the KNX event loop
      // Instead, set device as temporarily unavailable
      this.setUnavailable(`KNX event processing error: ${error.message}`)
        .catch(err => this.error(`[${this.getName()}] Failed to set unavailable:`, err));
      
      // Try to recover after a delay
      setTimeout(() => {
        this.setAvailable()
          .catch(err => this.error(`[${this.getName()}] Failed to set available:`, err));
      }, 5000);
    }
  }

  /**
   * Enhanced connection handling
   */
  onKNXConnection(connectionStatus) {
    try {
      this.log(`[${this.getName()}] KNX connection status changed: ${connectionStatus}`);
      
      // Validate connection status
      if (!connectionStatus || typeof connectionStatus !== 'string') {
        throw new Error(`Invalid connection status: ${connectionStatus}`);
      }
      
      // Call parent handler
      super.onKNXConnection(connectionStatus);
      
      // Additional motion sensor specific connection handling
      if (connectionStatus === 'connected') {
        this.log(`[${this.getName()}] KNX connected - requesting initial sensor state`);
        this._requestInitialState();
      } else if (connectionStatus === 'disconnected') {
        this.log(`[${this.getName()}] KNX disconnected - motion sensor offline`);
        this.setUnavailable('KNX connection lost');
      }
      
    } catch (error) {
      this.error(`[${this.getName()}] Error handling KNX connection change:`, error);
    }
  }

  /**
   * Request initial sensor state
   * @private
   */
  _requestInitialState() {
    try {
      const settings = this.getSettings();
      if (!settings.ga_sensor) {
        throw new Error('Sensor group address not configured');
      }
      
      if (!this.knxInterface) {
        throw new Error('KNX interface not available');
      }
      
      this.log(`[${this.getName()}] Requesting initial state from ${settings.ga_sensor}`);
      
      // Use timeout for the read request
      const readTimeout = setTimeout(() => {
        this.error(`[${this.getName()}] Timeout reading initial state`);
      }, 10000);
      
      this.knxInterface.readKNXGroupAddress(settings.ga_sensor)
        .then(() => {
          clearTimeout(readTimeout);
          this.log(`[${this.getName()}] Initial state request completed`);
        })
        .catch((error) => {
          clearTimeout(readTimeout);
          this.error(`[${this.getName()}] Failed to read initial state:`, error);
          // Don't throw here, just log the error
        });
        
    } catch (error) {
      this.error(`[${this.getName()}] Error requesting initial state:`, error);
    }
  }

  /**
   * Enhanced device data retrieval
   */
  getDeviceData() {
    try {
      this.log(`[${this.getName()}] Getting device data...`);
      
      const settings = this.getSettings();
      if (!settings.ga_sensor) {
        throw new Error('Sensor group address not configured');
      }
      
      if (!this.knxInterface) {
        throw new Error('KNX interface not available');
      }
      
      return super.getDeviceData();
    } catch (error) {
      this.error(`[${this.getName()}] Error getting device data:`, error);
      throw error;
    }
  }

  /**
   * Get motion sensor diagnostics
   */
  getDiagnostics() {
    try {
      const settings = this.getSettings();
      const capabilities = this.getCapabilities();
      
      return {
        deviceName: this.getName(),
        deviceId: this.getData().id,
        sensorAddress: settings.ga_sensor,
        macAddress: settings.macAddress,
        ipAddress: settings.ipAddress,
        capabilities: capabilities,
        lastMotionState: this._lastMotionState,
        lastMotionTime: this._lastMotionTime,
        motionEventCount: this._motionEventCount,
        knxInterfaceConnected: this.knxInterface ? this.knxInterface.isConnected() : false,
        deviceAvailable: this.getAvailable(),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.error(`[${this.getName()}] Error getting diagnostics:`, error);
      return {
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Override onSettings for better error handling
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    try {
      this.log(`[${this.getName()}] Settings changed:`, changedKeys);
      
      // Validate new settings
      if (changedKeys.includes('ga_sensor')) {
        if (!this._isValidGroupAddress(newSettings.ga_sensor)) {
          throw new Error(`Invalid group address format: ${newSettings.ga_sensor}`);
        }
      }
      
      // Call parent settings handler if it exists
      if (super.onSettings) {
        await super.onSettings({ oldSettings, newSettings, changedKeys });
      }
      
      // Restart KNX listeners if sensor address changed
      if (changedKeys.includes('ga_sensor')) {
        this.log(`[${this.getName()}] Sensor address changed, restarting listeners...`);
        // The parent class should handle this, but we log it for diagnostics
      }
      
    } catch (error) {
      this.error(`[${this.getName()}] Error updating settings:`, error);
      throw error;
    }
  }

};