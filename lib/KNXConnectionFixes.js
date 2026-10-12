'use strict';

/*
 * Runtime fixes for the tunneling state machine of the `knx` library (v2.5.4, the latest
 * release on npm, unchanged since 2024). They are applied to each connection instance,
 * so no patched copy of node_modules is needed.
 */

const KnxConstants = require('knx/src/KnxConstants');

// KNXnet/IP spec: CONNECTIONSTATE_REQUEST_TIMEOUT = 10 s, up to 3 attempts.
const HEARTBEAT_TIMEOUT_MS = 10000;
const HEARTBEAT_ATTEMPTS = 3;

function sendRaw(fsm, buf) {
  try {
    fsm.socket.send(buf, 0, buf.length, fsm.remoteEndpoint.port, fsm.remoteEndpoint.addr.toString());
  } catch (error) {
    // socket may already be closed
  }
}

// Tell the interface we are leaving the current channel, then start a fresh connection.
// Without the DISCONNECT_REQUEST the interface keeps the old tunnel for up to 120 s; on
// interfaces with few tunnel slots the new connection is then rejected.
function releaseAndReconnect(fsm, reason) {
  fsm.log.warn(`KNX tunnel lost (${reason}), releasing channel ${fsm.channel_id} and reconnecting`);
  if (fsm.channel_id !== undefined && !Number.isNaN(Number(fsm.channel_id))) {
    try {
      fsm.send(fsm.prepareDatagram(KnxConstants.SERVICE_TYPE.DISCONNECT_REQUEST));
    } catch (error) {
      // best effort
    }
  }
  fsm.transition('connecting');
  fsm.emit('error', reason);
}

// Acknowledge and deliver an incoming L_Data.ind without leaving the current state.
function handleIndicationInPlace(fsm, datagram) {
  fsm.seqnumRecv = datagram.tunnstate.seqnum;
  fsm.acknowledge(datagram);
  fsm.emitEvent(datagram);
}

function applyKNXConnectionFixes(fsm) {
  if (!fsm || !fsm.states || fsm.homeyFixesApplied) return fsm;
  // eslint-disable-next-line no-param-reassign
  fsm.homeyFixesApplied = true;
  const { states } = fsm;

  // Clear the idle timer and the heartbeat counter whenever a (re)connect starts. The
  // 60 s idle timer was never cleared, so it could fire in the middle of a new handshake.
  const originalConnectingEnter = states.connecting._onEnter;
  states.connecting._onEnter = function onEnterConnecting(...args) {
    clearTimeout(this.idletimer);
    this.idletimer = null;
    this.connStateAttempts = 0;
    return originalConnectingEnter.apply(this, args);
  };

  // Answer a DISCONNECT_REQUEST from the interface (the library did not send a
  // DISCONNECT_RESPONSE) before reconnecting.
  states.idle.inbound_DISCONNECT_REQUEST = function onDisconnectRequest(datagram) {
    if (!this.useTunneling) return;
    const channel = datagram && datagram.connstate ? datagram.connstate.channel_id : this.channel_id;
    sendRaw(this, Buffer.from([0x06, 0x10, 0x02, 0x0a, 0x00, 0x08, channel & 0xff, 0x00]));
    this.log.warn('KNX interface closed the tunnel, reconnecting');
    this.transition('connecting');
    this.emit('error', 'KNX interface closed the tunnel');
  };

  // Heartbeat. The library waited only 1 s for the CONNECTIONSTATE_RESPONSE and gave up
  // after one attempt, so a single late or lost UDP packet tore down a healthy tunnel.
  // Incoming telegrams that arrive while waiting are now acknowledged and delivered
  // right away instead of being deferred.
  states.requestingConnState = {
    _onEnter() {
      this.connStateAttempts = (this.connStateAttempts || 0) + 1;
      this.send(this.prepareDatagram(KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST));
      this.connstatetimer = setTimeout(() => {
        if (this.connStateAttempts < HEARTBEAT_ATTEMPTS) {
          this.log.debug(`No heartbeat response (attempt ${this.connStateAttempts}), retrying`);
          this.transition('requestingConnStateRetry');
        } else {
          this.connStateAttempts = 0;
          releaseAndReconnect(this, 'timed out waiting for CONNECTIONSTATE_RESPONSE');
        }
      }, HEARTBEAT_TIMEOUT_MS);
    },
    _onExit() {
      clearTimeout(this.connstatetimer);
    },
    inbound_CONNECTIONSTATE_RESPONSE(datagram) {
      this.connStateAttempts = 0;
      if (datagram.connstate.status === 0) {
        this.transition('idle');
      } else {
        const state = KnxConstants.keyText('RESPONSECODE', datagram.connstate.status);
        // The interface no longer knows this channel, so there is nothing to release.
        delete this.channel_id;
        this.log.warn(`KNX heartbeat rejected (${state}), reconnecting`);
        this.transition('connecting');
        this.emit('error', state);
      }
    },
    'inbound_TUNNELING_REQUEST_L_Data.ind': function onIndication(datagram) {
      if (this.useTunneling) handleIndicationInPlace(this, datagram);
    },
    'inbound_TUNNELING_REQUEST_L_Data.con': function onConfirmation(datagram) {
      if (this.useTunneling) this.acknowledge(datagram);
    },
    inbound_DISCONNECT_REQUEST(datagram) {
      states.idle.inbound_DISCONNECT_REQUEST.call(this, datagram);
    },
    '*': function deferOther() {
      this.deferUntilTransition('idle');
    },
  };

  // Intermediate state so a retry re-enters requestingConnState (machina ignores a
  // transition to the current state).
  states.requestingConnStateRetry = {
    _onEnter() {
      this.transition('requestingConnState');
    },
  };

  return fsm;
}

module.exports = { applyKNXConnectionFixes };
