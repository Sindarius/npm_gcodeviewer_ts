import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import Tool, { tools } from './tools'
import { Color4 } from '@babylonjs/core/Maths/math.color'
import SlicerBase from './GCodeParsers/slicerbase'
import GenericBase from './GCodeParsers/genericbase'

export enum ColorMode {
   Tool,
   Feature,
   FeedRate,
}

export enum ArcPlane {
   XY = 'XY',
   XZ = 'XZ',
   YZ = 'YZ',
}

export enum Units {
   millimeters = 'mm',
   inches = 'in',
}

//This is the class that holds all the properties that are used by the processor
export default class ProcessorProperties {
   maxHeight: number = 0
   minHeight: number = 0
   lineCount: number = 0
   layerDictionary: [] = []
   previousZ: number = 0 //Last Z value where extrusion occured  - This may need to go away to depend on slicer especially for non-planar prints
   filePosition: number = 0
   lineNumber: number = 0
   tools: Tool[] = []
   currentTool: Tool
   currentPosition: Vector3 = new Vector3(0, 0, 0)
   currentFeedRate: number = 1
   maxFeedRate: number = 1
   minFeedRate: number = 999999999
   progressColor: Color4 = new Color4(0, 1, 0, 1)
   progressAnimation: boolean = true //Formerly known as "renderAnimation"
   firstGCodeByte: number = 0
   lastGCodeByte: number = 0
   hasMixing: boolean = false
   currentWorkplaceIdx: number = 0
   workplaceOffsets: Vector3[] = []
   absolute: boolean = false
   firmwareRetraction: boolean = false
   units = Units.millimeters
   totalRenderedSegments: number = 0
   fixRadius: boolean = false // Used to fix a radius on an arc if it's too small. Some CNC processors "fix" G2/G3 for you
   arcPlane: ArcPlane = ArcPlane.XY // Used to determine the plane of an arc
   cncMode: boolean = false
   slicer: SlicerBase = new GenericBase()

   //Used for belt processing
   zBelt: boolean = false
   zBeltLength: Number = 100
   gantryAngle = (45 * Math.PI) / 180
   currentZ = 0
   hyp = Math.cos(this.gantryAngle)
   adj = Math.tan(this.gantryAngle)

   setGantryAngle(angle: number) {
      this.gantryAngle = (angle * Math.PI) / 180
      this.hyp = Math.cos(this.gantryAngle)
      this.adj = Math.tan(this.gantryAngle)
   }

   get CurrentFeedRate(): number {
      return this.currentFeedRate
   }

   set CurrentFeedRate(value: number) {
      if (this.currentFeedRate > this.maxFeedRate) {
         this.maxFeedRate = this.currentFeedRate
      }
      if (this.currentFeedRate != 0 && this.currentFeedRate < this.minFeedRate) {
         this.minFeedRate = this.currentFeedRate
      }

      this.currentFeedRate = value
   }

   get currentWorkplace() {
      return this.workplaceOffsets[this.currentWorkplaceIdx]
   }

  buildToolFloat32Array() {
      const MAX_TOOLS = 20
      const toolArray = new Float32Array(MAX_TOOLS * 4)
      for (let i = 0; i < MAX_TOOLS; i++) {
         const t = this.tools[i]
         if (t && t.color) {
            // Babylon Color4 has toArray(target, offset)
            t.color.toArray(toolArray as unknown as number[], i * 4)
         } else {
            // Default palette entries for missing tools
            // 0: Cyan, 1: Magenta, 2: Yellow, 3: White, 4: Black, then repeat red/green/blue
            const palette = [
               [0, 1, 1, 1], // Cyan
               [1, 0, 1, 1], // Magenta
               [1, 1, 0, 1], // Yellow
               [1, 1, 1, 1], // White
               [0, 0, 0, 1], // Black
               [1, 0, 0, 1], // Red
               [0, 1, 0, 1], // Green
               [0, 0, 1, 1], // Blue
            ]
            const p = palette[i % palette.length]
            toolArray[i * 4 + 0] = p[0]
            toolArray[i * 4 + 1] = p[1]
            toolArray[i * 4 + 2] = p[2]
            toolArray[i * 4 + 3] = p[3]
         }
      }
      // Debug summary of colors set
      try {
         const first = Array.from(toolArray.slice(0, 20))
         // eslint-disable-next-line no-console
         console.log('[Tools] toolColors (first 5 vec4)', {
            t0: first.slice(0, 4),
            t1: first.slice(4, 8),
            t2: first.slice(8, 12),
            t3: first.slice(12, 16),
            t4: first.slice(16, 20),
         })
      } catch {}
      return Array.from(toolArray)
  }

   constructor() {
      this.workplaceOffsets.push(new Vector3(0, 0, 0)) //set a default workplace if we do not have workplaces
      this.tools = tools // set the tools to the default tools
      this.currentTool = this.tools[0]
   }
}
