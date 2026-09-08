import { useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { openStream } from '../api'

export default function useLiveUpdates(callbackOrOptions) {
  const options = typeof callbackOrOptions === 'function'
    ? { reload: callbackOrOptions }
    : callbackOrOptions

  const { role, token } = useAuth(options.role)

  const latest = useRef(options.reload)
  latest.current = options.reload

  useEffect(() => {
    if (!token) return

    let stopped = false
    let running = false
    let queued = false
    let debounce
    let retry
    let controller

    async function run() {
      if (stopped) return

      if (running) {
        queued = true
        return
      }

      running = true

      try {
        await latest.current()
      } catch (error) {
        console.warn(
          'Live refresh will retry:',
          error.message
        )
      } finally {
        running = false

        if (queued && !stopped) {
          queued = false
          schedule()
        }
      }
    }

    function schedule() {
      if (stopped) return

      clearTimeout(debounce)
      debounce = setTimeout(run, 150)
    }

    async function connect() {
      if (stopped) return

      controller = new AbortController()

      try {
        const response = await openStream(
          role,
          controller.signal
        )

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        try {
          while (!stopped) {
            const { done, value } = await reader.read()

            if (done) break

            buffer += decoder.decode(value, {
              stream: true
            })

            let end

            while (
              (end = buffer.indexOf('\n\n')) !== -1
            ) {
              const message = buffer.slice(0, end)
              buffer = buffer.slice(end + 2)

              if (message.startsWith('data:')) {
                schedule()
              }
            }
          }
        } finally {
          reader.releaseLock()
        }
      } catch (error) {
        if (
          !stopped &&
          error.name !== 'AbortError'
        ) {
          console.warn('Live connection reconnecting…')
        }
      } finally {
        if (!stopped) {
          retry = setTimeout(connect, 3000)
        }
      }
    }

    const visible = () => {
      if (!document.hidden) schedule()
    }

    const online = () => schedule()

    // Recovery for missed events and interrupted connections.
    const fallback = setInterval(schedule, 30000)

    document.addEventListener(
      'visibilitychange',
      visible
    )

    window.addEventListener(
      'online',
      online
    )

    void connect()

    return () => {
      stopped = true

      clearTimeout(debounce)
      clearTimeout(retry)
      clearInterval(fallback)

      controller?.abort()

      document.removeEventListener(
        'visibilitychange',
        visible
      )

      window.removeEventListener(
        'online',
        online
      )
    }
  }, [role, token])
}