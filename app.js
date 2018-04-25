'use strict';

const Homey = require('homey');
const KNXInterfaceManager = require('./lib/KNXInterfaceManager')

class KNXApp extends Homey.App {
	
	onInit() {
		this.log('KNXApp is running...');
		this.knxInterfaceManager = new KNXInterfaceManager();
		this.knxInterfaceManager.on('interface_found', (knxInterface) => {
			this.emit('interface_found', knxInterface);
			this.emit('interface_found:' + knxInterface.macAddress, knxInterface);
		});
	}

	returnKNXInterface(macAddress) {
		return this.knxInterfaceManager.getKNXInterface(macAddress);
	}

	returnKNXInterfacesList() {
		return this.knxInterfaceManager.getKNXInterfaceList();
	}

	discoverKNXInterfaceOnIP(ipAddress) {
		return this.knxInterfaceManager.discoverKNXInterfaceOnIP(ipAddress);
	}

	connectInterface(macAddress) {
		this.knxInterfaceManager.connectInterface(macAddress);
	}

	searchInterfaces() {
		this.knxInterfaceManager.searchInterfaces();
	}
}

module.exports = KNXApp;