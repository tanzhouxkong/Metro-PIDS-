import { toRaw } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js'

export function cloneDisplayState(value) {
  if (value === undefined || value === null) return value
  const serialize = (source) => JSON.parse(JSON.stringify(source))
  try {
    return serialize(toRaw(value))
  } catch (err) {
    try {
      return serialize(value)
    } catch (nested) {
      console.warn('Failed to clone display state', nested)
      return null
    }
  }
}
