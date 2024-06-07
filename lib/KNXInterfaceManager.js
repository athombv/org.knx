'use strict';

const { EventEmitter } = require('events');
const dgram = require('dgram');
const ip = require('ip');
const KNXInterface = require('./KNXInterface');

// 3 minute search loop
// const FIND_DEVICES_INTERVAL = 3 * (60 * 1000);

class KNXInterfaceManager extends EventEmitter {

  constructor(localIP, homey) {
    super();

    this.homey = homey;

    // Formatted logging
    this.log = console.log.bind(this, '[KNX interface manager]');
    this.errorLog = console.error.bind(this, '[KNX interface manager] ERROR:');

    // search running status
    this.searchRunning = false;

    this.KNXInterfaces = {};

    if (ip.isV4Format(localIP)) {
      this.localIPBuffer = ip.toBuffer(ip.address());
      const interfaces = this.homey.settings.get('interfaces') || [];

      this.findKNXInterfaces()
        .catch((error) => {
          this.log('findKNXinterfaces error', error);
        }).finally(async () => {
          for (const savedInterface of interfaces) {
            // Force recheck interfaces from previous session if they are not found by the UDP search
            if (savedInterface && savedInterface.mac && savedInterface.ip && !this.KNXInterfaces[savedInterface.mac]) {
              try {
                await this.discoverKNXInterfaceOnIP(savedInterface.ip);
              } catch (error) {
                this.errorLog('Error checking interface', savedInterface.ip, error);
              }
            }
          }
        });
    } else {
      this.errorLog('IP address is not a valid IPv4 format');
      return;
    }

    // this.findDevicesInterval = setInterval(() => {
    //   this.findKNXInterfaces()
    //     .catch(error => {
    //       this.log('findKNXinterfaces error', error);
    //     });
    // }, FIND_DEVICES_INTERVAL);

    // Respond on an emit. Add the found interface to the list of interfaces.
    this.on('interface_found', (knxInterface) => {
      this.log('Current interfaces:', Object.values(this.KNXInterfaces).map((tempInterface) => {
        return tempInterface.name;
      }));
    });
  }

  // ////////// KNX IP Interfaces ////////////

  // This method returns a KNXinterface with matching MAC address.
  getKNXInterface(macAddress) {
    return this.KNXInterfaces[macAddress];
  }

  // Thins method returns the complete list with KNX Interfaces
  getKNXInterfaceList() {
    return this.KNXInterfaces;
  }

  /**
   * Returns a simplified list of KNX interfaces used to store interfaces in the settings
   *
   * @returns {{ip: *, name: *, mac: *}[]}
   */
  getSimpleInterfaceList() {
    return Object.values(this.KNXInterfaces).map((knxInterface) => {
      return {
        name: knxInterface.name,
        mac: knxInterface.macAddress,
        ip: knxInterface.ipAddress,
      };
    });
  }

  // Check if a given IP is a KNX IP Interface
  async discoverKNXInterfaceOnIP(ipAddress) {
    // Check if the given address is a valid IPv4 address
    if (!ip.isV4Format(ipAddress)) {
      throw new Error('invalid_ip');
    }
    return this.checkKNXInterface(ipAddress);
  }

  // Let the defined KNX Interface open the tunnel connection to the KNX network
  connectInterface(macAddress) {
    this.KNXInterfaces[macAddress]._connectKNX();
  }

  // Search for KNX interfaces (just a wrapper for this.app)
  searchInterfaces() {
    return this.findKNXInterfaces();
  }

