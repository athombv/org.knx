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
  knxInterface.echoCallbacks = {};
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
  // A and C opted in to the local echo, B did not.
  const knxInterface = createInterface();
  const heard = [];
  const listenerA = (ga, data) => heard.push(['A', ga, data]);
  const listenerB = (ga, data) => heard.push(['B', ga, data]);
  const listenerC = (ga, data) => heard.push(['C', ga, data]);
  knxInterface.addKNXEventListener('17/2/0', listenerA, { echoLocalWrites: true });
  knxInterface.addKNXEventListener('17/2/0', listenerB);
  knxInterface.addKNXEventListener('17/2/0', listenerC, { echoLocalWrites: true });

  // An own write is echoed only to the listeners that opted in, with the inbound Buffer shape.
  await knxInterface.writeKNXGroupAddress('17/2/0', true, 'DPT1');
  assert.deepStrictEqual(heard.map((entry) => entry[0]), ['A', 'C']);
  assert.deepStrictEqual(heard[0], ['A', '17/2/0', Buffer.from([0x01])]);
  assert.strictEqual(fromDpt1(heard[1][2]), 'heat');
  heard.length = 0;
  await knxInterface.writeKNXGroupAddress('17/2/0', false, 'DPT1');
  assert.strictEqual(fromDpt1(heard[0][2]), 'cool');

  // An inbound telegram still reaches every listener.
  heard.length = 0;
  knxInterface.onKNXEventListener('GroupValue_Write', '1.1.1', '17/2/0', Buffer.from([0x01]));
  assert.deepStrictEqual(heard.map((entry) => entry[0]), ['A', 'B', 'C']);

  // Removing A clears it from both structures; a write then reaches only C.
  knxInterface.removeKNXEventListener('17/2/0', listenerA);
  heard.length = 0;
  await knxInterface.writeKNXGroupAddress('17/2/0', true, 'DPT1');
  assert.deepStrictEqual(heard.map((entry) => entry[0]), ['C']);
  heard.length = 0;
  knxInterface.onKNXEventListener('GroupValue_Write', '1.1.1', '17/2/0', Buffer.from([0x00]));
  assert.deepStrictEqual(heard.map((entry) => entry[0]), ['B', 'C']);

  // One bus write per write, the echo adds nothing.
  assert.strictEqual(knxInterface.busWrites.length, 3);

  // No opted-in listeners: nothing dispatched, write still succeeds.
  const quiet = createInterface();
  let quietHeard = false;
  quiet.addKNXEventListener('1/1/1', () => {
    quietHeard = true;
  });
  await quiet.writeKNXGroupAddress('1/1/1', 1, 'DPT1');
  assert.strictEqual(quietHeard, false);
  assert.strictEqual(quiet.busWrites.length, 1);

  // A throwing listener never fails the write, and the other listeners still hear the echo.
  const failing = createInterface();
  let otherHeard = false;
  failing.addKNXEventListener('1/1/2', () => {
    throw new Error('listener boom');
  }, { echoLocalWrites: true });
  failing.addKNXEventListener('1/1/2', () => {
    otherHeard = true;
  }, { echoLocalWrites: true });
  await failing.writeKNXGroupAddress('1/1/2', 1, 'DPT1');
  assert.strictEqual(otherHeard, true);
  assert.strictEqual(failing.busWrites.length, 1);

  // A failing bus write is not echoed.
  const broken = createInterface();
  let echoed = false;
  broken.addKNXEventListener('1/1/3', () => {
    echoed = true;
  }, { echoLocalWrites: true });
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
