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

	// Return a KNX IP interface instance by given macaddress
	getKNXInterface(macAddress) {
		return this.KNXInterfaces[macAddress];
	}

	getKNXInterfaceList() {
		return this.KNXInterfaces;
	}

	discoverKNXInterfaceOnIP(ipAddress){
		if(!ip.isV4Format(ipAddress)) {
			return Promise.reject(new Error('Invalid IP v4 Address'));
		}
		return this.findKNXInterfaces(ipAddress);
	}

	//Parse the received searchresponse for valied KNX IP data
	parseSearchResponse(inBuffer) {
		if (inBuffer[0] === 0x06 && inBuffer[1] === 0x10 && inBuffer.readUInt16BE(2) === 0x202) {
			const interfaceIpRaw = inBuffer.readUInt32LE(8);
			const interfaceIp = (interfaceIpRaw & 0xff).toString() + '.' + ((interfaceIpRaw >> 8) & 0xff).toString() + '.' + 
				((interfaceIpRaw >> 16) & 0xff).toString() + '.' + ((interfaceIpRaw >> 24) & 0xff).toString();
			const knxAddressRaw = inBuffer.readUInt16BE(18);
			const knxAddress = ((knxAddressRaw & 0xf000) >> 12).toString() + '.' + ((knxAddressRaw & 0x0f00) >> 8).toString() +
				'.' + (knxAddressRaw & 0xff).toString();
			const interfaceMac = inBuffer.toString('hex', 32, 37); // Grab the macaddress bytes
			const interfaceName = inBuffer.toString('utf-8', 38, 68).replace(/\0[\s\S]*$/g,''); // Read the fixed 30 bytes device description
			//console.log('Found '+ interfaceName + ' interface @ IP: ' + interfaceIp + ' with KNX address: ' + knxAddress);
			return {interfaceName, interfaceIp, interfaceMac, knxAddress};
		} else {
			this.log('Response received, but not a valid KNX search response');
			return null;
		}
		
	}

	// Creates a UDP socket, then sends a KNX search request to the default KNX multicast IP.
	findKNXInterfaces() {
		this.log('Scanning for KNX interfaces in subnet');
		const knxIPPort = 3671; //Default KNX IP port, rarely changed
		const knxMultiCastAddress = '224.0.23.12'; // Default KNX multicast address}
		const knxSearchRequest = Buffer.from([0x06, 0x10, 0x2, 0x1, 0x00, 0x0e, 0x08, 0x01]) //Fixed KNX search bytes
		const udp_dgram = dgram.createSocket('udp4'); //Create the socket connection

		const buffer_byte_ip = ip.toBuffer(ip.address()); //Grab the local IP address (requires the npm ip module)
		const buffer_byte_port = Buffer.from([0x8F, 0x66]); // 0x8F 0x66 for 36710

		return new Promise((resolve, reject) => {
			udp_dgram
				.on('error', (err) => {
					console.error('udp server error:');
					console.error(err.stack);
					udp_dgram.close();
					reject(err);
				})
				.on('message', (msg, rinfo) => {
					const knxInterface = this.parseSearchResponse(msg);
					if(!knxInterface) {
						return reject(new Error('No valid KNXnet response'));
					}
					this.KNXInterfaces[knxInterface.interfaceMac] = new KNXInterface(knxInterface); // Use the Interface MAC as the key value
					this.emit('interface_found', this.KNXInterfaces[knxInterface.interfaceMac]);
					resolve(this.KNXInterfaces[knxInterface.interfaceMac]);
				})
				.on('listening', () => {
					const address = udp_dgram.address();
				})
				.bind(36710);
			
			udp_dgram.send([knxSearchRequest, buffer_byte_ip, buffer_byte_port], knxIPPort, knxMultiCastAddress, function(err, bytes) {
				if (err) throw err;
				//console.log('UDP message sent to ' + knxMultiCastAddress + ':' + knxIPPort);
			});
		});
	}
}

module.exports = KNXInterfaceManager;