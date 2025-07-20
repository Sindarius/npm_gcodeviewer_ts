import { Base, Move, ArcMove, Move_Thin } from './GCodeLines'
import ProcessorProperties from './processorProperties'
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
import LineShaderMaterial from './lineshader'
import LODManager, { LODLevel } from './lodmanager'
import { GCodePools } from './objectpool'

export default class Processor {
   gCodeLines: Base[] = []
   processorProperties: ProcessorProperties = new ProcessorProperties()
   scene: Scene
   meshes: Mesh[] = []
   breakPoint = 100000
   gpuPicker: GPUPicker
   worker: Worker
   //modelMaterial: ModelMaterial[]
   modelMaterial: LineShaderMaterial[]
   filePosition: number = 0
   maxIndex: number = 0
   focusedColorId = 0
   lastMeshMode = 0
   perimeterOnly = false
   originalFile: string //May or may not keep this. May force front end to reprovide or cache file.
   lodManager: LODManager
   objectPools: GCodePools

   constructor() {
      this.lodManager = new LODManager()
      this.objectPools = GCodePools.getInstance()
   }

   cleanup() {
      this.gpuPicker.clearRenderList()
      for (let idx = 0; idx < this.meshes.length; idx++) {
         this.scene.removeMesh(this.meshes[idx], true)
         this.meshes[idx].dispose(false, true)
      }
      this.meshes = []
      this.modelMaterial = []
   }

   async loadFile(file) {
      this.originalFile = file
      this.cleanup()
      this.gCodeLines = []
      this.processorProperties = new ProcessorProperties() //Reset for now
      this.processorProperties.slicer = slicerFactory(file)
      console.log('Processing file')
      
      // Use streaming approach for better performance
      await this.loadFileStreamed(file)

      console.info('File Loaded.... Rendering Vertices')
      await this.testRenderSceneProgressive()

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

      this.setMeshMode(this.lastMeshMode)
   }

   private async loadFileStreamed(file: string) {
      const lines = file.split('\n')
      const chunkSize = 10000 // Process 10k lines at a time
      let pos = 0
      
      for (let chunkStart = 0; chunkStart < lines.length; chunkStart += chunkSize) {
         const chunkEnd = Math.min(chunkStart + chunkSize, lines.length)
         
         // Process chunk
         for (let idx = chunkStart; idx < chunkEnd; idx++) {
            const line = lines[idx]
            this.processorProperties.lineNumber = idx + 1 //Use one index to match file
            this.processorProperties.filePosition = pos
            pos += line.length + 1 //Account for newlines that have been stripped
            this.gCodeLines.push(ProcessLine(this.processorProperties, line.toUpperCase())) //uppercase all the gcode
         }
         
         // Report progress
         const progress = chunkEnd / lines.length
         this.worker.postMessage({ 
            type: 'progress', 
            progress: progress, 
            label: 'Processing file' 
         })
         
         // Yield control to prevent blocking UI
         if (chunkEnd < lines.length) {
            await new Promise(resolve => setTimeout(resolve, 0))
         }
      }

      this.worker.postMessage({ type: 'progress', progress: 1, label: 'Processing file' })
   }

   addNewMaterial(): LineShaderMaterial {
      let m = new LineShaderMaterial(this.scene)
      this.modelMaterial.push(m)
      return m
   }

   async testRenderScene() {
      const renderlines = []
      let tossCount = 0

      let segmentCount = 0
      let lastRenderedIdx = 0
      let alphaIndex = 0

      for (let idx = 0; idx < this.gCodeLines.length - 1; idx++) {
         let gCodeline = this.gCodeLines[idx] as Move
         if (this.perimeterOnly && !gCodeline.isPerimeter) {
            this.gCodeLines[idx] = new Move_Thin(this.processorProperties, gCodeline as Move, null, idx)
            tossCount++
            continue
         }
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
            alphaIndex++
            let sl = renderlines.slice(lastRenderedIdx)
            let rl = this.testBuildMesh(sl, segmentCount, alphaIndex)
            this.meshes.push(...rl)
            this.gpuPicker.addToRenderList(rl[0]) //use the box mesh for all picking
            lastRenderedIdx = renderlines.length
            segmentCount = 0

            this.worker.postMessage({
               type: 'progress',
               progress: idx / this.gCodeLines.length,
               label: 'Generating model.',
            })
         }
      }