  // Parse the received response for valid KNX IP data
  parseKNXResponse(inBuffer) {
    // Parse the first 2 bytes to check if it's KNXnet/IP traffic
    if (inBuffer[0] === 0x06 && inBuffer[1] === 0x10) {
      // Start checking the service types. Can be converted to switch case?
      // Search response
      if (inBuffer.readUInt16BE(2) === 0x202) {
        // Obtain and parse the IP address from the interface
        const interfaceIpRaw = inBuffer.readUInt32LE(8);

        /* eslint-disable max-len */
        const interfaceIp = `${(interfaceIpRaw & 0xff).toString()}.${((interfaceIpRaw >> 8) & 0xff).toString()}.${((interfaceIpRaw >> 16) & 0xff).toString()}.${((interfaceIpRaw >> 24) & 0xff).toString()}`;
        /* eslint-enable */

        // Obtain and parse the KNX topology address from the interface
        const knxAddressRaw = inBuffer.readUInt16BE(18);
        const knxAddress = `${((knxAddressRaw & 0xf000) >> 12).toString()}.${((knxAddressRaw & 0x0f00) >> 8).toString()
        }.${(knxAddressRaw & 0xff).toString()}`;
        const interfaceMac = inBuffer.toString('hex', 32, 38); // Grab the macaddress bytes
        const interfaceName = inBuffer.toString('utf-8', 38, 68).replace(/\0[\s\S]*$/g, ''); // Read the fixed 30 bytes device description
        // this.log('Found', interfaceName, '@ IP:' + interfaceIp, 'with KNX address:', knxAddress);
        return {
          type: 0x202,
          interfaceName,
          interfaceIp,
          interfaceMac,
          knxAddress,
        }; // Return an object with all found values
      }

      // Description response
      if (inBuffer.readUInt16BE(2) === 0x204) {
        // Obtain and parse the KNX topology Address
        const knxAddressRaw = inBuffer.readUInt16BE(10);
        const knxAddress = `${((knxAddressRaw & 0xf000) >> 12).toString()}.${((knxAddressRaw & 0x0f00) >> 8).toString()
        }.${(knxAddressRaw & 0xff).toString()}`;
        const interfaceMac = inBuffer.toString('hex', 24, 30); // Grab the macaddress bytes
        const interfaceName = inBuffer.toString('utf-8', 30, 60).replace(/\0[\s\S]*$/g, ''); // Read the fixed 30 bytes device description
        // this.log('Found', interfaceName, ' with KNX address:', knxAddress);
        return {
          type: 0x204,
          interfaceName,
          interfaceMac,
          knxAddress,
        }; // Return an object with all found values
      }
      // Connection response
      if (inBuffer.readUInt16BE(2) === 0x206) {
        // Obtain the communictionchannel and the connection result
        const commChannel = inBuffer[6];// .readUInt16BE();
        const connectionResult = inBuffer[7];
        return { type: 0x206, commChannel, connectionResult };
      }
      // ConnectionState Response
      if (inBuffer.readUInt16BE(2) === 0x208) {
        const commChannel = inBuffer[6];
        return { type: 0x208, commChannel };
      }
      // Disconnect response
      if (inBuffer.readUInt16BE(2) === 0x209) {
        this.log('KNX connection disconnected');
        return { type: 0x0209 };
      }
    } else {
      this.log('Response received, but not a valid KNX connection response');
    }
    return null;
  }

  // Creates a UDP socket, then sends a KNX search request to the default KNX multicast IP.
  async findKNXInterfaces() {
    /* The correct flow to check if a given IP belongs to a KNX IP interface is:
    - Send an search request to the KNX multicast address.
    - Receive all search responses from the IP itnerfaces on the samen IP subnet.
    These actions mimics the traffic that ETS uses to search for IP interfaces
    */
    if (this.searchRunning === false) {
      this.log('Scanning for KNX interfaces in subnet');
      this.searchRunning = true;

      const knxIPPort = 3671; // Default KNX IP port, rarely changed
      const knxMultiCastAddress = '224.0.23.12'; // Default KNX multicast address
      const bufferByteLocalIP = this.localIPBuffer; // Grab the local IP address
      // 0x8F 0x66 for 36710. the port is just the default KNX port with a 0 added.
      const bufferByteSearchPort = Buffer.from([0x8F, 0x66]);

      // Create the KNX search request datagram
      const knxSearchRequest = Buffer.concat([Buffer.from(
        [0x06, 0x10, 0x2, 0x1, 0x00, 0x0e, 0x08, 0x01],
      ), // Fixed KNX search bytes
      bufferByteLocalIP,
      bufferByteSearchPort]);
      const udpSocket = dgram.createSocket('udp4'); // Create the socket connection

      return new Promise((resolve, reject) => {
        udpSocket
          .on('error', (err) => {
            // If the udp server errors, close the connection
            console.error('udp server error:', err.stack);
            udpSocket.close();
            this.searchRunning = false;
            reject(err);
          })
          .on('message', (msg, rinfo) => {
            // When an message is received, parse it for KNXIP data
            const knxInterface = this.parseKNXResponse(msg);
            if (!knxInterface) {
              return reject(new Error('No valid KNXnet response'));
            }
            // If the data was valid, emit the found interface
            // here should be an extra catch to handle other not search/check related KNX messages
            try {
              if (this.KNXInterfaces[knxInterface.interfaceMac]) {
                this.log('Updating', knxInterface.interfaceName);
                this.KNXInterfaces[knxInterface.interfaceMac].updateIP(knxInterface.interfaceIp);
              } else {
                this.log('New interface', knxInterface.interfaceName);
                // Use the Interface MAC as the key value
                this.KNXInterfaces[knxInterface.interfaceMac] = new KNXInterface(knxInterface);
              }

              const interfaces = this.getSimpleInterfaceList();
              this.homey.settings.set('interfaces', interfaces);

              this.emit('interface_found', this.KNXInterfaces[knxInterface.interfaceMac]);
              return resolve(this.KNXInterfaces[knxInterface.interfaceMac]);
            } catch (error) {
              this.log('Creating IP interface instance failed: ', error);
              reject(error);
            }
            return null;
          })
          .on('listening', () => {
            // Send the first message to trigger the searchrequest

            // Set the broadcast flag since the search request is using multicast.
            udpSocket.setBroadcast(true);
            udpSocket.send(knxSearchRequest, knxIPPort, knxMultiCastAddress,
              (err, bytes) => {
                if (err) {
                  return reject(err);
                }
                return true;
              });
          })
          .bind(36710);

        setTimeout(() => {
          udpSocket.close();
          this.searchRunning = false;
          this.log('Closed search UDP socket');
          // Log all the found interfaces
          this.log('Current interfaces:', Object.values(this.KNXInterfaces).map((tempInterface) => {
            return tempInterface.name;
          }));
          if (!this.KNXInterfaces || this.KNXInterfaces.length < 1) {
            this.emit('no_interfaces');
          }
          return resolve('timeout');
        }, 10 * 1000);
      });
    }
    throw new Error('search_already_running');
  }

