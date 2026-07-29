'use strict';

const { EventEmitter } = require('events');
const dgram = require('dgram');
const os = require('os');
const ip = require('ip');
const KNXInterface = require('./KNXInterface');

// 3 minute search loop
const FIND_DEVICES_INTERVAL = 3 * (60 * 1000);

// ===== KNXnet/IP protocol constants (KNX standard 03/08/02 "Core") =====
// Every frame starts with a 6-byte header: header size, protocol version,
// service type (2 bytes) and total frame length (2 bytes).
const KNX_HEADER_SIZE = 0x06; // header length in bytes
const KNX_PROTOCOL_VERSION = 0x10; // protocol version 1.0

// Service type identifiers (bytes 2-3 of the header, big-endian).
const KNX_SERVICE = {
  SEARCH_REQUEST: 0x0201,
  SEARCH_RESPONSE: 0x0202,
  DESCRIPTION_REQUEST: 0x0203,
  DESCRIPTION_RESPONSE: 0x0204,
  CONNECT_REQUEST: 0x0205,
  CONNECT_RESPONSE: 0x0206,
  CONNECTIONSTATE_RESPONSE: 0x0208,
  DISCONNECT_REQUEST: 0x0209,
  DISCONNECT_RESPONSE: 0x020a,
};

// HPAI (Host Protocol Address Information) prefix: structure length (8 bytes)
// followed by the IPv4/UDP host protocol code (0x01). Followed by IP + port.
const HPAI_HEADER = [0x08, 0x01];

// CRI (Connection Request Information) for a tunnel connection:
// structure length (4), TUNNEL_CONNECTION (0x04), TUNNEL_LINKLAYER (0x02), reserved (0x00).
const TUNNEL_CRI = [0x04, 0x04, 0x02, 0x00];

// Builds the 6-byte KNXnet/IP header for an outgoing frame.
function buildKNXHeader(serviceType, totalLength) {
  const header = Buffer.alloc(6);
  header[0] = KNX_HEADER_SIZE;
  header[1] = KNX_PROTOCOL_VERSION;
  header.writeUInt16BE(serviceType, 2);
  header.writeUInt16BE(totalLength, 4);
  return header;
}

class KNXInterfaceManager extends EventEmitter {

