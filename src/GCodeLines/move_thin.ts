import { Mesh } from '@babylonjs/core/Meshes/mesh'
import Base from './base'
import Move from './move'
import ProcessorProperties from '../processorproperties'

export default class extends Base {
   color: number[] = [1, 1, 1, 1]
   mesh: Mesh = null
   index: number
   constructor(props: ProcessorProperties, move: Move, mesh: any, index: number) {
      super(props, move.line) //Props only used to satisify super but values overwritten with original
      this.moveType = move.moveType
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
