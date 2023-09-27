import { Color4 } from '@babylonjs/core/Maths/math.color'
export default class Tool {
   toolNumber: number = 0
   color: Color4 = new Color4(1, 1, 1, 1)
   diameter: number = 0.4
   constructor(idx, color) {
      this.toolNumber = idx
      this.color = color
   }
}

export const tools = [
   new Tool(0, new Color4(1, 0, 0, 1)),
   new Tool(1, new Color4(0, 1, 0, 1)),
   new Tool(2, new Color4(0, 0, 1, 1)),
   new Tool(3, new Color4(1, 1, 0, 1)),
   new Tool(4, new Color4(1, 0, 1, 1)),
]
