import { useEffect, useRef, useState, useCallback } from 'react';
import Peer from 'peerjs';

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

  function setupConn(conn) {
    connRef.current = conn;
    conn.on('open', () => {
      setConnected(true);
      setPeerReady(true);
    });
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
  }

  const host = useCallback(() => {
    setError(null);
    const code = generateRoomCode();
    const prefix = 'blinkbird-';
    const peer = new Peer(prefix + code);
    peerRef.current = peer;

    peer.on('open', () => {
      setRoomCode(code);
      setRole('host');
    });

    peer.on('connection', (conn) => {
      setupConn(conn);
    });

    peer.on('error', (err) => {
      setError(err.message || 'Peer error');
    });
  }, []);

  const join = useCallback((code) => {
    setError(null);
    const prefix = 'blinkbird-';
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', () => {
      setRole('guest');
      const conn = peer.connect(prefix + code.toUpperCase(), { reliable: true });
      setupConn(conn);
    });

    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') {
        setError('Room not found');
      } else {
        setError(err.message || 'Peer error');
      }
    });
  }, []);

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
