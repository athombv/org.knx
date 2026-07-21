'use strict';

const { EventEmitter } = require('events');
const dgram = require('dgram');
const os = require('os');
const ip = require('ip');
const KNXInterface = require('./KNXInterface');

// 3 minute search loop
const FIND_DEVICES_INTERVAL = 3 * (60 * 1000);

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
      // Primary Homey IP, used as a fallback when an interface can't be matched by subnet
      this.primaryLocalIP = localIP;
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

    this.findDevicesInterval = setInterval(() => {
      this.findKNXInterfaces()
        .catch((error) => {
          this.log('findKNXinterfaces error', error);
        });
    }, FIND_DEVICES_INTERVAL);

    // Respond on an emit. Add the found interface to the list of interfaces.
    this.on('interface_found', (knxInterface) => {
      this.log('Current interfaces:', Object.values(this.KNXInterfaces).map((tempInterface) => {
        return tempInterface.name;
      }));
    });
  }

  // Clears the periodic discovery interval and any pending resources.
  destroy() {
    if (this.findDevicesInterval) {
      clearInterval(this.findDevicesInterval);
      this.findDevicesInterval = null;
    }
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
    }
    // Non-KNX UDP packets are silently ignored to avoid log spam on noisy networks
    return null;
  }

  // Returns all non-internal local IPv4 interfaces (address + netmask).
  // A Homey Pro can be connected over both ethernet and wifi at the same time,
  // and KNX gateways sometimes live on only one of those (V)LANs.
  _getLocalIPv4Interfaces() {
    const nets = os.networkInterfaces() || {};
    const result = [];
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        // net.family is 'IPv4' on older Node and 4 on newer versions
        const isV4 = net.family === 'IPv4' || net.family === 4;
        if (isV4 && !net.internal) {
          result.push({ name, address: net.address, netmask: net.netmask });
        }
      }
    }
    return result;
  }

  // Picks the local source IP that shares a subnet with the given target,
  // so unicast checks against a gateway on a specific (V)LAN use the right interface.
  _getLocalIPForTarget(targetIp) {
    for (const iface of this._getLocalIPv4Interfaces()) {
      try {
        if (iface.netmask && ip.subnet(iface.address, iface.netmask).contains(targetIp)) {
          return iface.address;
        }
      } catch (e) {
        // ignore malformed interface entries and keep looking
      }
    }
    return this.primaryLocalIP;
  }

  // Picks the OS interface *name* whose subnet contains the given target.
  // The knx library binds its tunnel to the interface named in `options.interface`;
  // without this it grabs the first non-loopback IPv4 interface, which on a
  // Self-Hosted Server (multiple docker/host/VLAN interfaces) can be the wrong one
  // after a reboot, so the tunnel handshake never completes. Returns undefined when
  // no subnet matches, letting the knx lib fall back to its default selection.
  _getLocalInterfaceNameForTarget(targetIp) {
    for (const iface of this._getLocalIPv4Interfaces()) {
      try {
        if (iface.netmask && ip.subnet(iface.address, iface.netmask).contains(targetIp)) {
          return iface.name;
        }
      } catch (e) {
        // ignore malformed interface entries and keep looking
      }
    }
    return undefined;
  }

  // Options shared by every KNXInterface, giving each one a resolver so it can
  // (re)bind its tunnel to the correct local interface on every connect attempt.
  _interfaceOptions() {
    return {
      getLocalInterfaceName: (targetIp) => this._getLocalInterfaceNameForTarget(targetIp),
    };
  }

  // Store or update a discovered interface, keyed by MAC so a gateway seen on
  // multiple local interfaces is merged into a single entry.
  _registerFoundInterface(knxInterface) {
    try {
      if (this.KNXInterfaces[knxInterface.interfaceMac]) {
        this.log('Updating', knxInterface.interfaceName);
        this.KNXInterfaces[knxInterface.interfaceMac].updateIP(knxInterface.interfaceIp);
      } else {
        this.log('New interface', knxInterface.interfaceName);
        // Use the Interface MAC as the key value
        this.KNXInterfaces[knxInterface.interfaceMac] = new KNXInterface(knxInterface, this._interfaceOptions());
      }

      this.homey.settings.set('interfaces', this.getSimpleInterfaceList());
      this.emit('interface_found', this.KNXInterfaces[knxInterface.interfaceMac]);
    } catch (error) {
      this.log('Creating IP interface instance failed: ', error);
    }
  }

  // Searches for KNX interfaces on every local IPv4 interface in parallel.
  // Results are merged by MAC, so the customer never sees that two interfaces were scanned.
  async findKNXInterfaces() {
    if (this.searchRunning === true) {
      throw new Error('search_already_running');
    }
    this.searchRunning = true;
    try {
      let localIps = this._getLocalIPv4Interfaces().map((iface) => iface.address);
      // Fall back to the primary Homey IP if enumeration yields nothing
      if (localIps.length === 0 && this.primaryLocalIP) {
        localIps = [this.primaryLocalIP];
      }
      this.log('Scanning for KNX interfaces on local interfaces:', localIps);

      // _searchOnInterface never rejects, so one interface failing (e.g. no route)
      // can't abort the others
      await Promise.all(localIps.map((localIp) => this._searchOnInterface(localIp)));

      this.log('Current interfaces:', Object.values(this.KNXInterfaces).map((tempInterface) => {
        return tempInterface.name;
      }));
      // Debug: merged view of every gateway after scanning all local interfaces
      this.log('[DEBUG] Merged KNX interfaces after scan:', Object.values(this.KNXInterfaces).map((knxInterface) => {
        return `${knxInterface.name} (mac=${knxInterface.macAddress}, ip=${knxInterface.ipAddress})`;
      }));
      if (Object.keys(this.KNXInterfaces).length < 1) {
        this.emit('no_interfaces');
      }
      return 'done';
    } finally {
      this.searchRunning = false;
    }
  }

  // Creates a UDP socket bound to a single local interface, then sends a KNX search
  // request to the default KNX multicast IP over that interface. Resolves after a
  // fixed listen window. Never rejects so a single interface can't fail the whole scan.
  _searchOnInterface(localIp) {
    /* The correct flow to check if a given IP belongs to a KNX IP interface is:
    - Send an search request to the KNX multicast address.
    - Receive all search responses from the IP interfaces on the same IP subnet.
    These actions mimics the traffic that ETS uses to search for IP interfaces
    */
    return new Promise((resolve) => {
      const knxIPPort = 3671; // Default KNX IP port, rarely changed
      const knxMultiCastAddress = '224.0.23.12'; // Default KNX multicast address
      const localIPBuffer = ip.toBuffer(localIp);
      const udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        try {
          udpSocket.close();
        } catch (e) {
          // socket may already be closed
        }
        resolve();
      };

      udpSocket
        .on('error', (err) => {
          this.errorLog('udp search error on', localIp, err.message);
          cleanup();
        })
        .on('message', (msg, rinfo) => {
          // When a message is received, parse it for KNXIP data
          const knxInterface = this.parseKNXResponse(msg);
          if (!knxInterface || knxInterface.type !== 0x202) {
            return; // Skip non-search-response messages, keep listening
          }
          // Debug: which local interface received the response, and from where
          this.log(`[DEBUG] Search response on ${localIp} from ${rinfo.address}: `
            + `${knxInterface.interfaceName} (mac=${knxInterface.interfaceMac}, ip=${knxInterface.interfaceIp})`);
          this._registerFoundInterface(knxInterface);
        })
        .on('listening', () => {
          // Force the multicast search out of this specific interface
          try {
            udpSocket.setMulticastInterface(localIp);
          } catch (e) {
            this.errorLog('setMulticastInterface failed on', localIp, e.message);
          }

          // HPAI: tell the gateway to send responses back to this interface's
          // address and the ephemeral port this socket is actually listening on
          const { port } = udpSocket.address();
          const portBuffer = Buffer.alloc(2);
          portBuffer.writeUInt16BE(port, 0);

          // Create the KNX search request datagram
          const knxSearchRequest = Buffer.concat([
            Buffer.from([0x06, 0x10, 0x2, 0x1, 0x00, 0x0e, 0x08, 0x01]), // Fixed KNX search bytes
            localIPBuffer,
            portBuffer,
          ]);

          udpSocket.send(knxSearchRequest, knxIPPort, knxMultiCastAddress, (err) => {
            if (err) {
              this.errorLog('search send failed on', localIp, err.message);
              cleanup();
            }
          });
        })
        // Bind to an ephemeral port on this interface's address so multiple
        // interface searches can run at the same time without port clashes
        .bind(0, localIp);

      setTimeout(cleanup, 10 * 1000);
    });
  }

  async checkKNXInterface(ipAddress) {
    /* The correct flow to check if a given IP belongs to a KNX IP interface is:
    - Send an connection request. If this gets accepted it's certainly a KNX IP interface
    - Send the description request  to obtain the device information
    These actions mimics the traffic that ETS uses to check a IP interface
    */
    if (this.searchRunning === false) {
      this.log('Checking if', ipAddress, 'is a KNX IP interface');
      this.searchRunning = true;

      const knxIPPort = 3671; // Default KNX IP port, rarely changed
      // Use the local interface on the same subnet as the target so a gateway on a
      // specific (V)LAN (e.g. ethernet only) gets a routable response address in the HPAI
      const localIp = this._getLocalIPForTarget(ipAddress);
      const bufferByteLocalIP = ip.toBuffer(localIp); // Local IP matched to the target subnet
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
        let interfaceFound = false;

        udpSocket
          .on('error', (err) => {
            // If the udp server errors, close the connection
            console.error('UDP server error', err.stack);
            try {
              udpSocket.close();
            } catch (e) {
              // socket may already be closed
            }
            this.searchRunning = false;
            reject(err);
          })
          .on('message', (msg, rinfo) => {
            const commResult = this.parseKNXResponse(msg);
            if (!commResult) return null; // Skip non-KNX messages, keep listening

            if (commResult.type === 0x206) {
              // console.log('Received connection response, now sending description request');
              udpSocket.send(knxDeviceInfoRequest, knxIPPort, ipAddress, (err, bytes) => {
                if (err) {
                  try {
                    udpSocket.close();
                  } catch (e) {
                    // socket may already be closed
                  }
                  this.searchRunning = false;
                  reject(err);
                }
              });
            } else if (commResult.type === 0x209) {
              // console.log('Closing connection');
              try {
                udpSocket.close();
              } catch (e) {
                // socket may already be closed
              }
            } else if (commResult.type === 0x204) {
              // console.log('Received description response');
              const knxInterface = {
                interfaceName: commResult.interfaceName,
                interfaceIp: ipAddress,
                interfaceMac: commResult.interfaceMac,
                knxAddress: commResult.knxAddress,
              };

              try {
                udpSocket.close();
              } catch (e) {
                // socket may already be closed
              }
              interfaceFound = true;
              this.searchRunning = false;

              try {
                // Update existing interface or create a new one
                if (this.KNXInterfaces[knxInterface.interfaceMac]) {
                  this.KNXInterfaces[knxInterface.interfaceMac].updateIP(knxInterface.interfaceIp);
                } else {
                  this.KNXInterfaces[knxInterface.interfaceMac] = new KNXInterface(knxInterface, this._interfaceOptions());
                }
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
                try {
                  udpSocket.close();
                } catch (e) {
                  // socket may already be closed
                }
                this.searchRunning = false;
                return reject(err);
              }
              return null;
            });
          })
          .bind(36711, localIp);

        setTimeout(() => {
          if (!interfaceFound) {
            try {
              udpSocket.close();
            } catch (error) {
              // socket may already be closed
            }
            this.searchRunning = false;
            reject(new Error('interface_not_found'));
          }
        }, 5 * 1000); // 5 second timeout
      });
    }
    throw new Error('search_already_running');
  }

}

module.exports = KNXInterfaceManager;
