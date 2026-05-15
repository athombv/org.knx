'use strict';

const KNXGenericDevice = require('../../lib/GenericKNXDevice');
const DatapointTypeParser = require('../../lib/DatapointTypeParser');

// Maps each optional GA setting key to the Homey capability it controls.
// All values are DPT 1.x boolean (bitFormat).
const OPTIONAL_GA_MAP = [
    { gaKey: 'ga_alarm', capability: 'alarm_fire' },
    { gaKey: 'ga_heat_alarm', capability: 'alarm_heat' },
    { gaKey: 'ga_signal', capability: 'knx_alarm_signal' },
    { gaKey: 'ga_failure_battery', capability: 'alarm_battery' },
    { gaKey: 'ga_failure_temperature', capability: 'knx_failure_temperature' },
    { gaKey: 'ga_failure_smoke', capability: 'knx_failure_smoke' },
    { gaKey: 'ga_failure_230v', capability: 'knx_failure_230v' }
];

function isConfiguredGA(value) {
    return typeof value === 'string' && value !== '';
}

module.exports = class KNXSmokeSensor extends KNXGenericDevice {
    async onInit() {
        // Dynamically add or remove optional capabilities based on current settings.
        // This runs every time the device initialises, ensuring the capability list
        // matches whatever GAs the user has configured.
        for (const { gaKey, capability } of OPTIONAL_GA_MAP) {
            if (isConfiguredGA(this.getSetting(gaKey))) {
                await this.addCapabilityIfNotExists(capability);
            } else {
                await this.removeCapabilityIfExists(capability);
            }
        }

        if (isConfiguredGA(this.getSetting('ga_temperature'))) {
            await this.addCapabilityIfNotExists('measure_temperature');
        } else {
            await this.removeCapabilityIfExists('measure_temperature');
        }

        if (isConfiguredGA(this.getSetting('ga_acknowledge_fault'))) {
            await this.addCapabilityIfNotExists('knx_acknowledge_fault');
        } else {
            await this.removeCapabilityIfExists('knx_acknowledge_fault');
        }

        super.onInit();

        if (isConfiguredGA(this.getSetting('ga_acknowledge_fault'))) {
            this.registerCapabilityListener('knx_acknowledge_fault', async () => {
                const ga = this.getSetting('ga_acknowledge_fault');
                if (isConfiguredGA(ga) && this.knxInterface) {
                    await this.knxInterface.writeKNXGroupAddress(ga, true, 'DPT1')
                        .catch((err) => this.error('Acknowledge fault write error', err));
                }
            });
        }

        if (isConfiguredGA(this.getSetting('ga_signal'))) {
            this.registerCapabilityListener('knx_alarm_signal', async (value) => {
                const ga = this.getSetting('ga_signal');
                if (isConfiguredGA(ga) && this.knxInterface) {
                    await this.knxInterface.writeKNXGroupAddress(ga, value, 'DPT1')
                        .catch((err) => this.error('Signal write error', err));
                }
            });
        }
    }

    // Override: only register listeners for GAs that are actually configured.
    addKNXEventListeners(settings) {
        if (isConfiguredGA(settings.ga_sensor)) {
            this.knxInterface.addKNXEventListener(
                settings.ga_sensor,
                this.KNXEventHandler
            );
        }
        for (const { gaKey } of OPTIONAL_GA_MAP) {
            if (isConfiguredGA(settings[gaKey])) {
                this.knxInterface.addKNXEventListener(
                    settings[gaKey],
                    this.KNXEventHandler
                );
            }
        }
        if (isConfiguredGA(settings.ga_temperature)) {
            this.knxInterface.addKNXEventListener(
                settings.ga_temperature,
                this.KNXEventHandler
            );
        }
    }

    // Override: mirror of addKNXEventListeners.
    removeKNXEventListeners(settings) {
        if (isConfiguredGA(settings.ga_sensor)) {
            this.knxInterface.removeKNXEventListener(
                settings.ga_sensor,
                this.KNXEventHandler
            );
        }
        for (const { gaKey } of OPTIONAL_GA_MAP) {
            if (isConfiguredGA(settings[gaKey])) {
                this.knxInterface.removeKNXEventListener(
                    settings[gaKey],
                    this.KNXEventHandler
                );
            }
        }
        if (isConfiguredGA(settings.ga_temperature)) {
            this.knxInterface.removeKNXEventListener(
                settings.ga_temperature,
                this.KNXEventHandler
            );
        }
    }

    onKNXEvent(groupaddress, data) {
        super.onKNXEvent(groupaddress, data);

        // Required: smoke alarm (ga_sensor).
        if (groupaddress === this.settings.ga_sensor) {
            this.setCapabilityValue(
                'alarm_smoke',
                DatapointTypeParser.bitFormat(data)
            ).catch((err) => this.error('Set alarm_smoke error', err));
            return;
        }

        // Optional channels: match the incoming GA against each configured optional GA.
        for (const { gaKey, capability } of OPTIONAL_GA_MAP) {
            const ga = this.settings[gaKey];
            if (isConfiguredGA(ga) && groupaddress === ga) {
                this.setCapabilityValue(
                    capability,
                    DatapointTypeParser.bitFormat(data)
                ).catch((err) => this.error(`Set ${capability} error`, err));
                return;
            }
        }

        // Temperature address (DPT 9.x).
        if (isConfiguredGA(this.settings.ga_temperature) && groupaddress === this.settings.ga_temperature) {
            this.setCapabilityValue(
                'measure_temperature',
                DatapointTypeParser.dpt9(data)
            ).catch((err) => this.error('Set measure_temperature error', err));
        }
    }

    onKNXConnection(connectionStatus) {
        super.onKNXConnection(connectionStatus);

        if (connectionStatus !== 'connected') return;

        // Read current state from the bus for every configured GA so Homey is
        // immediately up-to-date without waiting for the next telegram.
        if (isConfiguredGA(this.settings.ga_sensor)) {
            this.knxInterface
                .readKNXGroupAddress(this.settings.ga_sensor)
                .catch((err) => this.error(err));
        }
        for (const { gaKey } of OPTIONAL_GA_MAP) {
            const ga = this.settings[gaKey];
            if (isConfiguredGA(ga)) {
                this.knxInterface
                    .readKNXGroupAddress(ga)
                    .catch((err) => this.error(err));
            }
        }
    }

    // Called when the user changes device settings post-pairing.
    // Dynamically adds/removes capabilities and re-registers KNX listeners via super.
    async onSettings({ oldSettings, newSettings, changedKeys }) {
        for (const { gaKey, capability } of OPTIONAL_GA_MAP) {
            if (changedKeys.includes(gaKey)) {
                if (isConfiguredGA(newSettings[gaKey])) {
                    await this.addCapabilityIfNotExists(capability);
                } else {
                    await this.removeCapabilityIfExists(capability);
                }
            }
        }

        if (changedKeys.includes('ga_temperature')) {
            if (isConfiguredGA(newSettings.ga_temperature)) {
                await this.addCapabilityIfNotExists('measure_temperature');
            } else {
                await this.removeCapabilityIfExists('measure_temperature');
            }
        }

        if (changedKeys.includes('ga_acknowledge_fault')) {
            if (isConfiguredGA(newSettings.ga_acknowledge_fault)) {
                await this.addCapabilityIfNotExists('knx_acknowledge_fault');
            } else {
                await this.removeCapabilityIfExists('knx_acknowledge_fault');
            }
        }

        if (changedKeys.includes('ga_signal')) {
            if (isConfiguredGA(newSettings.ga_signal)) {
                await this.addCapabilityIfNotExists('knx_alarm_signal');
                this.registerCapabilityListener('knx_alarm_signal', async (value) => {
                    const ga = this.getSetting('ga_signal');
                    if (isConfiguredGA(ga) && this.knxInterface) {
                        await this.knxInterface.writeKNXGroupAddress(ga, value, 'DPT1')
                            .catch((err) => this.error('Signal write error', err));
                    }
                });
            }
        }

        // super handles listener removal/re-registration via removeKNXEventListeners /
        // addKNXEventListeners with the new settings.
        await super.onSettings({ oldSettings, newSettings, changedKeys });
    }
};
