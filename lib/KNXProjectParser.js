'use strict';

const Homey = require('homey');
const xml2js = require('xml2js');

class KNXProjectParser {
    parseKNXProjectFile(xmlFile) {
        var parser = new xml2js.Parser();
        FileSystem.readFile(__dirname + '/0.xml', function(err, data) {
            parser.parseString(data, function(err, result) {
                this.etsVersion = `${result.KNX.$.CreatedBy} ${result.KNX.$.ToolVersion}`;
                console.log(etsVersion);
                result.KNX.Project.forEach((installations) => {
                    installations.Installations.forEach((singleInstallation) => {
                        singleInstallation.Installation.forEach((installationProperty) => {
                            installationProperty.GroupAddresses.forEach((allGroupAddresses) => {
                                allGroupAddresses.GroupRanges.forEach((allGroupRanges) => {
                                    // check for 2 level or 3 level
                                    if(allGroupRanges.GroupAddress){
                                        allGroupRanges.GroupAddress.forEach((GroupAddress) => {
                                            address = GroupAddress.$.Address;
                                            console.log(`2level: ${address >> 11 & 0x1F}/${address & 0x7FF}`);
                                        });
                                    }
                                    if(allGroupRanges.GroupRange) {
                                        allGroupRanges.GroupRange.forEach((groupRange) => {
                                            groupRange.GroupRange.forEach((singleGroupRange) => {
                                                if (!singleGroupRange.GroupAddress) {
                                                    return;
                                                }
                                                singleGroupRange.GroupAddress.forEach((singleGroupAddress) => {
                                                    address =  singleGroupAddress.$.Address;
                                                    id = singleGroupAddress.$.Id;
                                                    ga = `${address >> 11 & 0x1F}/${address >> 8 & 0x7}/${address & 0xFF}`;
                                                    name = singleGroupAddress.$.Name;
                                                    knxGroupAdresses[id] = {ga, name};
                                                    if (singleGroupAddress.$.DatapointType) {
                                                        dpt = singleGroupAddress.$.DatapointType;
                                                        knxGroupAdresses[id].dpt = dpt;
                                                    }
                                                });
                                            });
                                        });
                                    }
                                });
                            });
                            // check topology addresses for send or receive
                            installationProperty.Topology.forEach((topology) => {
                                topology.Area.forEach((area) => {
                                    area.Line.forEach((line) => {
                                        if (line.DeviceInstance) {
                                            line.DeviceInstance.forEach((deviceInstance) => {
                                                if (deviceInstance.ComObjectInstanceRefs) {
                                                    deviceInstance.ComObjectInstanceRefs.forEach((comObjectRef) => {
                                                        comObjectRef.ComObjectInstanceRef.forEach((comObjectInstance) => {
                                                            if(comObjectInstance.Connectors){
                                                                if (comObjectInstance.$.DatapointType) {
                                                                    this.dpt = comObjectInstance.$.DatapointType;
                                                                }
                                                                comObjectInstance.Connectors.forEach((connector) => {
                                                                    if (connector.Send) {
                                                                        connector.Send.forEach((sendConnector) => {
                                                                            gaRefId = sendConnector.$.GroupAddressRefId;
                                                                            if (knxGroupAdresses[gaRefId]) {
                                                                                //console.log('Found matching GA ref');
                                                                                if (this.dpt) { knxGroupAdresses[gaRefId].dpt = dpt; }
                                                                                knxGroupAdresses[gaRefId].connector = 'send';
                                                                            }
                                                                        });
                                                                    }
                                                                    if (connector.Received) {
                                                                        connector.Received.forEach((receiveConnector) => {
                                                                            gaRefId = receiveConnector.$.GroupAddressRefId;
                                                                            if (knxGroupAdresses[gaRefId]) {
                                                                                //console.log('Found matching GA ref');
                                                                                if (dpt) {knxGroupAdresses[gaRefId].dpt = dpt; }
                                                                                knxGroupAdresses[gaRefId].connector = 'received';
                                                                            }
                                                                        });
                                                                    }
                                                                });
                                                            }
                                                        });
                                                    });
                                                }
                                            });
                                        }
                                    });
                                });
                            });
                        });
                    });
                });
            });
            for(ga in knxGroupAdresses) {
                if (knxGroupAdresses.hasOwnProperty(ga)) {
                    if (knxGroupAdresses[ga].dpt === 'DPST-1-1') {
                        //console.log(knxGroupAdresses[ga].name, 'is binary control with ga', knxGroupAdresses[ga].ga);
                    }
                }
            }
            console.log(knxGroupAdresses);
        });
    }
}