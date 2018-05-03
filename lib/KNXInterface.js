'use strict';

const Homey = require('homey');

const {EventEmitter} = require('events');
const knx = require('knx');
const PromiseQueue = require('promise-queue');
const util = require('util');

const _ = require('lodash');

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
		this.defaultReconnectionTime = (20*1000) // default timeout for when the connection drops
		this.connIDReconnectionTime = (60*1000) // timeout for when the error is related to the ID of the tunnel
		this.knxCommunicationQueue = new PromiseQueue(2, 100);

		// Learnmode variables
		this.learnMode = false;
		this.knxEventCaptures = [];

		// Setup logging and binding for fucntions
		this.log = Homey.app.log.bind(this, ('[Interface: ' + this.name + ']'));
		this.reconnectKNX = this._connectKNX.bind(this); // binding the reconnect function to the correct context

		// Object arrays with callbacks
		this.onKNXConnectionCallbacks = [];
		this.onKNXEventCallbacks = {};

		// The KNX tunnel connection itself through the knx library
		this.knxConnection = new knx.Connection( {
			ipAddr: this.ipAddress,
			ipPort: 3671,
			physAddr: this.knxAddress,
			manualConnect: true,
			//debug: true,
			//forceTunneling: true,
			minimumDelay: 10, // This sets the timeout between messages
			handlers: {
				connected: () => {
					this.log('Connected');
					this.isConnected = true;
					this.onKNXConnectionCallbacks.forEach((callback) => callback());
				},
				event: this.onKNXEventListener.bind(this),
				error: (connstatus) => {
					this.log('Error:', connstatus, 'disconnecting');
					this.knxConnection.Disconnect();
					this.isConnected = false;
					if (connstatus == "E_CONNECTION_ID") {
						// error met connection id heeft meer tijd nodig dan een drop
						this.log('Waiting', this.connIDReconnectionTime, 'ms to reconnect, conn_id error');
						setTimeout(this.reconnectKNX, this.connIDReconnectionTime);
					} else {
						this.log('Waiting', this.defaultReconnectionTime, 'ms to reconnect');
						setTimeout(this.reconnectKNX, this.defaultReconnectionTime);
					}
				}
			}
		});
	}

	//////////// KNX IP Interface and connection stuff ////////////

	_connectKNX() {
		console.log(this.isConnected);
		if (this.isConnected !== true) {
			this.log('Trying to (re)connect');
			this.knxConnection.Connect();
		} else {
			this.log('Already connected');
		}
	}

	onKNXConnectionListener(callback) {
        if (this.isConnected) {
			callback();
		}
		this.onKNXConnectionCallbacks.push(callback); //list with KNX callback to call when the connection is open or reopenend
		//console.log('KNXConnection callback list updated');
	}
	
	removeKNXConnectionListener(callback) {
		this.onKNXConnectionCallbacks = this.onKNXConnectionCallbacks.filter((cb) => cb !== callback);
		//console.log('KNXConnection callback list updated');
	}

	// KNX busevent listener, triggered when an KNX event onccurs
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

	onKNXEventListener(event, source, destination, value) {
		this.emit('knx_event', event, destination, value);
		if(this.onKNXEventCallbacks[destination]) {
			this.onKNXEventCallbacks[destination].forEach((callback) => callback(destination, value));
		}
		if (this.learnMode) {
			this.log('Pushing event to learnMode store');
			this.knxEventCaptures.push({event, destination, source, value});
		}
	}

	//////////// KNX Group Address Stuff ////////////
	
	// Write a groupadress with the given value and datapoint type
	async writeKNXGroupAddress(groupaddress, value, datapoint) {
		// Check if the groupadress is not empty
		if(groupaddress) {
			console.log('valid ga received');
			return this.knxCommunicationQueue.add(async () => {
				if (this.isConnected === true) {
					// Create a promsife function from the non-promise function from the knx lib, then call it.
					let writeAsync = util.promisify(this.knxConnection.write.bind(this.knxConnection));
					return writeAsync(groupaddress, value, datapoint)
				}
				throw new Error('knx_no_connection');
			});
		} else {
			this.log("Wrong GA supplied");
			return Promise.reject(new Error('knx_wrong_groupaddress'));
		}
	}

	// Function to read the value fo the given groupadress
	async readKNXGroupAddress(groupaddress) {
		if(groupaddress){
			// Check if the groupadress is not empty
			return this.knxCommunicationQueue.add(async () => {
				if (this.isConnected === true) {
					return new Promise((resolve, reject) => {
						this.knxConnection.read(groupaddress, (src, data) => resolve(data));
						setTimeout(() => reject(new Error ('knx_read_timeout')), time);
					})
				}
				throw new Error('knx_no_connection');
			});
		} else {
			this.log("Wrong GA supplied");
			return Promise.reject(new Error('knx_wrong_groupaddress'));
		}
	}

	async learnModeSwitch(time) {
		this.knxEventCaptures = [];
		if(this.learnMode === true) throw new Error('already_learmode');
		this.learnMode = true; //start the learnmode
		
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				this.learnMode = false;
				console.log('stopped learnmode');
				let result = this.filterKNXEvents(this.knxEventCaptures);
				resolve(result);
			}, time); // Stop the learnmode after the timeout
		});
	}

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