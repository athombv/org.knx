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
// Same value as the library uses. The spec says 1 s, which is too strict for some interfaces.
const TUNNELING_ACK_TIMEOUT_MS = 2000;

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

  // Telegrams deferred during a reconnect were prepared with the old channel id; send them
  // on the current channel.
  const originalSendDatagramEnter = states.sendDatagram._onEnter;
  states.sendDatagram._onEnter = function onEnterSendDatagram(datagram, ...rest) {
    if (datagram && datagram.tunnstate && this.channel_id !== undefined) {
      // eslint-disable-next-line no-param-reassign
      datagram.tunnstate.channel_id = this.channel_id;
    }
    this.earlyAckSeq = null;
    return originalSendDatagramEnter.call(this, datagram, ...rest);
  };

  // The interface often answers before Node has run the UDP send callback, so the
  // TUNNELING_ACK arrives while still in `sendDatagram`. The library deferred it and then
  // waited in vain for an ACK it had already received. Remember it instead.
  states.sendDatagram.inbound_TUNNELING_ACK = function onEarlyAck(datagram) {
    this.earlyAckSeq = datagram.tunnstate ? datagram.tunnstate.seqnum : null;
  };

  // TUNNELING_REQUEST without TUNNELING_ACK. The library just went back to idle with the
  // sequence counter already incremented. If the request never reached the interface,
  // the interface discards every following request (unexpected sequence number), so
  // Homey -> KNX silently stops working until the app is restarted. Per spec the request
  // is now repeated once with the same sequence number.
  states.sendTunnReq_waitACK = {
    _onEnter(datagram) {
      this.pendingTunnReqSeq = datagram.tunnstate.seqnum;
      if (this.earlyAckSeq !== null && this.earlyAckSeq !== undefined
        && this.earlyAckSeq === datagram.tunnstate.seqnum) {
        this.earlyAckSeq = null;
        this.transition('idle');
        return;
      }
      this.tunnelingAckTimer = setTimeout(() => {
        if (!datagram.homeyResent) {
          this.log.debug('No TUNNELING_ACK, repeating request once');
          // eslint-disable-next-line no-param-reassign
          datagram.homeyResent = true;
          this.transition('sendTunnReq_resend', datagram);
        } else {
          // Still no ACK. The spec says to close the tunnel here; that is left out for now
          // because reconnecting caused reconnect loops with some interfaces. Continue
          // like the library did.
          this.log.warn('No TUNNELING_ACK after repeating the request');
          this.emit('tunnelreqfailed', datagram);
          this.transition('idle');
        }
      }, TUNNELING_ACK_TIMEOUT_MS);
    },
    _onExit() {
      clearTimeout(this.tunnelingAckTimer);
    },
    inbound_TUNNELING_ACK(datagram) {
      // Ignore a stale ACK for an earlier request
      if (datagram.tunnstate && datagram.tunnstate.seqnum !== this.pendingTunnReqSeq) return;
      if (datagram.tunnstate && datagram.tunnstate.status) {
        this.log.warn(`TUNNELING_ACK with error status ${datagram.tunnstate.status}`);
      }
      this.transition('idle');
    },
    'inbound_TUNNELING_REQUEST_L_Data.ind': function onIndication(datagram) {
      if (this.useTunneling) handleIndicationInPlace(this, datagram);
    },
    inbound_DISCONNECT_REQUEST(datagram) {
      states.idle.inbound_DISCONNECT_REQUEST.call(this, datagram);
    },
    '*': function deferOther() {
      this.deferUntilTransition('idle');
    },
  };

  states.sendTunnReq_resend = {
    _onEnter(datagram) {
      this.send(datagram);
      this.transition('sendTunnReq_waitACK', datagram);
    },
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
