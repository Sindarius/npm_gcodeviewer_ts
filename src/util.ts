export function numToColor(num = 0) {
  const r = (num & 0xff0000) >> 16
  const g = (num & 0x00ff00) >> 8
  const b = (num & 0x0000ff) >> 0

  return [r, g, b]
}