  async checkKNXInterface(ipAddress) {
    /* The correct flow to check if a given IP belongs to a KNX IP interface is:
    - Send an connection request. If this gets accepted it's certainly a KNX IP interface
    - Send the description request  to obtain the device information
    These actions mimics the traffic that ETS uses to check a IP interface
    */
    this.interfaceFound = false;
    if (this.searchRunning === false) {
      this.log('Checking if', ipAddress, 'is a KNX IP interface');
      this.searchRunning = true;

      const knxIPPort = 3671; // Default KNX IP port, rarely changed
      const bufferByteLocalIP = this.localIPBuffer; // Grab the local IP address
      const bufferByteConnectionPort = Buffer.from([0x8F, 0x67]); // port 36711
      const bufferByteDevicePort = Buffer.from([0x8F, 0x68]); // port 36712

      // KNX header for connect request, 8 octets, IPV4
      const knxConnectRequest = Buffer.concat(
        [Buffer.from([0x06, 0x10, 0x02, 0x05, 0x00, 0x1a, 0x08, 0x01]),
          bufferByteLocalIP, // IP for HPAI discovery
          bufferByteConnectionPort, // Port for HPAI discovery
          Buffer.from([0x08, 0x01]), // 8 octets, IPV4
          bufferByteLocalIP, // IP for HPAI data endpoint
          bufferByteDevicePort, // Port for HPAI data endpoint
          // 4octets, Tunnel connection, tunnel linklayer, 00 reserved
          Buffer.from([0x04, 0x04, 0x02, 0x00])],
      );

      const knxDeviceInfoRequest = Buffer.concat(
        [Buffer.from([0x06, 0x10, 0x02, 0x03, 0x00, 0x0e, 0x08, 0x01]), // KNX header
          bufferByteLocalIP,
          bufferByteConnectionPort],
      );

      const udpSocket = dgram.createSocket('udp4'); // Create the socket connections

      return new Promise((resolve, reject) => {
        udpSocket
          .on('error', (err) => {
            // If the udp server errors, close the connection
            console.error('UDP server error', err.stack);
            udpSocket.close();
            this.searchRunning = false;
            reject(err);
          })
          .on('message', (msg, rinfo) => {
            const commResult = this.parseKNXResponse(msg);
            if (!commResult) return new Error('No valid KNX message parsed');

            if (commResult.type === 0x206) {
              // console.log('Received connection response, now sending description request');
              udpSocket.send(knxDeviceInfoRequest, knxIPPort, ipAddress, (err, bytes) => {
                if (err) throw err;
              });
            } else if (commResult.type === 0x209) {
              // console.log('Closing connection');
              udpSocket.close();
            } else if (commResult.type === 0x204) {
              // console.log('Received description response');
              const knxInterface = {
                interfaceName: commResult.interfaceName,
                interfaceIp: ipAddress,
                interfaceMac: commResult.interfaceMac,
                knxAddress: commResult.knxAddress,
              };

              udpSocket.close();
              this.interfaceFound = true;
              this.searchRunning = false;

              try {
                // Use the Interface MAC as the key value
                this.KNXInterfaces[knxInterface.interfaceMac] = new KNXInterface(knxInterface);
                const interfaces = this.getSimpleInterfaceList();
                this.homey.settings.set('interfaces', interfaces);
                this.emit('interface_found', this.KNXInterfaces[knxInterface.interfaceMac]);
                return resolve(this.KNXInterfaces[knxInterface.interfaceMac]);
              } catch (err) {
                this.log('Creating IP interface instance failed:', err);
                return reject(err);
              }
            }
            return null;
          })
          .on('listening', () => {
            udpSocket.send(knxConnectRequest, knxIPPort, ipAddress, (err, bytes) => {
              if (err) {
                return reject(err);
              }
              return null;
            });
          })
          .bind(36711);

        setTimeout(() => {
          if (!this.interfaceFound) {
            udpSocket.close();
            this.searchRunning = false;
            // this.log('Closed search UDP socket');
            reject(new Error('interface_not_found'));
          }
        }, 5 * 1000); // 5 second timeout
      });
    }
    throw new Error('search_already_running');
  }

}

module.exports = KNXInterfaceManager;