      if (segmentCount > 0) {
         let sl = renderlines.slice(lastRenderedIdx)
         let rl = this.testBuildMesh(sl, segmentCount, alphaIndex)
         this.meshes.push(...rl)
         this.gpuPicker.addToRenderList(rl[0]) //use the box mesh for all picking
      }

      this.worker.postMessage({
         type: 'progress',
         progress: 1,
         label: 'Generating model.',
      })

      this.modelMaterial.forEach((m) => {
         m.updateCurrentFilePosition(this.filePosition)
         m.updateToolColors(this.processorProperties.buildToolFloat32Array())
      })
   }

   async testRenderSceneProgressive() {
      const renderlines = []
      let tossCount = 0
      let segmentCount = 0
      let lastRenderedIdx = 0
      let alphaIndex = 0
      const chunkSize = 50000 // Process meshes in smaller chunks

      for (let idx = 0; idx < this.gCodeLines.length - 1; idx++) {
         let gCodeline = this.gCodeLines[idx] as Move
         if (this.perimeterOnly && !gCodeline.isPerimeter) {
            this.gCodeLines[idx] = new Move_Thin(this.processorProperties, gCodeline as Move, null, idx)
            tossCount++
            continue
         }
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

         // Use adaptive breakpoint based on LOD
         const adaptiveBreakpoint = this.lodManager.getAdaptiveBreakpoint(60, 30, this.breakPoint)
         
         if (segmentCount >= adaptiveBreakpoint) {
            alphaIndex++
            
            // Determine LOD level for this chunk
            const lodLevel = this.lodManager.getLODBySegmentCount(segmentCount)
            
            let sl = renderlines.slice(lastRenderedIdx)
            let rl = this.testBuildMeshWithLOD(sl, segmentCount, alphaIndex, lodLevel)
            this.meshes.push(...rl)
            this.gpuPicker.addToRenderList(rl[0]) //use the box mesh for all picking
            lastRenderedIdx = renderlines.length
            segmentCount = 0

            this.worker.postMessage({
               type: 'progress',
               progress: idx / this.gCodeLines.length,
               label: 'Generating model.',
            })

            // Yield control every few mesh generations
            if (alphaIndex % 5 === 0) {
               await new Promise(resolve => setTimeout(resolve, 0))
            }
         }
      }

      if (segmentCount > 0) {
         let sl = renderlines.slice(lastRenderedIdx)
         let rl = this.testBuildMesh(sl, segmentCount, alphaIndex)
         this.meshes.push(...rl)
         this.gpuPicker.addToRenderList(rl[0]) //use the box mesh for all picking
      }

      this.worker.postMessage({
         type: 'progress',
         progress: 1,
         label: 'Generating model.',
      })

      this.modelMaterial.forEach((m) => {
         m.updateCurrentFilePosition(this.filePosition)
         m.updateToolColors(this.processorProperties.buildToolFloat32Array())
      })
   }

   // 0 = Box
   // 1 = cyl
   // 2 = line
   setMeshMode(mode) {
      // this.scene.unfreezeActiveMeshes()
      mode = mode > 2 ? 0 : mode
      this.meshes.forEach((m) => m.setEnabled(false))
      for (let idx = mode; idx < this.meshes.length; idx += 3) {
         this.meshes[idx].setEnabled(true)
      }
      this.lastMeshMode = mode
   }

   testBuildMeshWithLOD(renderlines, segCount, alphaIndex, lodLevel: LODLevel): Mesh[] {
      // For LOD, we might skip certain mesh types or reduce complexity
      switch (lodLevel) {
         case LODLevel.LOW:
            return this.buildLineMeshOnly(renderlines, segCount, alphaIndex)
         case LODLevel.MEDIUM:
            return this.buildMediumDetailMesh(renderlines, segCount, alphaIndex)
         case LODLevel.HIGH:
         default:
            return this.testBuildMesh(renderlines, segCount, alphaIndex)
      }
   }

   buildLineMeshOnly(renderlines, segCount, alphaIndex): Mesh[] {
      // Only create line mesh for performance
      let line = MeshBuilder.CreateLines(
         'line',
         {
            points: [new Vector3(-0.5, 0, 0), new Vector3(0.5, 0, 0)],
         },
         this.scene,
      )

      // Use object pooling for better memory management
      const buffers = this.objectPools.getBuffersForSegmentCount(segCount)

      let mm = this.addNewMaterial()
      line.alphaIndex = alphaIndex
      line.material = mm.material
      mm.setLineMesh(true)

      this.processRenderLines(renderlines, buffers.matrixData, buffers.colorData, buffers.pickData, 
                            buffers.filePositionData, buffers.fileEndPositionData, buffers.toolData, 
                            buffers.feedRate, buffers.isPerimeter)
      
      this.copyBuffersToMesh(line, buffers.matrixData, buffers.colorData, buffers.pickData, 
                           buffers.filePositionData, buffers.fileEndPositionData, buffers.toolData, 
                           buffers.feedRate, buffers.isPerimeter)

      return [line, line, line] // Return same mesh for all modes
   }

   buildMediumDetailMesh(renderlines, segCount, alphaIndex): Mesh[] {
      // Create cylinder and line mesh only (skip box)
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
      let isPerimeter = new Float32Array(segCount)

      cyl.material = this.addNewMaterial().material
      cyl.alphaIndex = alphaIndex

      let mm = this.addNewMaterial()
      line.alphaIndex = alphaIndex
      line.material = mm.material
      mm.setLineMesh(true)

      this.processRenderLines(renderlines, matrixData, colorData, pickData, 
                            filePositionData, fileEndPositionData, toolData, feedRate, isPerimeter)

      this.copyBuffersToMesh(cyl, matrixData, colorData, pickData, 
                           filePositionData, fileEndPositionData, toolData, feedRate, isPerimeter)
      this.copyBuffersToMesh(line, matrixData, colorData, pickData, 
                           filePositionData, fileEndPositionData, toolData, feedRate, isPerimeter)

      cyl.setEnabled(false)
      line.setEnabled(false)

      return [cyl, cyl, line] // Use cylinder for first two modes
   }

   testBuildMesh(renderlines, segCount, alphaIndex): Mesh[] {
      let box = MeshBuilder.CreateBox('box', { width: 1, height: 1, depth: 1 }, this.scene)
      box.position = new Vector3(0, 0, 0)
      box.rotate(Axis.X, Math.PI / 4, Space.LOCAL)
      box.bakeCurrentTransformIntoVertices()
      //box.convertToUnIndexedMesh()

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
      let isPerimeter = new Float32Array(segCount)

      box.material = this.addNewMaterial().material
      box.alphaIndex = alphaIndex
      //box.material.freeze()

      cyl.material = this.addNewMaterial().material
      cyl.alphaIndex = alphaIndex
      //cyl.material.freeze()

      let mm = this.addNewMaterial()
      line.alphaIndex = alphaIndex
      line.material = mm.material
      mm.setLineMesh(true)
      //line.material.freeze()

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
               let lineData = segment.renderLine(0.38, 0.3)
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
         m.thinInstanceSetBuffer('baseColor', colorData, 4, true)
         m.thinInstanceSetBuffer('pickColor', pickData, 3, true) //this holds the color ids for the mesh
         m.thinInstanceSetBuffer('filePosition', filePositionData, 1, true)
         m.thinInstanceSetBuffer('filePositionEnd', fileEndPositionData, 1, true)
         m.thinInstanceSetBuffer('tool', toolData, 1, true)
         m.thinInstanceSetBuffer('feedRate', feedRate, 1, true)
         m.thinInstanceSetBuffer('isPerimeter', isPerimeter, 1, true)
         //         m.freezeWorldMatrix()
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
         isPerimeter.set([line.isPerimeter ? 1 : 0], idx)
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

   private processRenderLines(
      renderlines, 
      matrixData: Float32Array, 
      colorData: Float32Array, 
      pickData: Float32Array,
      filePositionData: Float32Array, 
      fileEndPositionData: Float32Array, 
      toolData: Float32Array, 
      feedRate: Float32Array, 
      isPerimeter: Float32Array
   ) {
      let segIdx = 0
      for (let idx = 0; idx < renderlines.length; idx++) {
         let line = renderlines[idx] as Base
         if (line.lineType === 'L' || line.lineType === 'T') {
            let l = line as Move
            let lineData = l.renderLine(0.4, 0.2)
            this.buildBuffersHelper(lineData, l, segIdx, matrixData, colorData, pickData, 
                                   filePositionData, fileEndPositionData, toolData, feedRate, isPerimeter)
            this.gCodeLines[line.lineNumber - 1] = new Move_Thin(this.processorProperties, line as Move, null, idx)
            segIdx++
         } else if (line.lineType === 'A') {
            let arc = line as ArcMove
            for (let seg in arc.segments) {
               let segment = arc.segments[seg] as Move
               let lineData = segment.renderLine(0.38, 0.3)
               this.buildBuffersHelper(lineData, arc, segIdx, matrixData, colorData, pickData, 
                                      filePositionData, fileEndPositionData, toolData, feedRate, isPerimeter)
               segIdx++
            }
            this.gCodeLines[line.lineNumber - 1] = new Move_Thin(this.processorProperties, line as ArcMove, null, idx)
         }
      }
   }

   private buildBuffersHelper(
      lineData: MoveData, 
      line: ArcMove | Move, 
      idx: number,
      matrixData: Float32Array, 
      colorData: Float32Array, 
      pickData: Float32Array,
      filePositionData: Float32Array, 
      fileEndPositionData: Float32Array, 
      toolData: Float32Array, 
      feedRate: Float32Array, 
      isPerimeter: Float32Array
   ) {
      lineData.Matrix.copyToArray(matrixData, idx * 16)
      colorData.set(lineData.Color, idx * 4)
      pickData.set([line.colorId[0] / 255, line.colorId[1] / 255, line.colorId[2] / 255], idx * 3)
      filePositionData.set([line.filePosition], idx)
      fileEndPositionData.set([line.filePosition + line.line.length], idx)
      toolData.set([line.tool], idx)
      feedRate.set([line.feedRate], idx)
      isPerimeter.set([line.isPerimeter ? 1 : 0], idx)
   }

   private copyBuffersToMesh(
      mesh: Mesh,
      matrixData: Float32Array, 
      colorData: Float32Array, 
      pickData: Float32Array,
      filePositionData: Float32Array, 
      fileEndPositionData: Float32Array, 
      toolData: Float32Array, 
      feedRate: Float32Array, 
      isPerimeter: Float32Array
   ) {
      mesh.thinInstanceSetBuffer('matrix', matrixData, 16, true)
      mesh.doNotSyncBoundingInfo = true
      mesh.thinInstanceRefreshBoundingInfo(false)
      mesh.thinInstanceSetBuffer('baseColor', colorData, 4, true)
      mesh.thinInstanceSetBuffer('pickColor', pickData, 3, true)
      mesh.thinInstanceSetBuffer('filePosition', filePositionData, 1, true)
      mesh.thinInstanceSetBuffer('filePositionEnd', fileEndPositionData, 1, true)
      mesh.thinInstanceSetBuffer('tool', toolData, 1, true)
      mesh.thinInstanceSetBuffer('feedRate', feedRate, 1, true)
      mesh.thinInstanceSetBuffer('isPerimeter', isPerimeter, 1, true)
      mesh.isPickable = false
   }

   async setPerimeterOnly(perimeterOnly) {
      this.perimeterOnly = perimeterOnly
      await this.loadFile(this.originalFile)
   }

   showSupports(show) {
      this.modelMaterial.forEach((m) => m.showSupports(show))
   }
}
