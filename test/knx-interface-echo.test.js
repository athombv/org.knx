'use strict';

const assert = require('assert');
const PromiseQueue = require('promise-queue');
const KNXInterface = require('../lib/KNXInterface');
const { fromDpt1 } = require('../lib/HeatingCoolingMode');

// Builds an interface without the constructor, so no knx connection or socket is created.
function createInterface() {
  const knxInterface = Object.create(KNXInterface.prototype);
  knxInterface.isConnected = true;
  knxInterface.isTimedOut = false;
  knxInterface.knxDisconnectCount = 0;
  knxInterface.knxCommunicationQueue = new PromiseQueue(2, 100);
  knxInterface.onKNXEventCallbacks = {};
  knxInterface.log = () => {};
  knxInterface.busWrites = [];
  knxInterface.knxConnection = {
    write(groupaddress, value, datapoint, callback) {
      knxInterface.busWrites.push([groupaddress, value, datapoint]);
      callback();
    },
  };
  return knxInterface;
}

async function run() {
  // Own write is echoed to every listener on the address, once, with the inbound Buffer shape.
  const knxInterface = createInterface();
  const received = [];
  knxInterface.addKNXEventListener('17/2/0', (ga, data) => received.push(['a', ga, data]));
  knxInterface.addKNXEventListener('17/2/0', (ga, data) => received.push(['b', ga, data]));
  await knxInterface.writeKNXGroupAddress('17/2/0', true, 'DPT1');
  assert.strictEqual(received.length, 2);
  assert.deepStrictEqual(received[0], ['a', '17/2/0', Buffer.from([0x01])]);
  assert.strictEqual(fromDpt1(received[1][2]), 'heat');
  await knxInterface.writeKNXGroupAddress('17/2/0', false, 'DPT1');
  assert.strictEqual(fromDpt1(received[3][2]), 'cool');
  assert.strictEqual(knxInterface.busWrites.length, 2);

  // No listeners: nothing dispatched, write still succeeds.
  const quiet = createInterface();
  await quiet.writeKNXGroupAddress('1/1/1', 1, 'DPT1');
  assert.strictEqual(quiet.busWrites.length, 1);

  // A failing listener never fails the write.
  const failing = createInterface();
  failing.addKNXEventListener('1/1/2', () => {
    throw new Error('listener boom');
  });
  await failing.writeKNXGroupAddress('1/1/2', 1, 'DPT1');
  assert.strictEqual(failing.busWrites.length, 1);

  // A failing bus write is not echoed.
  const broken = createInterface();
  let echoed = false;
  broken.addKNXEventListener('1/1/3', () => {
    echoed = true;
  });
  broken.knxConnection.write = (ga, value, dpt, callback) => callback(new Error('bus down'));
  let rejected = false;
  await broken.writeKNXGroupAddress('1/1/3', 1, 'DPT1').catch(() => {
    rejected = true;
  });
  assert.strictEqual(rejected, true);
  assert.strictEqual(echoed, false);

  console.log('knx-interface-echo: all tests passed'); // eslint-disable-line no-console
}

run().catch((error) => {
  console.error(error); // eslint-disable-line no-console
  process.exitCode = 1;
});
