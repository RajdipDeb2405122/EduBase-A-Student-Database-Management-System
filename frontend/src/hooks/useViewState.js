import { useEffect, useState } from 'react'

export default function useViewState(key, defaults) {
  const [value, setValue] = useState(() => {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(key) || '{}'
      )

      return Object.fromEntries(
        Object.entries(defaults).map(
          ([name, fallback]) => [
            name,
            typeof saved?.[name] === typeof fallback
              ? saved[name]
              : fallback
          ]
        )
      )
    } catch {
      return defaults
    }
  })

  useEffect(() => {
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify(value)
      )
    } catch {
      // View persistence is optional if browser storage is unavailable.
    }
  }, [key, value])

  const update = patch => {
    setValue(old => ({
      ...old,
      ...patch
    }))
  }

  return [value, update]
}