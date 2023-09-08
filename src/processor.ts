import { Base, Move, ArcMove, Move_Thin } from './GCodeLines'
import ProcessorProperties from './processorproperties'
import { ProcessLine } from './GCodeCommands/processline'
import { Scene } from '@babylonjs/core/scene'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Axis, Space } from '@babylonjs/core/Maths/math.axis'
import '@babylonjs/core/Meshes/thinInstanceMesh'
import GPUPicker from './gpupicker'
import { colorToNum, delay, binarySearchClosest } from './util'
import ModelMaterial from './modelmaterial'
import { MoveData } from './GCodeLines/move'
colorToNum
export default class Processor {
   gCodeLines: Base[] = []
   processorProperties: ProcessorProperties = new ProcessorProperties()
   scene: Scene
   meshes: Mesh[] = []
   breakPoint = 160000000
   gpuPicker: GPUPicker
   worker: Worker
   modelMaterial: ModelMaterial
   filePosition: number = 0
   maxIndex: number = 0
   focusedColorId = 0

   constructor() {}

   async loadFile(file) {
      this.gCodeLines = []
      this.meshes = []
      //this.meshDict = {}
      this.buildMaterial()
      this.processorProperties = new ProcessorProperties() //Reset for now
      console.log('Processing file')
      const lines = file.split('\n')
      let pos = 0
      for (let idx = 0; idx < lines.length; idx++) {
         const line = lines[idx]
         this.processorProperties.lineNumber = idx + 1 //Use one index to match file
         this.processorProperties.filePosition = pos
         pos += line.length + 1 //Account for newlines that have been stripped
         this.gCodeLines.push(ProcessLine(this.processorProperties, line.toUpperCase())) //uperrcase all the gcode
      }
      console.info('File Loaded.... Rendering Vertices')
      await this.testRenderScene()

      //This is driving picking
      this.gpuPicker.colorTestCallBack = (colorId) => {
         let id = colorToNum(colorId) - 1
         this.focusedColorId = id
         if (this.gCodeLines[id] && id > 0) {
            let o = this.gCodeLines[id]

            this.worker.postMessage({
               type: 'currentline',
               line: o.line,
               lineNumber: o.lineNumber,
               filePosition: o.filePosition,
            })
            this.modelMaterial.setPickColor(colorId)
         }
      }

      this.modelMaterial.setMaxFeedRate(this.processorProperties.maxFeedRate)
      this.modelMaterial.setMinFeedRate(this.processorProperties.minFeedRate)

      this.modelMaterial.updateCurrentFilePosition(this.gCodeLines[this.gCodeLines.length - 1].filePosition) //Set it to the end
      this.gpuPicker.updateCurrentPosition(this.gCodeLines[this.gCodeLines.length - 1].filePosition)

      this.worker.postMessage({
         type: 'fileloaded',
         start: this.processorProperties.firstGCodeByte,
         end: this.processorProperties.lastGCodeByte,
      })
   }

   buildMaterial() {
      if (!this.modelMaterial) this.modelMaterial = new ModelMaterial(this.scene)
      this.modelMaterial.updateCurrentFilePosition(this.filePosition)
      this.modelMaterial.updateToolColors(this.processorProperties.buildToolFloat32Array())
   }

   async testRenderScene() {
      let material = this.modelMaterial.material

      this.scene.meshes.forEach((m) => {
         m.dispose()
      })

      for (let idx = 0; idx < this.meshes.length; idx++) {
         this.meshes[idx].dispose()
      }

      this.meshes = []

      const renderlines = []
      let tossCount = 0
      for (let idx = 0; idx < this.gCodeLines.length - 1; idx++) {
         try {
            if (this.gCodeLines[idx].lineType === 'L' && this.gCodeLines[idx].extruding) {
               //Regular move
               renderlines.push(this.gCodeLines[idx])
            } else if (this.gCodeLines[idx].lineType === 'A' && this.gCodeLines[idx].extruding) {
               //Arc Move
               renderlines.push(this.gCodeLines[idx])
            } else {
               tossCount++
            }
         } catch (ex) {
            console.log(this.gCodeLines[idx], ex)
         }
      }

      let lastMod = Math.floor(renderlines.length / this.breakPoint)

      for (let idx = 0; idx <= lastMod; idx++) {
         let sl = renderlines.slice(idx * this.breakPoint, (idx + 1) * this.breakPoint)
         let rl = this.testBuildMesh(sl, material)
         this.meshes.push(rl)
         //if (idx % 2 == 0) {
         await delay(0.0001)
         //}
      }

      //Now that everything is loaded lets add the meshes to the gpu picker
      for (let m in this.meshes) {
         let mesh = this.meshes[m]
         this.gpuPicker.addToRenderList(mesh)
      }
   }

