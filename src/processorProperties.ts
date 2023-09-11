import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import Tool from './tools'
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
   zBelt: boolean = false
   zBeltLength: Number = 100
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
   currentZ = 0
   adj = 0
   hyp = 0

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
      let toolArray = new Array(this.lineCount * 4)
      let idx = 0
      for (let idx = 0; idx < this.tools.length; idx++) {
         this.tools[idx].color.toArray(toolArray, idx * 4)
      }
      return toolArray
   }

   constructor() {
      this.workplaceOffsets.push(new Vector3(0, 0, 0)) //set a default workplace if we do not have workplaces
      this.tools.push(new Tool(0, new Color4(1, 0, 0, 1))) //set a default tool if we do not have tools
      this.tools.push(new Tool(1, new Color4(0, 1, 0, 1))) //set a default tool if we do not have tools
      this.tools.push(new Tool(2, new Color4(0, 0, 1, 1))) //set a default tool if we do not have tools
      this.tools.push(new Tool(3, new Color4(1, 1, 0, 1))) //set a default tool if we do not have tools
      this.tools.push(new Tool(4, new Color4(1, 0, 1, 1))) //set a default tool if we do not have tools
      this.currentTool = this.tools[0]
   }
}
