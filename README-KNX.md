# KNX Documentation

## Introduction
KNX is a home automation standard and protocol mostly used in larger buildings such as offices or villa's.
It's primary physical connection is a 9600baud serial bus, but IP and RF connections are part of the standard.
The network parameters as well of the parameters of the devices in the network can be programmed with ETS, the official KNX engineering software.

## Devices
To couple physical devices on the network, KNX uses topology addresses to communicate with devices and functions. Topology addresses are bound to a single physical device, like an IP address in networking.
For example, a small demo network might look like this:

Topology example:
- USB interface 1.1.0
- KNX/IP interface 1.1.1
- Dimming actor 1.1.2
- Button actor 1.1.3

Usually the first digit is used to indicate the building or building segment, the second digit is for the KNX line (segment) and the third digit is the unique physical device.
The lowest assignable address is 1.1.0, the highest assignable address is 15.15.255.
Most (but not all!) KNX devices will fallback to 15.15.255 when they are not configured.
Further knowledge about topology addresses is not needed to combine KNX with Homey and will therefore be left out of this document.

## Functionality
Physical devices won't do anything until there are group addresses assingned to their functions.
Group addresses represent objects which contains functionality or information. Group addresses can be bound to functionality of a device or group of devices, but can also be provided by the network itself.

Group addresses example:
- 1/1/0 Lamp switching
- 2/1/0 Lamp dimming
- 8/1/0 Lamp switch status
- 8/2/0 Lamp dim status

To switch the light connected on actor 1.1.0 with a button on actor 1.1.1, the switching functionality for both actors has to be coupled to groupaddress 1/1/0 in ETS.
The same goes for the dimming functionality. Bind the dimming actor output and the longpress dimming input into group address 2/1/0 and the light will be dimmable through the button actor.

Usually group addresses are grouped by function or location. For example, all switching goes into 1/x/y, dimming into 2/a/b etc.
You can then divide the main groups into the location, eg. 1/1/y are the switching the living room, 1/2/z is switching for the hallway etc.

More information on how to bind functionality on group addresses can be found in this video: https://www.youtube.com/watch?v=2TGaroLM_HE 

## Datapoints
Just like types in programming languages there are different datapoints within the KNX standard to implement the data embedded in the KNX packets.
The datapoint types and their implementation are listed on: https://support.knx.org/hc/en-us/articles/115001133744

## Controlling devices with Homey
The KNX app for Homey uses the knx javascript library located over here: https://www.npmjs.com/package/knx
This library allows for a quick setup and handles all communication, group addresses, building KNX telegrams etc.
On top off the library functions are added for the following actions:
- Scan the LAN for KNX IP interfaces
- Manage found IP Interfaces
- Map/pair Homey device functionality to KNX groupaddreses
- Convert and store an KNX export into the app storage

To control devices with Homey, you"ll need and three pieces of information: The data you want to send, the datatype and the groupaddress to send the data to.
You can then write a telegram through the KNX libray, which will take care of creating and sending the telegram through the KNX network.

## Connection to KNX
In the test setup in our office, we have three different ways to connect to the KNX network:
- Hager USB interface
- Hager KNX/IP Router
- Weinzierl KNX/IP interface (this is our only supported interface)

Both KNX/IP units work in a similiar fashion, with the difference that the router supports multiple KNX networks, as well as IP multicast connections.
The interface only supports a tunnel connection to the KNX network, whichs means that only a single client can connect to it. Some IP interfaces like our Weinzierl supports more slots to enable concurrent tunnel connections.
Routers do not have this limitations as you can send the traffic to a IP multicast address (224.0.23.12) which will be then routed into the KNX network.

When programming physical KNX devices for the first time it's advised to use the USB interface. This ensures a reliable connection when uploading the application firmware.

## ETS
ETS (Engineering Tool Software) is the software that is provided by the KNX organization to setup and maintain a KNX installation. It's the only way to do so.
It's used to assign addresses to the physical devices, configure them and enable there functionality by attaching groupaddresses to their functions.
This software runs only under Windows. It's only obtainable with a KNX license, but you might have some luck over here: https://www.roelbroersma.nl/forums/topic/ets-5-7-4/. 
Whenever using an ETS version that is not obtained officialy from knx.org, make sure to never ever send a project back to a customer.
The original version checks for a fingerprint in the project file which disables opening files altered with non-original versions.
It's advised to run those ETS version inside a virtual machine and to create a snapshot before upgrading to a new version since it might crash/become corrupted.

## Maintenance
The KNX library is updated aprox. every two months. It's advised as it's still being improved. In the past, these updates never broke our implementation so they are considered 'safe'.

## Future improvements
- Instead of parsing the datapoints itself, use this library: https://github.com/Rafelder/knx-datapoints
- Implement traffic through multicast if a KNX router is detected. This can improve (network) stability and has the advantage of not having to select an IP interface on pairing.

## Useful information
Roel Broersma Gira Homeserver forum: https://www.roelbroersma.nl/forums/forum/gira-homeserver/
Joachim Goeminne KNX playlist: https://www.youtube.com/watch?v=GxZA1M6JeJ8&list=PLzpMAP5eF_wRp_sxg3pGPO_j-DoemkcsH&index=1
