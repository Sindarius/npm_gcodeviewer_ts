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
  progressColor: Color4 = new Color4(0, 1, 0, 1)
  progressAnimation: boolean = true //Formerly known as "renderAnimation"
  colorMode: ColorMode = ColorMode.Tool
  firstGCodeByte: number = 0
  lastGCodeByte: number = 0
  zBelt: boolean = false
  zBeltLength: Number = 100
  hasMixing: boolean = false
  currentWorkplace: number = 0
  absolute: boolean = false
  firmwareRetraction: boolean = false
  units = Units.millimeters
}
