import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";

const PIOVER2 = Math.PI / 2;
const VECDIV2 = new Vector3(2, 2, 2);

export class PointData {
    Matrix: Matrix
    Color: Color4
    Props: any
}

export default class GCodeLine {

    tool : number = 0
    start: Vector3 = Vector3.Zero()
    end: Vector3 = Vector3.Zero()
    extruding: boolean = false
    lineNumber: number = 0
    filePosition: number = 0
    color: Color4 = new Color4()
    feedRate: number = 0
    layerHeight: number = 0
    isPerimeter: boolean = false

    gCode = ''
    isComment: boolean = false
    
    constructor() {
        
    }

    length(): number {
        return Vector3.Distance(this.start, this.end)
    }

    renderLine(nozzleSize = 0.4, padding = 0) {
        let p: any = {};
        const length = this.length() * padding;
        const midPoint = this.start.add(this.end).divide(VECDIV2);
        const v = this.end.subtract(this.start)
        const r = Math.sqrt(Math.pow(v.x, 2) + Math.pow(v.y, 2) + Math.pow(v.z, 2));
        const phi = Math.atan2(v.z, v.x);
        const theta = Math.acos(v.y / r);
        p.matrix = Matrix.Compose(
            new Vector3(length, this.layerHeight, nozzleSize),
            Quaternion.FromEulerVector(new Vector3(0, -phi, PIOVER2 - theta)),
            midPoint);
            p.color = this.color;
            p.props = {
                gcodeLineNumber: this.lineNumber,
                gcodeFilePosition: this.filePosition,
                originalColor: this.color,
            };

    return p;
    }

}