'use strict';

const Homey = require('homey');
const KNXInterface = require('./KNXInterface')

const {EventEmitter} = require('events');
const dgram = require('dgram');
const ip = require('ip');


// ipv4 regex // ^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$
class KNXInterfaceManager extends EventEmitter {
	constructor() {
		super();
		// Formatted logging
		this.log = Homey.app.log.bind(this, '[KNX interface manager]');
		// search running status
		this.searchRunning = false;

		this.KNXInterfaces = {};
		this.homeyIP;

		Homey.ManagerCloud.getLocalAddress()
			.then((address) => {
				
				if (address.split(':', 1).toString() === ip.address()) {
					this.homeyIP = ip.toBuffer(ip.address());
					this.findKNXInterfaces();
				}
			});

		// Respond on an emit. Add the found interface to the list of interfaces.
		this.on('interface_found', (knxInterface) => {
			//this.log('Current interfaces:', Object.values(this.KNXInterfaces).map((tempInterface) => {return tempInterface.name}));
		})
	}


	//////////// KNX IP Interfaces ////////////

	// This method returns a KNXinterface with matching MAC address.
	getKNXInterface(macAddress) {
		return this.KNXInterfaces[macAddress];
	}

	// Thins method returns the complete list with KNX Interfaces
	getKNXInterfaceList() {
		return this.KNXInterfaces;
	}

	// Check if a given IP is a KNX IP Interface
	discoverKNXInterfaceOnIP(ipAddress){
		// Check if the given address is a valid IPv4 address
		if(!ip.isV4Format(ipAddress)) { return Promise.reject('invalid_ip') }
		return this.checkKNXInterface(ipAddress);
	}

	// Let the defined KNX Interface open the tunnel connection to the KNX network
	connectInterface(macAddress){
		this.KNXInterfaces[macAddress]._connectKNX();
	}

	// Search for KNX interfaces (just a wrapper for Homey.app)
	searchInterfaces() {
		return this.findKNXInterfaces();
	}

	//Parse the received response for valid KNX IP data
	parseKNXResponse(inBuffer) {
		// Parse the first 2 bytes to check if it's KNXnet/IP traffic
		if (inBuffer[0] === 0x06 && inBuffer[1] === 0x10) {
			// Start checking the service types. Can be converted to switch case?
			// Search response
			if (inBuffer.readUInt16BE(2) === 0x202) {
				// Obtain and parse the IP address from the interface
				const interfaceIpRaw = inBuffer.readUInt32LE(8);
				const interfaceIp = (interfaceIpRaw & 0xff).toString() + '.' + ((interfaceIpRaw >> 8) & 0xff).toString() + '.' + 
					((interfaceIpRaw >> 16) & 0xff).toString() + '.' + ((interfaceIpRaw >> 24) & 0xff).toString();
				// Obtain and parse the KNX topology address from the interface
				const knxAddressRaw = inBuffer.readUInt16BE(18);
				const knxAddress = ((knxAddressRaw & 0xf000) >> 12).toString() + '.' + ((knxAddressRaw & 0x0f00) >> 8).toString() +
					'.' + (knxAddressRaw & 0xff).toString();
				const interfaceMac = inBuffer.toString('hex', 32, 38); // Grab the macaddress bytes
				const interfaceName = inBuffer.toString('utf-8', 38, 68).replace(/\0[\s\S]*$/g,''); // Read the fixed 30 bytes device description
				//this.log('Found', interfaceName, '@ IP:' + interfaceIp, 'with KNX address:', knxAddress);
				return {type: 0x202, interfaceName, interfaceIp, interfaceMac, knxAddress}; //Return an object with all found values
			}
			// Description response
			else if(inBuffer.readUInt16BE(2) === 0x204) {
				// Obtain and parse the KNX topology Address
				const knxAddressRaw = inBuffer.readUInt16BE(10);
				const knxAddress = ((knxAddressRaw & 0xf000) >> 12).toString() + '.' + ((knxAddressRaw & 0x0f00) >> 8).toString() +
					'.' + (knxAddressRaw & 0xff).toString();
				const interfaceMac = inBuffer.toString('hex', 24, 30); // Grab the macaddress bytes
				const interfaceName = inBuffer.toString('utf-8', 30, 60).replace(/\0[\s\S]*$/g,''); // Read the fixed 30 bytes device description
				//this.log('Found', interfaceName, ' with KNX address:', knxAddress);
				return {type: 0x204, interfaceName, interfaceMac, knxAddress}; //Return an object with all found values
			}
			// Connection response
			else if (inBuffer.readUInt16BE(2) === 0x206) {
				// Obtain the communictionchannel and the connection result
				const commChannel = inBuffer[6];//.readUInt16BE();
				const connectionResult = inBuffer[7];
				return {type: 0x206, commChannel, connectionResult};
			}
			// ConnectionState Response
			else if (inBuffer.readUInt16BE(2) === 0x208) {
				const commChannel = inBuffer[6];
				return {type: 0x208, commChannel};
			}
			// Disconnect response
			else if (inBuffer.readUInt16BE(2) === 0x209) {
				this.log('KNX connection disconnected');
				return {type: 0x0209};
			}
		} else {
			this.log('Response received, but not a valid KNX connection response');
			return null;
		}
	}

