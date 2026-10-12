'use strict';

const { EventEmitter } = require('events');
const dgram = require('dgram');
const knx = require('knx');
const PromiseQueue = require('promise-queue');
const util = require('util');
const { applyKNXConnectionFixes } = require('./KNXConnectionFixes');

class KNXInterface extends EventEmitter {

  constructor(knxInterface) {
    super();

    // Setting object parameters from parameters from the interfacemanager
    this.name = knxInterface.interfaceName;
    this.ipAddress = knxInterface.interfaceIp;
    this.macAddress = knxInterface.interfaceMac;
    this.knxAddress = knxInterface.knxAddress;

    // KNX interface settings/variabeles
    this.isConnected = false; // Boolean to keep track of the connection status.
    this.isTimedOut = false; // Boolean to keep track of timeout events.
    this.knxDisconnectCount = 0;

    // Status reads (one or more per device after every (re)connect) and writes use separate
    // queues. With a shared queue, commands waited behind all pending reads (each up to 3 s
    // when a read is not answered) and were rejected with 'Queue limit reached' while more
    // than 100 reads were queued; reads beyond 100 were dropped.
    this.knxCommunicationQueue = new PromiseQueue(2, Infinity); // reads
    this.knxWriteQueue = new PromiseQueue(2, Infinity); // writes

    // Learnmode variables
    this.learnMode = false;
    this.knxEventCaptures = [];

    // Setup logging and binding for fucntions
    this.log = console.log.bind(this, (`[Interface: ${this.name}]`));

    // Object arrays with callbacks
    this.onKNXConnectionCallbacks = [];
    this.onKNXEventCallbacks = {};

    this.log(`Creating interface with IP ${this.ipAddress}`);
    this.createConnection();
  }

  // Function to create the KNX connection
  createConnection() {
    // The KNX tunnel connection itself through the knx library
    if (this.isConnected === true && !this.isTimedOut) return; // Skip re-initializing when already connected and healthy.
    // Dispose of a previous connection object so its handlers and timers can no longer
    // change the state of this interface.
    this._disposeConnection();
    try {
      this.knxConnection = new knx.Connection({
        ipAddr: this.ipAddress, // IP address obtained through interfacemanager
        ipPort: 3671, // Fixed and part of the KNXnet/IP protocol.
        physAddr: this.knxAddress, // KNX address obtained through interfacemanager
        forceTunneling: true, // We want true tunnel connections
        loglevel: 'info',
        manualConnect: true, // The connection should be only opened if it's going to be used.
        minimumDelay: 10, // This sets the timeout between messages in ms
        // Setup the handlers that the library will use to respond on emits from FSM.js
        suppress_ack_ldatareq: false,
        handlers: {
          connected: () => {
            this.log('KNX Connected');
            this.emit('tunnel_alive', this.knxConnection && this.knxConnection.channel_id);
            // Change both connection booleans to their optimal state
            this.isConnected = true;
            this.isTimedOut = false;

            this.onKNXConnectionCallbacks.forEach((connCallback) => {
              try {
                connCallback('connected');
              } catch (error) {
                this.log(error);
              }
            });
          },
          disconnected: () => {
            this.log('KNX Disconnected');
            this.isConnected = false;
            this.isTimedOut = false;

            this.onKNXConnectionCallbacks.forEach((callback) => {
              try {
                callback('disconnected');
              } catch (error) {
                this.log(error);
              }
            });
          },
          event: this.onKNXEventListener.bind(this),
          heartbeat_ok: () => {
            this.emit('tunnel_alive', this.knxConnection && this.knxConnection.channel_id);
          },
          timeout: () => {
            this.isTimedOut = true;
            this.log('FSM timeout received');
          },
          error: (connstatus) => {
            this.log('Error from FSM:', connstatus);
          },
        },
      });
      applyKNXConnectionFixes(this.knxConnection);
    } catch (error) {
      this.log('KNX lib error', error); // This should be able to catch the 'no valid ipv4 interfaces' error
    }
  }

  // Remove all handlers from the current connection object, stop its timers and close
  // its socket.
  _disposeConnection() {
    const oldConnection = this.knxConnection;
    if (!oldConnection) return;
    this.knxConnection = null;
    try {
      oldConnection.off(); // machina: remove all event listeners
    } catch (error) {
      // ignore
    }
    ['idletimer', 'connstatetimer', 'disconnecttimer', 'tunnelingAckTimer'].forEach((timer) => {
      clearTimeout(oldConnection[timer]);
    });
    clearInterval(oldConnection.connecttimer);
    // Pending callbacks (e.g. a scheduled reconnect) must not move it to another state.
    oldConnection.transition = () => {};
    oldConnection.handle = () => {};
    try {
      if (oldConnection.socket) oldConnection.socket.close();
    } catch (error) {
      // socket may already be closed
    }
  }

