'use strict';

const Homey = require('homey');
const KNXInterface = require('./KNXInterface')

const {EventEmitter} = require('events');
const dgram = require('dgram');
const ip = require('ip');

class KNXInterfaceManager extends EventEmitter {
	constructor() {
		super();
		this.log = Homey.app.log.bind(this, '[KNX interface manager]');

		this.KNXInterfaces = {};
		this.findKNXInterfaces();

		this.on('interface_found', (knxInterface) => {
			this.log('Current interfaces:', Object.values(this.KNXInterfaces).map((tempInterface) => {return tempInterface.name}));
		})
	}

	//////////// KNX IP Interfaces ////////////
	getKNXInterface(macAddress) {
		return this.KNXInterfaces[macAddress];
	}

	getKNXInterfaceList() {
		return this.KNXInterfaces;
	}

	discoverKNXInterfaceOnIP(ipAddress){
		if(!ip.isV4Format(ipAddress)) {
			return Promise.reject(new Error('Invalid IPv4 Address'));
		}
		return this.checkKNXInterface(ipAddress);
	}

	connectInterface(macAddress){
		this.KNXInterfaces[macAddress]._connectKNX();
	}

	searchInterfaces() {
		this.findKNXInterfaces();
		// should return a new list to the pairing wizard
	}

	//Parse the received response for valid KNX IP data
	parseKNXResponse(inBuffer) {
		if (inBuffer[0] === 0x06 && inBuffer[1] === 0x10) {
			// Search response
			if (inBuffer.readUInt16BE(2) === 0x202) {
				const interfaceIpRaw = inBuffer.readUInt32LE(8);
				const interfaceIp = (interfaceIpRaw & 0xff).toString() + '.' + ((interfaceIpRaw >> 8) & 0xff).toString() + '.' + 
					((interfaceIpRaw >> 16) & 0xff).toString() + '.' + ((interfaceIpRaw >> 24) & 0xff).toString();
				const knxAddressRaw = inBuffer.readUInt16BE(18);
				const knxAddress = ((knxAddressRaw & 0xf000) >> 12).toString() + '.' + ((knxAddressRaw & 0x0f00) >> 8).toString() +
					'.' + (knxAddressRaw & 0xff).toString();
				const interfaceMac = inBuffer.toString('hex', 32, 37); // Grab the macaddress bytes
				const interfaceName = inBuffer.toString('utf-8', 38, 68).replace(/\0[\s\S]*$/g,''); // Read the fixed 30 bytes device description
				this.log('Found', interfaceName, '@ IP:' + interfaceIp, 'with KNX address: ', knxAddress);
				return {type: 0x202, interfaceName, interfaceIp, interfaceMac, knxAddress};
			}
			// Description response
			else if(inBuffer.readUInt16BE(2) === 0x204) {
				const knxAddressRaw = inBuffer.readUInt16BE(10);
				const knxAddress = ((knxAddressRaw & 0xf000) >> 12).toString() + '.' + ((knxAddressRaw & 0x0f00) >> 8).toString() +
					'.' + (knxAddressRaw & 0xff).toString();
				const interfaceMac = inBuffer.toString('hex', 24, 29); // Grab the macaddress bytes
				const interfaceName = inBuffer.toString('utf-8', 30, 60).replace(/\0[\s\S]*$/g,''); // Read the fixed 30 bytes device description
				this.log('Found', interfaceName, ' with KNX address:', knxAddress);
				return {type: 0x204, interfaceName, interfaceMac, knxAddress};
			}
			// Connection response
			else if (inBuffer.readUInt16BE(2) === 0x206) {
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
		this.log('Scanning for KNX interfaces in subnet');
		const knxIPPort = 3671; //Default KNX IP port, rarely changed
		const knxMultiCastAddress = '224.0.23.12'; // Default KNX multicast address}
		const bufferByteLocalIP = ip.toBuffer(ip.address()); //Grab the local IP address (requires the npm ip module)
		const bufferByteSearchPort = Buffer.from([0x8F, 0x66]); // 0x8F 0x66 for 36710

		const knxSearchRequest = Buffer.concat([Buffer.from([0x06, 0x10, 0x2, 0x1, 0x00, 0x0e, 0x08, 0x01]), //Fixed KNX search bytes
												bufferByteLocalIP,
												bufferByteSearchPort]);
		const udpSocket = dgram.createSocket('udp4'); //Create the socket connection

		return new Promise((resolve, reject) => {
			udpSocket
				.on('error', (err) => {
					console.error('udp server error:');
					console.error(err.stack);
					udpSocket.close();
					reject(err);
				})
				.on('message', (msg, rinfo) => {
					const knxInterface = this.parseKNXResponse(msg);
					if(!knxInterface) {
						return reject(new Error('No valid KNXnet response'));
					}
					this.KNXInterfaces[knxInterface.interfaceMac] = new KNXInterface(knxInterface); // Use the Interface MAC as the key value
					this.emit('interface_found', this.KNXInterfaces[knxInterface.interfaceMac]);
					resolve(this.KNXInterfaces[knxInterface.interfaceMac]);
				})
				.on('listening', () => {
					const address = udpSocket.address();
				})
				.bind(36710);
			
			udpSocket.send(knxSearchRequest, knxIPPort, knxMultiCastAddress, function(err, bytes) {if (err) throw err;});
			setTimeout(() => {
				udpSocket.close();
				this.log('Closed search UDP socket');
				}, 10*1000);
			});
	}

	checkKNXInterface(ipAddress) {
		/* The correct workflow to check if a given IP belongs to a KNX IP interface is:
		- Send an connection request. If this gets accepted it's certainly a KNX IP interface
		- Send the description request  to obtain the device information
		These actions mimics the traffic that ETS uses to check a IP interface
		*/
		this.log('Checking if given IP is a KNX IP interface');
		const knxIPPort = 3671; //Default KNX IP port, rarely changed
		const bufferByteLocalIP = ip.toBuffer(ip.address()); //Grab the local IP address
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
					console.error('udp server error:');
					console.error(err.stack);
					udpSocket.close();
					reject(err)
				})
				.on('message', (msg, rinfo) => {
					const commResult = this.parseKNXResponse(msg);
					if(commResult && commResult.type === 0x206) {
						console.log('Received connection response, now sending description request');
						udpSocket.send(knxDeviceInfoRequest, knxIPPort, ipAddress, function(err, bytes) {
							if (err) throw err;
							console.log('Sending description request to', ipAddress);
						});
					} else if (commResult && commResult.type === 0x209) {
						console.log('Closing connection');
						udpSocket.close();
					} else if (commResult && commResult.type === 0x204) {
						console.log('Received description response');
						const knxInterface = {
							interfaceName: commResult.interfaceName,
							interfaceIp: ipAddress,
							interfaceMac: commResult.interfaceMac,
							knxAddress: commResult.knxAddress
						}
						this.KNXInterfaces[knxInterface.interfaceMac] = new KNXInterface(knxInterface); // Use the Interface MAC as the key value
						this.emit('interface_found', this.KNXInterfaces[knxInterface.interfaceMac]);
						udpSocket.close();
						resolve(this.KNXInterfaces[knxInterface.interfaceMac]);
					}
				})
				.on('listening', () => {
					const address = udpSocket.address();
				})
				.bind(36711);
				
			udpSocket.send(knxConnectRequest, knxIPPort, ipAddress, function(err, bytes) {
				if (err) throw err;
				console.log('Send connection request to', ipAddress);
			});
		});
	}
}

module.exports = KNXInterfaceManager;