import { Mesh } from '@babylonjs/core/Meshes/mesh'
import Base from './base'
import Move from './move'

export default class extends Base {
   color: number[] = [1, 1, 1, 1]
   mesh: Mesh = null
   index: number
   constructor(move: Move, mesh: any, index: number) {
      super(move.line)
      this.filePosition = move.filePosition
      this.lineNumber = move.lineNumber
      this.color = move.color
      this.mesh = mesh
      this.index = index
   }

   get transportData() {
      return {
         line: this.line,
         lineNumber: this.lineNumber,
         filePosition: this.filePosition,
      }
   }
}
