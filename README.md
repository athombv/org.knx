# KNX

Add your KNX devices to Homey. This app requires a KNX IP Router or Interface connected to the same Wi-Fi network as Homey.

## Supported KNX devices

### Switch 
For example a wall-mounted switch that can be toggled.

### Light
For example lights that are connected to a binary outputactor. This type can only be toggled on and off.

### Dimmer device
For example a light that can be dimmed (0% - 100%).
This device can only control dimmers that are setup for direct control (0-100%, KNX datapoint 5).
Dimmers that are using dimcontrol with fixed steps are not (yet) supported.
Please contact your KNX installer to change your dimactor to support direct control.

### RGB Light
A light or LED Strip that can change color (Red/Green/Blue).

### Thermostat
KNX Thermosat. Can set the setpoint temperature and get the measured temperature.

### Windowcoverings
Windowcoverings like sunblinds or curtains.

### Temperature sensor
A temperature measurement device.

## Set-up

To set-up your KNX network in Homey, this app provides three options.

### Learn mode

For switch devices, Homey listens for a press on a button and copies the KNX Group Address (e.g. 0/1/2).

### ETS Import

If there is an ETS (.knxproj-file) export available, it can be uploaded to Homey to make it easier to assign KNX Group Addresses to a Homey device. Most likely your installer can provide this file for you.

### Manual entry

It is possible to manually enter KNX Group Addresses during set-up (e.g. 0/1/2). These values can usually be found in a 'group address export' (.esf-file). Most likely your installer can provide this file for you.

## Support

KNX Networks might be complicated to set-up. Please contact your local KNX Installer if you require any assistance.