	// Creates a UDP socket, then sends a KNX search request to the default KNX multicast IP.
	findKNXInterfaces() {
		/* The correct flow to check if a given IP belongs to a KNX IP interface is:
		- Send an search request to the KNX multicast address.
		- Receive all search responses from the IP itnerfaces on the samen IP subnet.
		These actions mimics the traffic that ETS uses to search for IP interfaces
		*/
		if (this.searchRunning === false) {
			this.log('Scanning for KNX interfaces in subnet');
			this.searchRunning = true;

			const knxIPPort = 3671; //Default KNX IP port, rarely changed
			const knxMultiCastAddress = '224.0.23.12'; // Default KNX multicast address
			const bufferByteLocalIP = this.homeyIP; //Grab the local IP address
			const bufferByteSearchPort = Buffer.from([0x8F, 0x66]); // 0x8F 0x66 for 36710. the port is just the default KNX port with a 0 added.

			// Create the KNX search request datagram
			const knxSearchRequest = Buffer.concat([Buffer.from([0x06, 0x10, 0x2, 0x1, 0x00, 0x0e, 0x08, 0x01]), //Fixed KNX search bytes
													bufferByteLocalIP,
													bufferByteSearchPort]);
			const udpSocket = dgram.createSocket('udp4'); //Create the socket connection

			return new Promise((resolve, reject) => {
				udpSocket
					.on('error', (err) => {
						// If the udp server errors, close the connection
						console.error('udp server error:');
						console.error(err.stack);
						udpSocket.close();
						this.searchRunning = false;
						reject(err);
					})
					.on('message', (msg, rinfo) => {
						// When an message is received, parse it for KNXIP data
						const knxInterface = this.parseKNXResponse(msg);
						if(!knxInterface) {
							return reject(new Error('No valid KNXnet response'));
						}
						// If the data was valid, emit the found interface
						// here should be an extra catch to handle other not search/check related KNX messages
						this.KNXInterfaces[knxInterface.interfaceMac] = new KNXInterface(knxInterface); // Use the Interface MAC as the key value
						this.emit('interface_found', this.KNXInterfaces[knxInterface.interfaceMac]);
						resolve(this.KNXInterfaces[knxInterface.interfaceMac]);
					})
					.on('listening', () => {
						const address = udpSocket.address();
					})
					.bind(36710);
				
					// Send the first message to trigger the searchrequest
				udpSocket.send(knxSearchRequest, knxIPPort, knxMultiCastAddress, function(err, bytes) { if (err) throw err });

				setTimeout(() => {
					udpSocket.close();
					this.searchRunning = false;
					this.log('Closed search UDP socket');
					// Log all the found interfaces
					this.log('Current interfaces:', Object.values(this.KNXInterfaces).map((tempInterface) => { return tempInterface.name }));
					return resolve('timeout');
					}, 10*1000);
				});
		} else {
			return Promise.reject('search_already_running');
		}		
	}

