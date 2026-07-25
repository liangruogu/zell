import { useEffect, useRef } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

interface UseCollaborationOptions {
  enabled: boolean
  serverUrl: string
  room: string
  token: string
  onConnect?: () => void
  onDisconnect?: () => void
}

export function useCollaboration(options: UseCollaborationOptions) {
  const { enabled, serverUrl, room, token } = options
  const ydocRef = useRef<Y.Doc | null>(null)
  const providerRef = useRef<WebsocketProvider | null>(null)
  const onConnectRef = useRef(options.onConnect)
  const onDisconnectRef = useRef(options.onDisconnect)
  onConnectRef.current = options.onConnect
  onDisconnectRef.current = options.onDisconnect

  useEffect(() => {
    if (!enabled || !serverUrl || !room || !token) return

    const ydoc = new Y.Doc()
    ydocRef.current = ydoc

    // y-websocket URL: {serverUrl}/ws/{pid}/{articleID}?token={jwt}
    const [pid, aid] = room.split(':')
    const wsBase = serverUrl.replace(/^http/, 'ws')
    const wsUrl = `${wsBase}/ws`

    const provider = new WebsocketProvider(wsUrl, `${pid}/${aid}`, ydoc, {
      params: { token },
    })
    providerRef.current = provider

    provider.on('status', (event: { status: string }) => {
      if (event.status === 'connected') {
        onConnectRef.current?.()
      } else if (event.status === 'disconnected') {
        onDisconnectRef.current?.()
      }
    })

    return () => {
      provider.disconnect()
      ydoc.destroy()
      ydocRef.current = null
      providerRef.current = null
    }
  }, [enabled, serverUrl, room, token])

  const getYDoc = () => ydocRef.current

  return { getYDoc }
}
