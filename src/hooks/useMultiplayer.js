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
  const readyFiredRef = useRef(false);

  const setOnMessage = useCallback((fn) => {
    onMessageRef.current = fn;
  }, []);

  const markReady = useCallback(() => {
    if (readyFiredRef.current) return;
    readyFiredRef.current = true;
    setConnected(true);
    setPeerReady(true);
  }, []);

  const attachConn = useCallback((conn) => {
    connRef.current = conn;
    readyFiredRef.current = false;

    conn.on('open', () => markReady());

    conn.on('data', (data) => {
      // If we get data, we're definitely connected
      markReady();
      onMessageRef.current?.(data);
    });

    conn.on('close', () => {
      readyFiredRef.current = false;
      setConnected(false);
      setPeerReady(false);
    });

    conn.on('error', (err) => {
      setError(err.message || 'Connection error');
    });
  }, [markReady]);

  const host = useCallback(() => {
    setError(null);
    readyFiredRef.current = false;
    const code = generateRoomCode();
    const peer = new Peer(PREFIX + code);
    peerRef.current = peer;

    peer.on('open', () => {
      setRoomCode(code);
      setRole('host');
    });

    peer.on('connection', (conn) => {
      attachConn(conn);
      // Host: send a ping once we think we're connected
      // so guest's on('data') fires and confirms the link
      conn.on('open', () => {
        conn.send({ type: 'ping' });
      });
    });

    peer.on('error', (err) => {
      setError(err.message || 'Peer error');
    });
  }, [attachConn]);

  const join = useCallback((code) => {
    setError(null);
    readyFiredRef.current = false;
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', () => {
      setRole('guest');
      const conn = peer.connect(PREFIX + code.toUpperCase(), {
        reliable: true,
        serialization: 'json',
      });
      attachConn(conn);
      // Guest: also send a ping on open so host's on('data') fires
      conn.on('open', () => {
        conn.send({ type: 'ping' });
      });
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
    readyFiredRef.current = false;
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
