import { Color4 } from '@babylonjs/core/Maths/math.color'
import { Quaternion, Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector'
import Base from './base'
import { numToColor } from '../util'

const PIOVER2 = Math.PI / 2
const VECDIV2 = [2, 2, 2]

export class PointData {
  Matrix: Matrix
  Color: Color4
  Props: any
}

export class MoveData {
  Matrix: Matrix
  Color: number[]
  Props: any
}

export default class Move extends Base {
  tool: number = 0
  start: number[] = [0, 0, 0]
  end: number[] = [0, 0, 0]
  extruding: boolean = false
  color: number[] = [1, 1, 1, 1]
  feedRate: number = 0
  layerHeight: number = 0.2
  isPerimeter: boolean = false
  colorId: number[] = [0, 0, 0]

  constructor(line: string) {
    super(line)
    this.isMove = true
  }

  get length(): number {
    return Vector3.Distance(
      new Vector3(this.start[0], this.start[1], this.start[2]),
      new Vector3(this.end[0], this.end[1], this.end[2]),
    )
  }

  static add(a: number[], b: number[]): number[] {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
  }

  static subtract(a: number[], b: number[]): number[] {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
  }

  static divide(a: number[], b: number[]): number[] {
    return [a[0] / b[0], a[1] / b[1], a[2] / b[2]]
  }

  //Padding is also doing a conversion from meters to mm -- Need to change how this is working
  renderLine(nozzleSize = 0.4, padding = 0): MoveData {
    this.colorId = numToColor(this.lineNumber)
    const p: MoveData = new MoveData()
    const length = this.length + padding * 0.1
    const midPoint = Move.divide(Move.add(this.start, this.end), VECDIV2) //this.start.add(this.end).divide(VECDIV2)
    const v = Move.subtract(this.end, this.start) // this.end.subtract(this.start)
    const r = Math.sqrt(Math.pow(v[0], 2) + Math.pow(v[1], 2) + Math.pow(v[2], 2))
    const phi = Math.atan2(v[2], v[0])
    const theta = Math.acos(v[1] / r)
    p.Matrix = Matrix.Compose(
      new Vector3(length, this.layerHeight, nozzleSize),
      Quaternion.FromEulerVector(new Vector3(0, -phi, PIOVER2 - theta)),
      new Vector3(midPoint[0], midPoint[1], midPoint[2]),
    )
    p.Color = this.color
    p.Props = {
      lineNumber: this.lineNumber,
      filePosition: this.filePosition,
      originalColor: this.color,
    }

    return p
  }
}
