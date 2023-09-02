import { Color4 } from '@babylonjs/core/Maths/math.color'
import { Quaternion, Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import Base from './base'

const PIOVER2 = Math.PI / 2
const VECDIV2 = new Vector3(2, 2, 2)

export class PointData {
  Matrix: Matrix
  Color: Color4
  Props: any
}

export class MoveData {
  Matrix: Matrix
  Color: Color4
  Props: any
}

export default class Move extends Base {
  tool: number = 0
  start: Vector3 = Vector3.Zero()
  end: Vector3 = Vector3.Zero()
  extruding: boolean = false
  color: Color4 = new Color4(1, 1, 1, 1)
  feedRate: number = 0
  layerHeight: number = 0.2
  isPerimeter: boolean = false

  constructor(line: string) {
    super(line)
    this.isMove = true
  }

  get length(): number {
    return Vector3.Distance(this.start, this.end)
  }

  //Padding is also doing a conversion from meters to mm -- Need to change how this is working

  renderLine(nozzleSize = 0.4, padding = 0.1): MoveData {
    const p: MoveData = new MoveData()

    const length = this.length + padding
    const midPoint = this.start.add(this.end).divide(VECDIV2)
    const v = this.end.subtract(this.start)
    const r = Math.sqrt(Math.pow(v.x, 2) + Math.pow(v.y, 2) + Math.pow(v.z, 2))
    const phi = Math.atan2(v.z, v.x)
    const theta = Math.acos(v.y / r)
    p.Matrix = Matrix.Compose(
      new Vector3(length, this.layerHeight, nozzleSize),
      Quaternion.FromEulerVector(new Vector3(0, -phi, PIOVER2 - theta)),
      midPoint,
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
