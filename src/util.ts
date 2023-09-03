export function numToColor(num = 0) {
   const r = (num & 0xff0000) >> 16
   const g = (num & 0x00ff00) >> 8
   const b = (num & 0x0000ff) >> 0

   return [r, g, b]
}

export function colorToNum(color: number[]) {
   return Number((color[0] << 16) + (color[1] << 8) + color[2])
}

export function colorToNumUint8(color: Uint8Array): Number {
   return (color[0] << 16) + (color[1] << 8) + color[2]
}