	checkKNXInterface(ipAddress) {
		/* The correct flow to check if a given IP belongs to a KNX IP interface is:
		- Send an connection request. If this gets accepted it's certainly a KNX IP interface
		- Send the description request  to obtain the device information
		These actions mimics the traffic that ETS uses to check a IP interface
		*/
		this.interfaceFound = false;
		if (this.searchRunning === false) {
			this.log('Checking if given IP is a KNX IP interface');
			this.searchRunning = true;

			const knxIPPort = 3671; //Default KNX IP port, rarely changed
			const bufferByteLocalIP = this.homeyIP; //Grab the local IP address
			const bufferByteConnectionPort = Buffer.from([0x8F, 0x67]); // port 36711
			const bufferByteDevicePort = Buffer.from([0x8F, 0x68]); // port 36712
			
			const knxConnectRequest = Buffer.concat([Buffer.from([0x06, 0x10, 0x02, 0x05, 0x00, 0x1a, 0x08, 0x01]), // KNX header for connectrequest, 8 octets, IPV4
												bufferByteLocalIP, //IP for HPAI discovery
												bufferByteConnectionPort, //Port for HPAI discovery
												Buffer.from([0x08, 0x01]), // 8 octets, IPV4
												bufferByteLocalIP, //IP for HPAI data endpoint
												bufferByteDevicePort, //Port for HPAI data endpoint
												Buffer.from([0x04, 0x04, 0x02, 0x00])]); // 4octets, Tunnel connection, tunnel linklayer, 00 reserved
		
			const knxDeviceInfoRequest = Buffer.concat([Buffer.from([0x06, 0x10, 0x02, 0x03, 0x00, 0x0e, 0x08, 0x01]), // KNX header
													bufferByteLocalIP,
													bufferByteConnectionPort]);
			
			const udpSocket = dgram.createSocket('udp4'); //Create the socket connections
		
			return new Promise((resolve, reject) => {
				udpSocket
					.on('error', (err) => {
						// If the udp server errors, close the connection
						console.error('udp server error:');
						console.error(err.stack);
						udpSocket.close();
						this.searchRunning = false;
						reject(err)
					})
					.on('message', (msg, rinfo) => {
						const commResult = this.parseKNXResponse(msg);
						if(commResult && commResult.type === 0x206) {
							//console.log('Received connection response, now sending description request');
							udpSocket.send(knxDeviceInfoRequest, knxIPPort, ipAddress, function(err, bytes) { if (err) throw err });
						} else if (commResult && commResult.type === 0x209) {
							//console.log('Closing connection');
							udpSocket.close();
						} else if (commResult && commResult.type === 0x204) {
							//console.log('Received description response');
							const knxInterface = {
								interfaceName: commResult.interfaceName,
								interfaceIp: ipAddress,
								interfaceMac: commResult.interfaceMac,
								knxAddress: commResult.knxAddress
							}

							udpSocket.close();
							this.interfaceFound = true;
							this.searchRunning = false;
							
							this.KNXInterfaces[knxInterface.interfaceMac] = new KNXInterface(knxInterface); // Use the Interface MAC as the key value
							this.emit('interface_found', this.KNXInterfaces[knxInterface.interfaceMac]);
							resolve(this.KNXInterfaces[knxInterface.interfaceMac]);
						}
					})
					.on('listening', () => {
						const address = udpSocket.address();
					})
					.bind(36711);
					
				udpSocket.send(knxConnectRequest, knxIPPort, ipAddress, function(err, bytes) { if (err) throw err; });

				setTimeout(() => {
					if (!this.interfaceFound) {
						udpSocket.close();
						this.searchRunning = false;
						this.log('Closed search UDP socket');
						reject('interface_not_found');
					}
				}, 5*1000); // 5 second timeout
			});
		} else {
			return Promise.reject('search_already_running');
		}
	}
}

module.exports = KNXInterfaceManager;