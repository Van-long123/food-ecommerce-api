export const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed <= 0) return fallback
  return parsed
}

export const parseBoolean = (value, fallback) => {
  if (value === undefined) return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim()
    if (normalized === 'true' || normalized === '1') return true
    if (normalized === 'false' || normalized === '0') return false
  }

  return fallback
}

export const toNumberOrNull = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) return parsed
  }

  return null
}

export const parseBool = (val) => val === true || val === 'true';

export const parseNum = (val, def = 0) => {
  const n = parseFloat(val);
  return isNaN(n) ? def : n;
};