   testBuildMesh(renderlines, material): Mesh {
      this.maxIndex = this.processorProperties.totalRenderedSegments
      console.log('Building Mesh', renderlines.length)
      // let box = MeshBuilder.CreateBox('box2', { width: 1, height: 1, depth: 1 }, this.scene)
      // box.position = new Vector3(0, 0, 0)
      // box.rotate(Axis.X, Math.PI / 4, Space.LOCAL)
      // box.bakeCurrentTransformIntoVertices()
      // box.convertToUnIndexedMesh()

      let box = MeshBuilder.CreateCylinder('box', { height: 1, diameter: 1 }, this.scene)
      box.locallyTranslate(new Vector3(0, 0, 0))
      box.rotate(new Vector3(0, 0, 1), Math.PI / 2, Space.WORLD)
      box.bakeCurrentTransformIntoVertices()

      let matrixData = new Float32Array(16 * this.maxIndex)
      let colorData = new Float32Array(4 * this.maxIndex)
      let pickData = new Float32Array(3 * this.maxIndex)
      let filePositionData = new Float32Array(this.maxIndex)
      let fileEndPositionData = new Float32Array(this.maxIndex)
      let toolData = new Float32Array(this.maxIndex)
      let feedRate = new Float32Array(this.maxIndex)

      box.material = material

      box.name = `Mesh${this.meshes.length}}`

      let segIdx = 0
      for (let idx = 0; idx < renderlines.length; idx++) {
         let line = renderlines[idx] as Base
         if (line.lineType === 'L') {
            let l = line as Move
            let lineData = l.renderLine(0.4, 0.2)
            buildBuffers(lineData, l, segIdx)
            this.gCodeLines[line.lineNumber - 1] = new Move_Thin(this.processorProperties, line as Move, box, idx) //remove unnecessary information now that we have the matrix
            segIdx++
         } else if (line.lineType === 'A') {
            let arc = line as ArcMove
            //run all the segments
            for (let seg in arc.segments) {
               let segment = arc.segments[seg] as Move
               let lineData = segment.renderLine(0.4, 0.2)
               buildBuffers(lineData, arc, segIdx)
               segIdx++
            }
            this.gCodeLines[line.lineNumber - 1] = new Move_Thin(this.processorProperties, line as ArcMove, box, idx) //remove unnecessary information now that we have the matrix
         }
      }

      box.thinInstanceSetBuffer('matrix', matrixData, 16, true)
      box.doNotSyncBoundingInfo = true
      box.thinInstanceRefreshBoundingInfo(false)
      box.thinInstanceSetBuffer('color', colorData, 4, true)
      box.thinInstanceSetBuffer('pickColor', pickData, 3, true) //this holds the color ids for the mesh
      box.thinInstanceSetBuffer('filePosition', filePositionData, 1, true)
      box.thinInstanceSetBuffer('filePositionEnd', fileEndPositionData, 1, true)

      box.thinInstanceSetBuffer('tool', toolData, 1, true)
      box.thinInstanceSetBuffer('feedRate', feedRate, 1, true)
      return box

      //Inner function with access to buffers
      function buildBuffers(lineData: MoveData, line: ArcMove | Move, idx: number) {
         lineData.Matrix.copyToArray(matrixData, idx * 16)
         colorData.set(lineData.Color, idx * 4)
         pickData.set([line.colorId[0] / 255, line.colorId[1] / 255, line.colorId[2] / 255], idx * 3)
         filePositionData.set([line.filePosition], idx) //Record the file position with the mesh
         fileEndPositionData.set([line.filePosition + line.line.length], idx) //Record the file position with the mesh
         toolData.set([line.tool], idx)
         feedRate.set([line.feedRate], idx)
      }
   }

   getFileSize() {
      if (this.gCodeLines) {
         return this.gCodeLines[this.gCodeLines.length - 1].filePosition
      }
   }

   getGCodeInRange(filePos, count = 20) {
      let idx = binarySearchClosest(this.gCodeLines, filePos, 'filePosition')

      if (this.gCodeLines[idx].filePosition > filePos) idx--

      let min = Math.max(0, idx - count / 2)
      let max = Math.min(idx + count / 2, this.gCodeLines.length - 1)

      if (count % 2 == 1) {
         min++
         max++
      }

      let sub = this.gCodeLines.slice(min, max)
      let lines = []
      for (let idx in sub) {
         let l = sub[idx]
         lines.push({
            line: l.line,
            lineNumber: l.lineNumber,
            filePosition: l.filePosition,
            lineType: l.lineType,
            focus: false,
         })
      }

      var f = lines.find((f) => f.lineNumber == this.gCodeLines[idx].lineNumber)
      if (f) f.focus = true

      this.worker.postMessage({ type: 'getgcodes', lines: lines })
   }

   updateFilePosition(position: number) {
      this.modelMaterial.updateCurrentFilePosition(position) //Set it to the end
      this.gpuPicker.updateCurrentPosition(position)
   }

   updateByLineNumber(lineNumber: number) {
      this.updateFilePosition(this.gCodeLines[lineNumber - 1].filePosition)
   }
}
