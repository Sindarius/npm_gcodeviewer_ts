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
import { slicerFactory } from './GCodeParsers/slicerfactory'

export default class Processor {
   gCodeLines: Base[] = []
   processorProperties: ProcessorProperties = new ProcessorProperties()
   scene: Scene
   meshes: Mesh[] = []
   breakPoint = 100000 // 160000000
   gpuPicker: GPUPicker
   worker: Worker
   modelMaterial: ModelMaterial[]
   filePosition: number = 0
   maxIndex: number = 0
   focusedColorId = 0

   constructor() {}

   async loadFile(file) {
      this.gCodeLines = []
      this.meshes = []
      this.buildMaterial()
      this.processorProperties = new ProcessorProperties() //Reset for now
      this.processorProperties.slicer = slicerFactory(file)
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
            this.modelMaterial.forEach((m) => m.setPickColor(colorId))
         }
      }

      this.modelMaterial.forEach((m) => m.setMaxFeedRate(this.processorProperties.maxFeedRate))
      this.modelMaterial.forEach((m) => m.setMinFeedRate(this.processorProperties.minFeedRate))

      this.modelMaterial.forEach((m) =>
         m.updateCurrentFilePosition(this.gCodeLines[this.gCodeLines.length - 1].filePosition),
      ) //Set it to the end
      this.gpuPicker.updateCurrentPosition(this.gCodeLines[this.gCodeLines.length - 1].filePosition)

      this.worker.postMessage({
         type: 'fileloaded',
         start: this.processorProperties.firstGCodeByte,
         end: this.processorProperties.lastGCodeByte,
      })
   }

   buildMaterial() {
      if (!this.modelMaterial) {
         this.modelMaterial = []
      }
      this.modelMaterial.forEach((m) => {
         m.updateCurrentFilePosition(this.filePosition)
         m.updateToolColors(this.processorProperties.buildToolFloat32Array())
      })
   }

   addNewMaterial(): ModelMaterial {
      let m = new ModelMaterial(this.scene)
      this.modelMaterial.push(m)
      return m
   }

   async testRenderScene() {
      this.gpuPicker.clearRenderList()

      for (let idx = 0; idx < this.meshes.length; idx++) {
         this.scene.removeMesh(this.meshes[idx])
         this.meshes[idx].dispose()
      }

      this.meshes = []

      const renderlines = []
      let tossCount = 0

      let segmentCount = 0
      let lastRenderedIdx = 0

      for (let idx = 0; idx < this.gCodeLines.length - 1; idx++) {
         let gCodeline = this.gCodeLines[idx] as Move
         try {
            if (gCodeline.lineType === 'L' && gCodeline.extruding) {
               //Regular move
               renderlines.push(gCodeline)
               segmentCount++
            } else if (gCodeline.lineType === 'A' && gCodeline.extruding) {
               //Arc Move
               renderlines.push(gCodeline)
               segmentCount += (this.gCodeLines[idx] as ArcMove).segments.length
            } else if (gCodeline.lineType === 'T') {
               //Travel
               renderlines.push(gCodeline)
               segmentCount++
            } else {
               tossCount++
            }
         } catch (ex) {
            console.log(this.gCodeLines[idx], ex)
         }

         if (segmentCount >= this.breakPoint) {
            let sl = renderlines.slice(lastRenderedIdx)
            let rl = this.testBuildMesh(sl, segmentCount)
            this.meshes.push(...rl)
            this.gpuPicker.addToRenderList(rl[0]) //use the box mesh for all picking
            lastRenderedIdx = renderlines.length
            segmentCount = 0
         }
      }

      if (segmentCount > 0) {
         let sl = renderlines.slice(lastRenderedIdx)
         let rl = this.testBuildMesh(sl, segmentCount)
         this.meshes.push(...rl)
         await delay(0.0001)
         this.gpuPicker.addToRenderList(rl[0]) //use the box mesh for all picking
      }
   }

   // 0 = Box
   // 1 = cyl
   // 2 = line
   setMeshMode(mode) {
      mode = mode > 2 ? 0 : mode
      this.meshes.forEach((m) => m.setEnabled(false))
      for (let idx = mode; idx < this.meshes.length; idx += 3) {
         this.meshes[idx].setEnabled(true)
      }
   }

   testBuildMesh(renderlines, segCount): Mesh[] {
      console.log('Building Mesh', renderlines.length, segCount)

      let box = MeshBuilder.CreateBox('box', { width: 1, height: 1, depth: 1 }, this.scene)
      box.position = new Vector3(0, 0, 0)
      box.rotate(Axis.X, Math.PI / 4, Space.LOCAL)
      box.bakeCurrentTransformIntoVertices()
      box.convertToUnIndexedMesh()

      let cyl = MeshBuilder.CreateCylinder('cyl', { height: 1, diameter: 1 }, this.scene)
      cyl.locallyTranslate(new Vector3(0, 0, 0))
      cyl.rotate(new Vector3(0, 0, 1), Math.PI / 2, Space.WORLD)
      cyl.bakeCurrentTransformIntoVertices()

      let line = MeshBuilder.CreateLines(
         'line',
         {
            points: [new Vector3(-0.5, 0, 0), new Vector3(0.5, 0, 0)],
         },
         this.scene,
      )

      let matrixData = new Float32Array(16 * segCount)
      let colorData = new Float32Array(4 * segCount)
      let pickData = new Float32Array(3 * segCount)
      let filePositionData = new Float32Array(segCount)
      let fileEndPositionData = new Float32Array(segCount)
      let toolData = new Float32Array(segCount)
      let feedRate = new Float32Array(segCount)

      box.material = this.addNewMaterial().material
      box.material.freeze()

      cyl.material = this.addNewMaterial().material
      cyl.material.freeze()

      let mm = this.addNewMaterial()
      line.material = mm.material
      line.material.freeze()

      mm.setLineMesh(true)

      //  box.name = `Mesh${this.meshes.length}}`

      let segIdx = 0
      for (let idx = 0; idx < renderlines.length; idx++) {
         let line = renderlines[idx] as Base
         if (line.lineType === 'L' || line.lineType === 'T') {
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
               let lineData = segment.renderLine(0.4, 0.3)
               buildBuffers(lineData, arc, segIdx)
               segIdx++
            }
            this.gCodeLines[line.lineNumber - 1] = new Move_Thin(this.processorProperties, line as ArcMove, box, idx) //remove unnecessary information now that we have the matrix
         }
      }

      copyBuffers(box)
      copyBuffers(cyl)
      cyl.setEnabled(false)
      copyBuffers(line)
      line.setEnabled(false)

      return [box, cyl, line]

      function copyBuffers(m: Mesh) {
         //let matrixDataClone = Float32Array.from(matrixData) //new Float32Array(matrixData)
         m.thinInstanceSetBuffer('matrix', matrixData, 16, true)
         m.doNotSyncBoundingInfo = true
         m.thinInstanceRefreshBoundingInfo(false)
         m.thinInstanceSetBuffer('color', colorData, 4, true)
         m.thinInstanceSetBuffer('pickColor', pickData, 3, true) //this holds the color ids for the mesh
         m.thinInstanceSetBuffer('filePosition', filePositionData, 1, true)
         m.thinInstanceSetBuffer('filePositionEnd', fileEndPositionData, 1, true)
         m.thinInstanceSetBuffer('tool', toolData, 1, true)
         m.thinInstanceSetBuffer('feedRate', feedRate, 1, true)
         m.freezeWorldMatrix()
         m.isPickable = false
      }

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
      this.modelMaterial.forEach((m) => m.updateCurrentFilePosition(position)) //Set it to the end
      this.gpuPicker.updateCurrentPosition(position)
   }

   updateByLineNumber(lineNumber: number) {
      this.updateFilePosition(this.gCodeLines[lineNumber - 1].filePosition)
   }
}
