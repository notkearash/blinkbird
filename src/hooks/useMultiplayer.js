import { useEffect, useRef, useState, useCallback } from 'react';
import Peer from 'peerjs';

const PREFIX = 'blinkbird-';

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function useMultiplayer() {
  const [connected, setConnected] = useState(false);
  const [role, setRole] = useState(null);
  const [peerReady, setPeerReady] = useState(false);
  const [error, setError] = useState(null);
  const [roomCode, setRoomCode] = useState(null);

  const peerRef = useRef(null);
  const connRef = useRef(null);
  const onMessageRef = useRef(null);

  const setOnMessage = useCallback((fn) => {
    onMessageRef.current = fn;
  }, []);

  const markReady = useCallback(() => {
    setConnected(true);
    setPeerReady(true);
  }, []);

  const attachConn = useCallback((conn) => {
    connRef.current = conn;

    // If already open (race), fire immediately
    if (conn.open) {
      markReady();
    }

    conn.on('open', markReady);

    conn.on('data', (data) => {
      onMessageRef.current?.(data);
    });

    conn.on('close', () => {
      setConnected(false);
      setPeerReady(false);
    });

    conn.on('error', (err) => {
      setError(err.message || 'Connection error');
    });

    // PeerJS can miss its own 'open' event — listen on the raw datachannel
    const checkDc = setInterval(() => {
      const dc = conn.dataChannel;
      if (dc) {
        clearInterval(checkDc);
        if (dc.readyState === 'open') {
          markReady();
        } else {
          dc.addEventListener('open', markReady, { once: true });
        }
      }
    }, 50);
    // Stop checking after 10s if no datachannel ever appears
    setTimeout(() => clearInterval(checkDc), 10000);
  }, [markReady]);

  const host = useCallback(() => {
    setError(null);
    const code = generateRoomCode();
    const peer = new Peer(PREFIX + code);
    peerRef.current = peer;

    peer.on('open', () => {
      setRoomCode(code);
      setRole('host');
    });

    peer.on('connection', (conn) => {
      attachConn(conn);
    });

    peer.on('error', (err) => {
      setError(err.message || 'Peer error');
    });
  }, [attachConn]);

  const join = useCallback((code) => {
    setError(null);
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', () => {
      setRole('guest');
      const conn = peer.connect(PREFIX + code.toUpperCase(), {
        reliable: true,
        serialization: 'json',
      });
      attachConn(conn);
    });

    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') {
        setError('Room not found');
      } else {
        setError(err.message || 'Peer error');
      }
    });
  }, [attachConn]);

  const disconnect = useCallback(() => {
    connRef.current?.close();
    peerRef.current?.destroy();
    connRef.current = null;
    peerRef.current = null;
    setConnected(false);
    setRole(null);
    setPeerReady(false);
    setRoomCode(null);
    setError(null);
  }, []);

  const send = useCallback((data) => {
    if (connRef.current?.open) {
      connRef.current.send(data);
    }
  }, []);

  useEffect(() => {
    return () => {
      connRef.current?.close();
      peerRef.current?.destroy();
    };
  }, []);

  return {
    connected, role, peerReady, error, roomCode,
    host, join, disconnect, send, setOnMessage,
  };
}