  constructor(localIP, homey) {
    super();

    this.homey = homey;

    // Formatted logging
    this.log = console.log.bind(this, '[KNX interface manager]');
    this.errorLog = console.error.bind(this, '[KNX interface manager] ERROR:');

    // In-flight multicast search promise, so concurrent callers share the one
    // ongoing scan instead of starting (or being rejected by) a second.
    this._multicastSearchInFlight = null;

    // In-flight unicast probes keyed by target IP, so a reconnect storm across
    // many devices on one gateway collapses into a single probe.
    this._checksInFlight = new Map();

    // Every UDP socket we open, tracked so destroy() can close them on unload.
    this._activeSockets = new Set();

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

    // Log the current interface list whenever one is found (registration itself
    // happens in _registerFoundInterface).
    this.on('interface_found', () => {
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
    // Close any UDP sockets still open from an in-flight search or probe.
    for (const socket of this._activeSockets) {
      try {
        socket.close();
      } catch (e) {
        // socket may already be closed
      }
    }
    this._activeSockets.clear();
  }

  // Registers a UDP socket so it gets cleaned up on destroy(), and self-removes on close.
  _trackSocket(socket) {
    this._activeSockets.add(socket);
    socket.once('close', () => this._activeSockets.delete(socket));
    return socket;
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
    // A valid KNXnet/IP frame has at least the 6-byte header. Anything shorter,
    // or lacking the magic bytes, is not ours.
    if (!Buffer.isBuffer(inBuffer) || inBuffer.length < KNX_HEADER_SIZE
      || inBuffer[0] !== KNX_HEADER_SIZE || inBuffer[1] !== KNX_PROTOCOL_VERSION) {
      return null;
    }
    // Guard against truncated/malformed frames: reads at fixed offsets below can
    // throw RangeError, which would otherwise escape into the socket 'message' handler.
    try {
      // Start checking the service types. Can be converted to switch case?
      // Search response
      if (inBuffer.readUInt16BE(2) === KNX_SERVICE.SEARCH_RESPONSE) {
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
          type: KNX_SERVICE.SEARCH_RESPONSE,
          interfaceName,
          interfaceIp,
          interfaceMac,
          knxAddress,
        }; // Return an object with all found values
      }

      // Description response
      if (inBuffer.readUInt16BE(2) === KNX_SERVICE.DESCRIPTION_RESPONSE) {
        // Obtain and parse the KNX topology Address
        const knxAddressRaw = inBuffer.readUInt16BE(10);
        const knxAddress = `${((knxAddressRaw & 0xf000) >> 12).toString()}.${((knxAddressRaw & 0x0f00) >> 8).toString()
        }.${(knxAddressRaw & 0xff).toString()}`;
        const interfaceMac = inBuffer.toString('hex', 24, 30); // Grab the macaddress bytes
        const interfaceName = inBuffer.toString('utf-8', 30, 60).replace(/\0[\s\S]*$/g, ''); // Read the fixed 30 bytes device description
        // this.log('Found', interfaceName, ' with KNX address:', knxAddress);
        return {
          type: KNX_SERVICE.DESCRIPTION_RESPONSE,
          interfaceName,
          interfaceMac,
          knxAddress,
        }; // Return an object with all found values
      }
      // Connection response
      if (inBuffer.readUInt16BE(2) === KNX_SERVICE.CONNECT_RESPONSE) {
        // Obtain the communictionchannel and the connection result
        const commChannel = inBuffer[6];// .readUInt16BE();
        const connectionResult = inBuffer[7];
        return { type: KNX_SERVICE.CONNECT_RESPONSE, commChannel, connectionResult };
      }
      // ConnectionState Response
      if (inBuffer.readUInt16BE(2) === KNX_SERVICE.CONNECTIONSTATE_RESPONSE) {
        const commChannel = inBuffer[6];
        return { type: KNX_SERVICE.CONNECTIONSTATE_RESPONSE, commChannel };
      }
      // Disconnect request (gateway initiating teardown of the connection)
      if (inBuffer.readUInt16BE(2) === KNX_SERVICE.DISCONNECT_REQUEST) {
        this.log('KNX connection disconnected');
        return { type: KNX_SERVICE.DISCONNECT_REQUEST };
      }
    } catch (e) {
      // Malformed/truncated KNXnet/IP frame; ignore rather than crash the handler.
      return null;
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

  // True if the given interface's subnet contains the target IP.
  _ifaceContainsTarget(iface, targetIp) {
    try {
      return Boolean(iface.netmask && ip.subnet(iface.address, iface.netmask).contains(targetIp));
    } catch (e) {
      // malformed interface entry
      return false;
    }
  }

  // Local source IP on the target's subnet, for binding our own probe sockets.
  // We bind a concrete address here, so scan every local IPv4 (including multiple
  // aliases on one NIC) and return any that matches — NOT the name-collapsed view
  // used for the knx lib. Falls back to the primary Homey IP when nothing matches.
  _getLocalIPForTarget(targetIp) {
    for (const iface of this._getLocalIPv4Interfaces()) {
      if (this._ifaceContainsTarget(iface, targetIp)) {
        return iface.address;
      }
    }
    return this.primaryLocalIP;
  }

  // OS interface *name* on the target's subnet, for the knx lib's `options.interface`.
  // Without it the lib grabs the first non-loopback IPv4 interface, which on a
  // Self-Hosted Server (multiple docker/host/VLAN interfaces) can be the wrong one
  // after a reboot, so the tunnel handshake never completes. Returns undefined when
  // no subnet matches, letting the knx lib fall back to its default selection.
  //
  // The knx library maps each interface NAME to its *last* enumerated non-internal
  // IPv4 address, so we mirror that "last wins per name" selection here: otherwise
  // the name we return could resolve to an address on a different subnet than the
  // one we matched on (the failure mode when a single NIC carries multiple IPv4s).
  _getLocalInterfaceNameForTarget(targetIp) {
    const byName = {};
    for (const iface of this._getLocalIPv4Interfaces()) {
      byName[iface.name] = iface; // last one wins, exactly like the knx lib
    }
    for (const name of Object.keys(byName)) {
      if (this._ifaceContainsTarget(byName[name], targetIp)) {
        return name;
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
  // Results are merged by MAC, so a gateway reachable over multiple local
  // interfaces still shows up as a single entry.
  findKNXInterfaces() {
    // Collapse concurrent calls onto the one ongoing scan.
    if (this._multicastSearchInFlight) {
      return this._multicastSearchInFlight;
    }
    const search = this._runInterfaceSearch()
      .finally(() => {
        this._multicastSearchInFlight = null;
      });
    this._multicastSearchInFlight = search;
    return search;
  }

  async _runInterfaceSearch() {
    let localIps = this._getLocalIPv4Interfaces().map((iface) => iface.address);
    // Fall back to the primary Homey IP if enumeration yields nothing
    if (localIps.length === 0 && this.primaryLocalIP) {
      localIps = [this.primaryLocalIP];
    }
    this.log('Scanning for KNX interfaces on local interfaces:', localIps);

    // _searchOnInterface never rejects, but allSettled makes that explicit: a
    // future change that lets it throw still can't abort the other interfaces.
    await Promise.allSettled(localIps.map((localIp) => this._searchOnInterface(localIp)));

    this.log('Current interfaces:', Object.values(this.KNXInterfaces).map((tempInterface) => {
      return tempInterface.name;
    }));
    if (Object.keys(this.KNXInterfaces).length < 1) {
      this.emit('no_interfaces');
    }
    return 'done';
  }

  // Creates a UDP socket bound to a single local interface, then sends a KNX search
  // request to the default KNX multicast IP over that interface. Resolves after a
  // fixed listen window. Never rejects so a single interface can't fail the whole scan.
  _searchOnInterface(localIp) {
    /* The correct flow to discover KNX IP interfaces is:
    - Send a search request to the KNX multicast address.
    - Receive all search responses from the IP interfaces on the same IP subnet.
    These actions mimic the traffic that ETS uses to search for IP interfaces.
    */
    return new Promise((resolve) => {
      const knxIPPort = 3671; // Default KNX IP port, rarely changed
      const knxMultiCastAddress = '224.0.23.12'; // Default KNX multicast address
      const localIPBuffer = ip.toBuffer(localIp);
      const udpSocket = this._trackSocket(dgram.createSocket({ type: 'udp4', reuseAddr: true }));

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
        .on('message', (msg) => {
          // When a message is received, parse it for KNXIP data
          const knxInterface = this.parseKNXResponse(msg);
          if (!knxInterface || knxInterface.type !== KNX_SERVICE.SEARCH_RESPONSE) {
            return; // Skip non-search-response messages, keep listening
          }
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

          // Create the KNX search request datagram: header + HPAI (this endpoint)
          const knxSearchRequest = Buffer.concat([
            buildKNXHeader(KNX_SERVICE.SEARCH_REQUEST, 14),
            Buffer.from(HPAI_HEADER),
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

  // Builds a HPAI (Host Protocol Address Information) block for the given local
  // endpoint: 08 01 <ip4> <port>. Used inside the connect/description/disconnect frames.
  _buildHPAI(localIPBuffer, port) {
    const portBuffer = Buffer.alloc(2);
    portBuffer.writeUInt16BE(port, 0);
    return Buffer.concat([Buffer.from(HPAI_HEADER), localIPBuffer, portBuffer]);
  }

  // Probe an IP for a KNX interface, de-duplicating concurrent probes for the same
  // target so a reconnect storm across many devices collapses into a single request.
  async checkKNXInterface(ipAddress) {
    const existing = this._checksInFlight.get(ipAddress);
    if (existing) return existing;

    const probe = this._probeKNXInterface(ipAddress)
      .finally(() => this._checksInFlight.delete(ipAddress));
    this._checksInFlight.set(ipAddress, probe);
    return probe;
  }

  _probeKNXInterface(ipAddress) {
    /* The correct flow to check if a given IP belongs to a KNX IP interface is:
    - Send a connection request. If this gets accepted it's certainly a KNX IP interface
    - Send the description request to obtain the device information
    - Send a disconnect request to release the tunnel we just opened, so we don't
      leave an orphaned channel occupying a (often scarce) slot on the gateway.
    These actions mimic the traffic that ETS uses to check an IP interface.
    */
    this.log('Checking if', ipAddress, 'is a KNX IP interface');

    const knxIPPort = 3671; // Default KNX IP port, rarely changed
    // Use the local interface on the same subnet as the target so a gateway on a
    // specific (V)LAN (e.g. ethernet only) gets a routable response address in the HPAI
    const localIp = this._getLocalIPForTarget(ipAddress);
    const localIPBuffer = ip.toBuffer(localIp);
    // Ephemeral port so multiple probes (different gateways) can run at once without clashing
    const udpSocket = this._trackSocket(dgram.createSocket({ type: 'udp4', reuseAddr: true }));

    return new Promise((resolve, reject) => {
      let settled = false;
      let commChannel = null;
      let timeoutHandle = null;

      // Release the tunnel channel we opened (if any) and then close the socket.
      // The close is deferred until the DISCONNECT_REQUEST datagram is actually
      // flushed: dgram.send() transmits on the next tick, so closing synchronously
      // would abort the queued send and leave an orphaned channel on the gateway.
      const releaseAndClose = () => {
        let closed = false;
        const doClose = () => {
          if (closed) return;
          closed = true;
          try {
            udpSocket.close();
          } catch (e) {
            // socket may already be closed
          }
        };
        if (commChannel === null) {
          doClose();
          return;
        }
        try {
          const { port } = udpSocket.address();
          const disconnectRequest = Buffer.concat([
            buildKNXHeader(KNX_SERVICE.DISCONNECT_REQUEST, 16),
            Buffer.from([commChannel, 0x00]), // communication channel + reserved
            this._buildHPAI(localIPBuffer, port),
          ]);
          udpSocket.send(disconnectRequest, knxIPPort, ipAddress, () => doClose());
          // Backstop in case the send callback never fires (e.g. socket wedged).
          setTimeout(doClose, 1000);
        } catch (e) {
          doClose();
        }
      };

      const finish = (err, result) => {
        if (settled) return;
        settled = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        // Settle the caller immediately; releasing the probe tunnel and closing
        // the socket is best-effort cleanup that runs on all exit paths.
        if (err) reject(err);
        else resolve(result);
        releaseAndClose();
      };

      udpSocket
        .on('error', (err) => {
          this.errorLog('UDP check error on', ipAddress, err.message);
          finish(err);
        })
        .on('message', (msg) => {
          const commResult = this.parseKNXResponse(msg);
          if (!commResult) return; // Skip non-KNX messages, keep listening

          if (commResult.type === KNX_SERVICE.CONNECT_RESPONSE) {
            // Connection accepted: remember the channel so we can release it, then
            // ask for the device description over this same endpoint.
            commChannel = commResult.commChannel;
            const { port } = udpSocket.address();
            const request = Buffer.concat([
              buildKNXHeader(KNX_SERVICE.DESCRIPTION_REQUEST, 14),
              this._buildHPAI(localIPBuffer, port),
            ]);
            udpSocket.send(request, knxIPPort, ipAddress, (err) => {
              if (err) finish(err);
            });
          } else if (commResult.type === KNX_SERVICE.DESCRIPTION_RESPONSE) {
            // Got the device info. finish() releases the tunnel channel we opened.
            this._registerFoundInterface({
              interfaceName: commResult.interfaceName,
              interfaceIp: ipAddress,
              interfaceMac: commResult.interfaceMac,
              knxAddress: commResult.knxAddress,
            });

            const instance = this.KNXInterfaces[commResult.interfaceMac];
            if (instance) finish(null, instance);
            else finish(new Error('interface_not_found'));
          }
          // A disconnect response needs no action; the socket closes via finish()/timeout.
        })
        .on('listening', () => {
          const { port } = udpSocket.address();
          // CONNECT_REQUEST: control + data HPAI (same endpoint) + tunnel CRI
          const connectRequest = Buffer.concat([
            buildKNXHeader(KNX_SERVICE.CONNECT_REQUEST, 26),
            this._buildHPAI(localIPBuffer, port),
            this._buildHPAI(localIPBuffer, port),
            Buffer.from(TUNNEL_CRI),
          ]);
          udpSocket.send(connectRequest, knxIPPort, ipAddress, (err) => {
            if (err) finish(err);
          });
        })
        .bind(0, localIp);

      timeoutHandle = setTimeout(() => {
        finish(new Error('interface_not_found'));
      }, 5 * 1000); // 5 second timeout
    });
  }

}

module.exports = KNXInterfaceManager;
