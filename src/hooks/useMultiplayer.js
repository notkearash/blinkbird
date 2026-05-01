import { useCallback, useEffect, useRef, useState } from 'react';

export function useMultiplayer() {
  const [connected, setConnected] = useState(false);
  const [role, setRole] = useState(null);
  const [peerReady, setPeerReady] = useState(false);
  const [error, setError] = useState(null);
  const [you, setYou] = useState(null);
  const [peer, setPeer] = useState(null);

  const wsRef = useRef(null);
  const onMessageRef = useRef(null);

  const setOnMessage = useCallback((fn) => {
    onMessageRef.current = fn;
  }, []);

  const connect = useCallback((roomId) => {
    if (!roomId) { setError('missing room id'); return; }
    if (wsRef.current && wsRef.current.readyState <= 1) return;
    setError(null);
    setPeerReady(false);
    setRole(null);
    setPeer(null);
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/api/room/${roomId}/ws`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (e) => {
      let data;
      try { data = JSON.parse(e.data); } catch { return; }
      if (data.type === 'role') {
        setRole(data.role);
        if (data.you) setYou(data.you);
        if (Array.isArray(data.peers) && data.peers.length > 0) {
          setPeer(data.peers[0]);
          setPeerReady(true);
        }
      } else if (data.type === 'player-joined') {
        if (data.peer) setPeer(data.peer);
        setPeerReady(true);
      } else if (data.type === 'player-left') {
        setPeer(null);
        setPeerReady(false);
      } else if (data.type === 'error') {
        setError(data.message);
      } else {
        onMessageRef.current?.(data);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setRole(null);
      setPeerReady(false);
      setPeer(null);
    };

    ws.onerror = () => setError('Connection failed');
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
    setRole(null);
    setPeerReady(false);
    setPeer(null);
    setYou(null);
    setError(null);
  }, []);

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  useEffect(() => {
    return () => wsRef.current?.close();
  }, []);

  return {
    connected, role, peerReady, error, you, peer,
    connect, disconnect, send, setOnMessage,
  };
}
