'use strict';

const Homey = require('homey');
const KNXInterfaceManager = require('./lib/KNXInterfaceManager')

class KNXApp extends Homey.App {
	
	onInit() {
		this.log('KNXApp is running...');

		Homey.ManagerCloud.getLocalAddress()
		.then((address) => {
			const homeyIP = address.split(':', 1).toString();
			this.knxInterfaceManager = new KNXInterfaceManager(homeyIP);
			this.knxInterfaceManager.on('interface_found', (knxInterface) => {
				this.emit('interface_found', knxInterface);
				this.emit('interface_found' + knxInterface.macAddress, knxInterface);
			});
			this.knxInterfaceManager.on('no_interfaces', () => {
				this.emit('no_interfaces');
			});
		})
	}

	// Ask the interfacemanager if there's a known IP interface with the corresponding MAC address.
	returnKNXInterface(macAddress) {
		return this.knxInterfaceManager.getKNXInterface(macAddress);
	}

	// Returns the complete interfacelist from the interfacemanager.
	returnKNXInterfacesList() {
		return this.knxInterfaceManager.getKNXInterfaceList();
	}

	// Verify through the interfacemanager if the given IP address corresponds to an KNX IP interface.
	discoverKNXInterfaceOnIP(ipAddress) {
		return this.knxInterfaceManager.discoverKNXInterfaceOnIP(ipAddress);
	}

	// Let the interfacemanager search the ethernet network for KNX IP interfaces through multicast.
	searchInterfaces() {
		return this.knxInterfaceManager.searchInterfaces();
	}

	// Let the interfacemanager open the connection for the IP interface with the corresponding MAC address.
	connectInterface(macAddress) {
		this.knxInterfaceManager.connectInterface(macAddress);
	}

	// Obtain the interface to use by MAC address, then start the learnmode on it.
	async startLearnmodeSwitch(macAddress, time) {
		let knxInterfaceToUse = this.knxInterfaceManager.getKNXInterface(macAddress);
		return knxInterfaceToUse.learnModeSwitch(time);
	}

	// Test a given groupaddress of the given interface. Currently only supports DPT1 (binary/toggle)
	// A third parameter should be added to handle the datapointtype so that all datapoints can be tested.
	testGroupAddress(macAddress, groupAddress, time) {
		let knxInterfaceToUse = this.knxInterfaceManager.getKNXInterface(macAddress);
		knxInterfaceToUse.writeKNXGroupAddress(groupAddress, 1, 'DPT1');
		setTimeout(() => {
			knxInterfaceToUse.writeKNXGroupAddress(groupAddress, 0, 'DPT1');
		}, time);
	}
}

module.exports = KNXApp;