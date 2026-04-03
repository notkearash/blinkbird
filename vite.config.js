import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { WebSocketServer } from 'ws'

function wsRelay() {
  return {
    name: 'ws-relay',
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true })

      let room = { host: null, guest: null }

      function broadcast(data, exclude) {
        const msg = JSON.stringify(data);
        [room.host, room.guest].forEach(ws => {
          if (ws && ws !== exclude && ws.readyState === 1) ws.send(msg)
        })
      }

      wss.on('connection', (ws) => {
        let role
        if (!room.host) {
          room.host = ws
          role = 'host'
        } else if (!room.guest) {
          room.guest = ws
          role = 'guest'
          if (room.host.readyState === 1) {
            room.host.send(JSON.stringify({ type: 'player-joined' }))
          }
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }))
          ws.close()
          return
        }

        ws.send(JSON.stringify({ type: 'role', role }))
        console.log(`${role} connected`)

        ws.on('message', (raw) => {
          try { broadcast(JSON.parse(raw), ws) } catch {}
        })

        ws.on('close', () => {
          if (ws === room.host) {
            room.host = null
            if (room.guest?.readyState === 1)
              room.guest.send(JSON.stringify({ type: 'player-left' }))
          } else if (ws === room.guest) {
            room.guest = null
            if (room.host?.readyState === 1)
              room.host.send(JSON.stringify({ type: 'player-left' }))
          }
        })
      })

      server.httpServer.on('upgrade', (req, socket, head) => {
        if (req.url === '/ws') {
          wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req)
          })
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), wsRelay()],
})
