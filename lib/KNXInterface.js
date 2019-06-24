'use strict';

const {EventEmitter} = require('events');
const knx = require('knx');
const PromiseQueue = require('promise-queue');
const util = require('util');

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

		this.defaultReconnectionTime = (20*1000) // default timeout for when the connection drops
		this.connIDReconnectionTime = (45*1000) // timeout for when the error is related to the ID of the tunnel
		this.knxCommunicationQueue = new PromiseQueue(2, 100);

		// Learnmode variables
		this.learnMode = false;
		this.knxEventCaptures = [];

		// Setup logging and binding for fucntions
		this.log = console.log.bind(this, ('[Interface: ' + this.name + ']'));
		this.reconnectKNX = this._connectKNX.bind(this); // binding the reconnect function to the correct context

		// Object arrays with callbacks
		this.onKNXConnectionCallbacks = [];
		this.onKNXEventCallbacks = {};

		this.log(`Creating interface with IP ${this.ipAddress}`);
		this.createConnection();
		this.monitorKNXConnection();		
	}

	// Function to create the KNX connection
	createConnection() {
		// The KNX tunnel connection itself through the knx library
		try {
			this.knxConnection = new knx.Connection( {
				ipAddr: this.ipAddress, // IP address obtained through interfacemanager
				ipPort: 3671, // Fixed and part of the KNXnet/IP protocol.
				physAddr: this.knxAddress, // KNX address obtained through interfacemanager
				forceTunneling: false, // We want true tunnel connections
				//debug: true,
				manualConnect: true, // The connection should be only opened if the users selects this interface.
				minimumDelay: 10, // This sets the timeout between messages in ms
				// Setup the handlers that the library will use to respond on emits from FSM.js
				handlers: {
					connected: () => {
						this.log('KNX Connected');
						// Change both connection booleans to their optimal state
						this.isConnected = true;
						this.isTimedOut = false;
	
						this.onKNXConnectionCallbacks.forEach((connCallback) => {
							try { connCallback('connected'); }
							catch (error) { this.log(error); }
						});
					},
					disconnected: () => {
						this.log('KNX Disconnected');
						this.isConnected = false;

						this.onKNXConnectionCallbacks.forEach(callback => {
							try { callback('disconnected') }
							catch(error) { this.log(error) }
						});
					},
					event: this.onKNXEventListener.bind(this),
					timeout: () => {
						this.isTimedOut = true;
						this.log('FSM timeout received');
					},
					error: (connstatus) => {
						this.log('Error from FSM:', connstatus);
						// TODO Determine if this code is still necessary. Since some updates the library handles reconnects on it's own.
	
						// if (connstatus == "E_CONNECTION_ID") {
						// 	// Connection ID drops needs a longer reconnection time.
						// 	this.log('Waiting', this.connIDReconnectionTime, 'ms to reconnect, conn_id error');
						// 	setTimeout(this.reconnectKNX, this.connIDReconnectionTime);
						// } else {
						// 	this.log('Waiting', this.defaultReconnectionTime, 'ms to reconnect');
						// 	setTimeout(this.reconnectKNX, this.defaultReconnectionTime);
						// }
					}
				}
			});
		} catch (error) {
			this.log('KNX lib error', error); // This should be able to catch the 'no valid ipv4 interfaces' error
		}
	}

	monitorKNXConnection() {
		setInterval(() => {
			if (this.knxDisconnectCount > 5) {
				this.knxConnection = null;
				setTimeout(() => {
					this.log('Re-creating KNX lib instance');
					this.createConnection();
				}, 2000); //recreate connection after 2 seconds
				this.knxDisconnectCount = 0;
			}
		}, 10*1000) // 10 seconds monitoring loop
	}

	//////////// KNX IP Interface and connection stuff ////////////

	// Function to (re)open the connection to the KNX network
	_connectKNX() {
		if (!this.knxConnection) return; // ensure to have a KNX connection instance.
		if (this.isConnected !== true) {
			this.log('Trying to (re)connect');
			this.knxConnection.Connect();
		} else {
			this.log('Already connected');
		}
	}

	// Function to update the IP address if a change is detected by the interfacemanager.
	updateIP(newIPaddress) {
		if (newIPaddress === this.ipAddress) { this.log('IP has not changed, maintaining current connection') }
		else {
			this.log('Creating new KNX tunnel connection');
			this.knxConnection.Disconnect();
			// Store the new IP on the this context, then create a new KNXconnection
			this.ipAddress = newIPaddress;
			this.createConnection();
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
		this.onKNXConnectionCallbacks.push(callback); //list with KNX callback to call when the connection is open or reopenend
		//console.log('KNXConnection callback list updated');
	}
	
	removeKNXConnectionListener(callback) {
		this.onKNXConnectionCallbacks = this.onKNXConnectionCallbacks.filter((cb) => cb !== callback);
		//console.log('KNXConnection callback list updated');
	}

	// KNX busevent listener, callbacks are added per groupaddress
	addKNXEventListener(groupaddress, callback){
		if (!this.onKNXEventCallbacks[groupaddress]) {
			this.onKNXEventCallbacks[groupaddress] = [callback];
		} else {
			this.onKNXEventCallbacks[groupaddress].push(callback);
		}
		//console.log('KNXEvent callback list updated');
	}

	removeKNXEventListener(groupaddress, callback) {
		if (this.onKNXEventCallbacks[groupaddress]) {
			this.onKNXEventCallbacks[groupaddress] = this.onKNXEventCallbacks[groupaddress].filter(cb => cb !== callback);
		}
		//console.log('KNXEvent callback list updated');
	}

	// KNX busevent listener, triggered when an KNX event occurs
	onKNXEventListener(event, source, destination, value) {
		// Emit the event, and if there is a callback for the destiniation addres call it.
		this.emit('knx_event', event, destination, value);
		//this.log('knx event', event, destination, value);
		if(this.onKNXEventCallbacks[destination] && (event === 'GroupValue_Write' || event === 'GroupValue_Read')) {
			this.onKNXEventCallbacks[destination].forEach(callback => callback(destination, value));
		}
		// If the learnmode is turned on, also store the event in de capture array.
		if (this.learnMode) {
			this.log('Pushing event to learnMode store');
			this.knxEventCaptures.push({event, destination, source, value});
		}
	}

	//////////// KNX Group Address Stuff ////////////
	
	// Write a groupadress with the given value and datapoint type
	async writeKNXGroupAddress(groupaddress, value, datapoint) {
		// Check if the groupadress is not empty
		if(groupaddress && groupaddress !== "") {
			if (this.isConnected === true && !this.isTimedOut) {
				// Only add the request in the queue when the connection is openend.
				this.log(`Writing ${value} to ${groupaddress}`);
				return this.knxCommunicationQueue.add(async () => {
					// Create a promisify function from the non-promise function from the knx lib, then call it.
					//console.log('Writing', value, 'with dpt', datapoint, 'to', groupaddress);
					let writeAsync = util.promisify(this.knxConnection.write.bind(this.knxConnection));
					return writeAsync(groupaddress, value, datapoint);
				});
			}
			++this.knxDisconnectCount;
			return Promise.reject('knx_no_connection');
		} else {
			return Promise.reject('knx_no_groupaddress');
		}
	}

	// Function to read the value fo the given groupadress
	async readKNXGroupAddress(groupaddress) {
		if(groupaddress && groupaddress !== ""){
			// Check if the groupadress is not empty
			if (this.isConnected === true && !this.isTimedOut) {
				return this.knxCommunicationQueue.add(async () => {
					// Only add the request in the queue when the connection is openend.
					return new Promise((resolve, reject) => {
						this.knxConnection.read(groupaddress, (src, data) => resolve(data));
						// Trigger a timeout, inherited from the library timeout (3s)
						setTimeout(() => reject(new Error('knx_read_timeout')), 3000);
					})
				});
			}
			++this.knxDisconnectCount;
			return Promise.reject('knx_no_connection');
		} else {
			return Promise.reject('knx_no_groupaddress');
		}
	}

	// Run the learnmode for the given time.
	async learnModeSwitch(time) {
		this.knxEventCaptures = [];
		if(this.learnMode === true) throw new Error('already_learmode');
		this.learnMode = true; //start the learnmode
		
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				this.learnMode = false;
				let result = this.filterKNXEvents(this.knxEventCaptures);
				resolve(result);
			}, time) // Stop the learnmode after the timeout
		});
	}

	/* Function to filter the captured events from the learnmode.
	Duplicate entries will be reduced to one entry, which will be counted.
	The list will then be sorted by event occurance if possible.
	*/
	filterKNXEvents(list) {
		let filterSet = new Set(), countObj = {};
		for (let obj of list) {
			if (filterSet.has(obj.destination)) {
				countObj[obj.destination]++;
			} else {
				countObj[obj.destination] = 1;
				filterSet.add(obj.destination);
			}
		}
		list = list.sort((a ,b) => {
			return (countObj[b.destination] - countObj[a.destination]);
		});
		let filteredList = [];
		list.forEach((event) => {
			if (event.value.readUInt8() === 0 || event.value.readUInt8() === 1) {
				filteredList.push(event);
			}
		});
		filteredList = filteredList.filter((event, pos, arr) => {
			return arr.map(mapObj => mapObj['destination']).indexOf(event['destination']) === pos;
		})
		return filteredList;
	}
}

module.exports = KNXInterface;