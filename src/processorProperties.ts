import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import Tool from './tools'
import { Color4 } from '@babylonjs/core/Maths/math.color'

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
  currentTool: Tool = new Tool()
  currentPosition: Vector3 = new Vector3(0, 0, 0)
  currentFeedRate: number = 0
  progressColor: Color4 = new Color4(0, 1, 0, 1)
  progressAnimation: boolean = true //Formerly known as "renderAnimation"
  colorMode: ColorMode = ColorMode.Tool
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

  //Used for belt processing
  currentZ = 0
  adj = 0
  hyp = 0

  get currentWorkplace() {
    return this.workplaceOffsets[this.currentWorkplaceIdx]
  }

  constructor() {
    this.workplaceOffsets.push(new Vector3(0, 0, 0)) //set a default workplace if we do not have workplaces
  }
}
