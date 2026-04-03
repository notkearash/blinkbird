import { useEffect, useRef, useState, useCallback } from 'react';

export function useMultiplayer() {
  const [connected, setConnected] = useState(false);
  const [role, setRole] = useState(null); // 'host' | 'guest'
  const [peerReady, setPeerReady] = useState(false);
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const onMessageRef = useRef(null);

  const setOnMessage = useCallback((fn) => {
    onMessageRef.current = fn;
  }, []);

  const connect = useCallback((url) => {
    if (wsRef.current) wsRef.current.close();
    setError(null);

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        setRole(null);
        setPeerReady(false);
      };
      ws.onerror = () => setError('Connection failed');

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'role') {
            setRole(data.role);
          } else if (data.type === 'player-joined') {
            setPeerReady(true);
          } else if (data.type === 'player-left') {
            setPeerReady(false);
          } else if (data.type === 'error') {
            setError(data.message);
          } else {
            onMessageRef.current?.(data);
          }
        } catch {}
      };
    } catch {
      setError('Invalid URL');
    }
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
    setRole(null);
    setPeerReady(false);
  }, []);

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  useEffect(() => {
    return () => wsRef.current?.close();
  }, []);

  return { connected, role, peerReady, error, connect, disconnect, send, setOnMessage };
}