  // ////////// KNX IP Interface and connection stuff ////////////

  // Function to (re)open the connection to the KNX network
  _connectKNX() {
    if (!this.knxConnection) return; // ensure to have a KNX connection instance.
    // A tunnel left open by the previous run of the app (e.g. after a crash) is closed
    // first, so the interface does not have two tunnels from Homey at the same time.
    if (this.staleChannel !== undefined && this.staleChannel !== null) {
      if (this.releasingStaleChannel) return;
      this.releasingStaleChannel = true;
      const channel = this.staleChannel;
      this.staleChannel = null;
      this.log(`Closing tunnel ${channel} left open by the previous run`);
      KNXInterface.sendDisconnect(this.ipAddress, channel, 1000)
        .catch((error) => this.log('Closing old tunnel failed', error))
        .then(() => {
          this.releasingStaleChannel = false;
          this._connectKNX();
        });
      return;
    }
    if (this.releasingStaleChannel) return;
    if (this.isConnected !== true) {
      this.log('Trying to (re)connect');
      try {
        this.knxConnection.Connect();
      } catch (error) {
        this.log('KNX lib connect error', error);
      }
    } else {
      this.log('Already connected');
    }
  }

  // Send a DISCONNECT_REQUEST for a tunnel channel from a temporary socket and wait for
  // the response (or the timeout).
  static sendDisconnect(ipAddress, channel, timeoutMs) {
    return new Promise((resolve) => {
      const socket = dgram.createSocket('udp4');
      let done = false;
      let timer = null;
      const finish = (result) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          socket.close();
        } catch (error) {
          // ignore
        }
        resolve(result);
      };
      timer = setTimeout(() => finish(false), timeoutMs);
      socket.on('error', () => finish(false));
      socket.on('message', (msg) => {
        if (msg.length >= 8 && msg.readUInt16BE(2) === 0x020a && msg[6] === channel) finish(true);
      });
      // Header, channel, reserved, HPAI (UDP, 0.0.0.0:0 = reply to sender)
      const request = Buffer.from([0x06, 0x10, 0x02, 0x09, 0x00, 0x10, channel & 0xff, 0x00,
        0x08, 0x01, 0, 0, 0, 0, 0, 0]);
      socket.send(request, 3671, ipAddress, (error) => {
        if (error) finish(false);
      });
    });
  }

  // Close the tunnel when the app stops, so the interface frees it right away instead of
  // keeping it for up to 120 s.
  async shutdown() {
    const connection = this.knxConnection;
    const channel = connection && connection.channel_id;
    this._disposeConnection();
    this.isConnected = false;
    if (channel === undefined || channel === null) return;
    this.log(`Closing tunnel ${channel} before stopping`);
    await KNXInterface.sendDisconnect(this.ipAddress, channel, 500);
  }

  // Function to update the IP address if a change is detected by the interfacemanager.
  updateIP(newIPaddress) {
    if (newIPaddress === this.ipAddress) {
      this.log('IP has not changed, maintaining current connection');
    } else {
      this.log('Creating new KNX tunnel connection');
      this.ipAddress = newIPaddress;
      this._reconnect();
    }
  }

  // Safely disconnect and reconnect the KNX connection
  _reconnect() {
    this.isTimedOut = false;
    let done = false;
    let fallbackTimer = null;
    // Create the new connection AND open it. The new connection object is created with
    // manualConnect, so without the _connectKNX() call it was never opened.
    const recreate = () => {
      if (done) return;
      done = true;
      clearTimeout(fallbackTimer);
      this.isConnected = false;
      this.createConnection();
      this._connectKNX();
    };
    // Disconnect() waits for the old connection to become idle, which may never happen
    // if the old address is unreachable.
    fallbackTimer = setTimeout(() => {
      this.log('Disconnect did not complete, forcing reconnect');
      recreate();
    }, 5000);

    if (!this.knxConnection) {
      recreate();
      return;
    }
    try {
      this.knxConnection.Disconnect(recreate);
    } catch (error) {
      this.log('Error during disconnect, forcing reconnect', error);
      recreate();
    }
  }

  // Function which returns the connected (or last connected) IP Address
  getConnectedIPAddress() {
    return this.ipAddress;
  }

  // KNX connection listener. Stores the given callback
  onKNXConnectionListener(callback) {
    if (this.isConnected) {
      callback('connected');
    }
    this.onKNXConnectionCallbacks.push(callback); // list with KNX callback to update on connecting.
    // console.log('KNXConnection callback list updated');
  }

  removeKNXConnectionListener(callback) {
    this.onKNXConnectionCallbacks = this.onKNXConnectionCallbacks.filter((cb) => cb !== callback);
    // console.log('KNXConnection callback list updated');
  }

  // KNX busevent listener, callbacks are added per groupaddress
  addKNXEventListener(groupaddress, callback) {
    if (typeof groupaddress === 'string' && groupaddress !== '') {
      if (!this.onKNXEventCallbacks[groupaddress]) {
        this.onKNXEventCallbacks[groupaddress] = [callback];
      } else {
        this.onKNXEventCallbacks[groupaddress].push(callback);
      }
    }
  }

  // Removes all listeners attached the the provided callback
  removeKNXEventListener(groupaddress, callback) {
    if (typeof groupaddress === 'string' && groupaddress !== '') {
      if (this.onKNXEventCallbacks[groupaddress]) {
        this.onKNXEventCallbacks[groupaddress] = this.onKNXEventCallbacks[groupaddress]
          .filter((cb) => cb !== callback);
      }
    }
  }

  // KNX busevent listener, triggered when an KNX event occurs
  onKNXEventListener(event, source, destination, value) {
    // Emit the event, and if there is a callback for the destiniation addres call it.
    if (!destination) return;
    this.emit('knx_event', event, destination, value);
    if (this.onKNXEventCallbacks[destination] && (event === 'GroupValue_Write' || event === 'GroupValue_Response')) {
      this.onKNXEventCallbacks[destination].forEach((callback) => {
        if (!callback || typeof callback !== 'function') return;
        callback(destination, value);
      });
    }
    // If the learnmode is turned on, also store the event in de capture array.
    if (this.learnMode) {
      this.log('Pushing event to learn mode store');
      this.knxEventCaptures.push({
        event,
        destination,
        source,
        value,
      });
    }
  }

  // ////////// KNX Group Address Stuff ////////////

  // Write a groupadress with the given value and datapoint type
  async writeKNXGroupAddress(groupaddress, value, datapoint) {
    // Check if the groupadress is not empty
    if (groupaddress && groupaddress !== '') {
      if (this.isConnected === true && !this.isTimedOut) {
        // Only add the request in the queue when the connection is openend.
        this.log(`Writing ${value} to ${groupaddress}`);
        return this.knxWriteQueue.add(async () => {
          // Create a promisify function from the knx lib, then call it.
          // console.log('Writing', value, 'with dpt', datapoint, 'to', groupaddress);
          const writeAsync = util.promisify(this.knxConnection.write.bind(this.knxConnection));
          return writeAsync(groupaddress, value, datapoint);
        });
      }
      ++this.knxDisconnectCount;
      throw new Error('knx_no_connection');
    }
    throw new Error('knx_no_groupaddress');
  }

  // Function to read the value for the given groupadress
  async readKNXGroupAddress(groupaddress) {
    if (groupaddress && groupaddress !== '') {
      // Check if the groupadress is not empty
      if (this.isConnected === true && !this.isTimedOut) {
        return this.knxCommunicationQueue.add(async () => {
          // Only add the request in the queue when the connection is openend.
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error(`knx_read_timeout: ${groupaddress}`)), 3000);
            this.knxConnection.read(groupaddress, (src, data) => {
              clearTimeout(timeout);
              resolve(data);
            });
          });
        });
      }
      ++this.knxDisconnectCount;
      throw new Error('knx_no_connection');
    }
    throw new Error('knx_no_groupaddress');
  }

  // Run the learnmode for the given time.
  async learnModeSwitch(time) {
    this.knxEventCaptures = [];
    if (this.learnMode === true) throw new Error('already_learmode');
    this.learnMode = true; // start the learnmode

    await this._wait(time);
    this.learnMode = false;
    return this.filterKNXEvents(this.knxEventCaptures);
  }

  /*
    Async wait function
   */
  _wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /* Function to filter the captured events from the learnmode.
  Duplicate entries will be reduced to one entry, which will be counted.
  The list will then be sorted by event occurrence if possible.
  */
  filterKNXEvents(list) {
    const filterSet = new Set();
    const countObj = {};
    for (const obj of list) {
      if (filterSet.has(obj.destination)) {
        countObj[obj.destination]++;
      } else {
        countObj[obj.destination] = 1;
        filterSet.add(obj.destination);
      }
    }
    list = list.sort((a, b) => {
      return (countObj[b.destination] - countObj[a.destination]);
    });
    let filteredList = [];
    list.forEach((event) => {
      if (event.value.readUInt8() === 0 || event.value.readUInt8() === 1) {
        filteredList.push(event);
      }
    });
    filteredList = filteredList.filter((event, pos, arr) => {
      return arr.map((mapObj) => mapObj['destination'])
        .indexOf(event['destination']) === pos;
    });
    return filteredList;
  }

}

module.exports = KNXInterface;
