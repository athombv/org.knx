'use strict';

const KNXGenericDriver = require('../../lib/GenericKNXDriver');

module.exports = class KNXMotionSensorDriver extends KNXGenericDriver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    try {
      this.log('KNX Motion Sensor Driver initializing...');
      
      // Call parent initialization
      await super.onInit();
      
      // Register additional flow cards specific to motion sensors
      this._registerMotionFlowCards();
      
      this.log('KNX Motion Sensor Driver initialized successfully');
    } catch (error) {
      this.error('Failed to initialize KNX Motion Sensor Driver:', error);
      throw error;
    }
  }

  /**
   * Register motion sensor specific flow cards
   * @private
   */
  _registerMotionFlowCards() {
    try {
      this.log('Registering motion sensor flow cards...');
      
      // Motion detected trigger
      const motionDetectedTrigger = this.homey.flow.getDeviceTriggerCard('motion_detected');
      if (motionDetectedTrigger) {
        motionDetectedTrigger.registerRunListener(async (args, state) => {
          try {
            this.log(`Motion detected trigger - Device: ${args.device.getName()}`);
            return true;
          } catch (error) {
            this.error('Error in motion detected trigger:', error);
            return false;
          }
        });
      }

      // Motion stopped trigger  
      const motionStoppedTrigger = this.homey.flow.getDeviceTriggerCard('motion_stopped');
      if (motionStoppedTrigger) {
        motionStoppedTrigger.registerRunListener(async (args, state) => {
          try {
            this.log(`Motion stopped trigger - Device: ${args.device.getName()}`);
            return true;
          } catch (error) {
            this.error('Error in motion stopped trigger:', error);
            return false;
          }
        });
      }

      // Motion changed trigger
      const motionChangedTrigger = this.homey.flow.getDeviceTriggerCard('motion_changed');
      if (motionChangedTrigger) {
        motionChangedTrigger.registerRunListener(async (args, state) => {
          try {
            this.log(`Motion changed trigger - Device: ${args.device.getName()}, Motion: ${state.motion}`);
            return true;
          } catch (error) {
            this.error('Error in motion changed trigger:', error);
            return false;
          }
        });
      }

      this.log('Motion sensor flow cards registered successfully');
    } catch (error) {
      this.error('Error registering motion sensor flow cards:', error);
      // Don't throw here, as flow card registration errors shouldn't prevent driver initialization
    }
  }

  /**
   * Enhanced onPair method with better error handling
   */
  onPair(session) {
    try {
      this.log('Starting motion sensor pairing session...');
      
      // Call parent onPair
      if (super.onPair) {
        super.onPair(session);
      }
      
      // Add motion sensor specific pairing handlers
      this._setupMotionSensorPairing(session);
      
    } catch (error) {
      this.error('Error during motion sensor pairing:', error);
      if (session) {
        session.emit('error', error.message);
      }
    }
  }

  /**
   * Setup motion sensor specific pairing
   * @param {Object} session - The pairing session
   * @private
   */
  _setupMotionSensorPairing(session) {
    try {
      // Validate motion sensor settings during pairing
      session.setHandler('validate_motion_settings', async (data) => {
        try {
          this.log('Validating motion sensor settings:', data);
          
          const validation = this._validateMotionSettings(data);
          if (!validation.isValid) {
            throw new Error(validation.error);
          }
          
          return { success: true };
        } catch (error) {
          this.error('Motion sensor settings validation failed:', error);
          throw error;
        }
      });
      
      // Test motion sensor connection
      session.setHandler('test_motion_sensor', async (data) => {
        try {
          this.log('Testing motion sensor connection:', data);
          
          const testResult = await this._testMotionSensorConnection(data);
          return testResult;
        } catch (error) {
          this.error('Motion sensor connection test failed:', error);
          throw error;
        }
      });

    } catch (error) {
      this.error('Error setting up motion sensor pairing:', error);
      throw error;
    }
  }

  /**
   * Validate motion sensor specific settings
   * @param {Object} settings - Settings to validate
   * @returns {Object} Validation result
   * @private
   */
  _validateMotionSettings(settings) {
    try {
      if (!settings) {
        return { isValid: false, error: 'Settings are missing' };
      }
      
      if (!settings.ga_sensor) {
        return { isValid: false, error: 'Motion sensor group address is required' };
      }
      
      // Validate group address format
      if (!this._isValidGroupAddress(settings.ga_sensor)) {
        return { isValid: false, error: `Invalid group address format: ${settings.ga_sensor}` };
      }
      
      if (!settings.macAddress) {
        return { isValid: false, error: 'KNX interface MAC address is required' };
      }
      
      // Additional motion sensor validations could go here
      
      return { isValid: true };
    } catch (error) {
      this.error('Error validating motion settings:', error);
      return { isValid: false, error: error.message };
    }
  }

  /**
   * Test motion sensor connection
   * @param {Object} settings - Settings to test
   * @returns {Object} Test result
   * @private
   */
  async _testMotionSensorConnection(settings) {
    try {
      this.log('Testing motion sensor connection with settings:', settings);
      
      // Get KNX interface manager
      const knxInterfaceManager = this.homey.app.getKNXInterfaceManager();
      if (!knxInterfaceManager) {
        throw new Error('KNX Interface Manager not available');
      }
      
      // Try to find the interface
      let knxInterface = knxInterfaceManager.getKNXInterface(settings.macAddress);
      
      if (!knxInterface && settings.ipAddress) {
        // Try to discover interface on specified IP
        this.log('Attempting to discover KNX interface on IP:', settings.ipAddress);
        try {
          await knxInterfaceManager.discoverKNXInterfaceOnIP(settings.ipAddress);
          knxInterface = knxInterfaceManager.getKNXInterface(settings.macAddress);
        } catch (discoveryError) {
          this.log('Interface discovery failed:', discoveryError.message);
        }
      }
      
      if (!knxInterface) {
        return {
          success: false,
          error: 'KNX interface not found. Please check MAC address and IP address.'
        };
      }
      
      // Test if interface is connected
      if (!knxInterface.isConnected()) {
        return {
          success: false,
          error: 'KNX interface is not connected. Please check network connection.'
        };
      }
      
      // Try to read from the motion sensor address
      try {
        this.log('Testing read from motion sensor address:', settings.ga_sensor);
        await knxInterface.readKNXGroupAddress(settings.ga_sensor);
        
        return {
          success: true,
          message: 'Motion sensor connection test successful'
        };
      } catch (readError) {
        this.log('Read test failed, but interface is connected:', readError.message);
        // This might be normal if the sensor doesn't respond to read requests
        return {
          success: true,
          message: 'KNX interface connected (sensor read test inconclusive)',
          warning: 'Could not read from sensor address - this may be normal for some sensors'
        };
      }
      
    } catch (error) {
      this.error('Motion sensor connection test error:', error);
      return {
        success: false,
        error: error.message
      };
    }
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
    
    // Basic format validation for KNX group addresses
    const knxPattern = /^(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{1,3})|(\d{1,5})$/;
    return knxPattern.test(address);
  }

  /**
   * Get driver diagnostics
   */
  getDiagnostics() {
    try {
      const devices = this.getDevices();
      
      return {
        driverName: 'KNX Motion Sensor',
        deviceCount: devices.length,
        devices: devices.map(device => {
          try {
            if (typeof device.getDiagnostics === 'function') {
              return device.getDiagnostics();
            } else {
              return {
                deviceName: device.getName(),
                deviceId: device.getData().id,
                available: device.getAvailable()
              };
            }
          } catch (deviceError) {
            this.error(`Error getting diagnostics for device ${device.getName()}:`, deviceError);
            return {
              deviceName: device.getName(),
              error: deviceError.message
            };
          }
        }),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.error('Error getting driver diagnostics:', error);
      return {
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

};