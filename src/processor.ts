import { Base, Move, Move_Thin } from './GCodeLines'
import ProcessorProperties from './processorProperties'
import { ProcessLine } from './GCodeCommands/processline'
import { Scene } from '@babylonjs/core/scene'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
//import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial'
import { CustomMaterial } from '@babylonjs/materials/custom/customMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Axis, Space } from '@babylonjs/core/Maths/math.axis'
import '@babylonjs/core/Meshes/thinInstanceMesh'
import GPUPicker from './gpupicker'
import { colorToNum } from './util'
import { vertexShader, fragmentShader } from './rendershaders'
import ModelMaterial from './modelmaterial'

export default class Processor {
   gCodeLines: Base[] = []
   ProcessorProperties: ProcessorProperties = new ProcessorProperties()
   scene: Scene
   meshes: Mesh[] = []
   renderFuncs: any[] = []
   breakPoint = 160000000
   //meshDict: { [key: string]: {} } = {} //Hashed set of meshes for picking by id
   gpuPicker: GPUPicker
   worker: Worker
   // shaderMaterial: ShaderMaterial
   modelMaterial: ModelMaterial
   filePosition: number = 536202
   maxIndex: number = 0

   constructor() {}

   async loadFile(file) {
      this.gCodeLines = []
      this.meshes = []
      //this.meshDict = {}
      this.buildMaterial()
      this.ProcessorProperties = new ProcessorProperties() //Reset for now
      console.log('Processing file')
      const lines = file.split('\n')
      for (let idx = 0; idx < lines.length; idx++) {
         const line = lines[idx]
         this.ProcessorProperties.lineNumber = idx //Use one index to match file
         this.ProcessorProperties.filePosition += line.length + 1 //Account for newlines that have been stripped
         this.gCodeLines.push(ProcessLine(this.ProcessorProperties, line.toUpperCase())) //uperrcase all the gcode
      }
      console.info('File Loaded.... Rendering Vertices')
      await this.testRenderScene()
      let prevTarget = null
      this.gpuPicker.colorTestCallBack = (colorId) => {
         if (prevTarget) {
            let m = prevTarget
            if (m && m.mesh) m.mesh.thinInstancePartialBufferUpdate('color', m.color, m.index * 4)
         }

         let m = this.gCodeLines[colorId]
         if (m && m.mesh) {
            m.mesh.thinInstancePartialBufferUpdate('color', [1, 0, 0, 1], m.index * 4)
            prevTarget = m
            this.worker.postMessage({ type: 'currentline', line: m.line })
         }
      }

      this.modelMaterial.updateCurrentFilePosition(this.gCodeLines[this.gCodeLines.length - 1].filePosition) //Set it to the end
      this.gpuPicker.updateCurrentPosition(this.gCodeLines[this.gCodeLines.length - 1].filePosition)
   }

   buildMaterial() {
      if (!this.modelMaterial) this.modelMaterial = new ModelMaterial(this.scene)
      this.modelMaterial.updateCurrentFilePosition(this.filePosition)
   }

   showPickColor: boolean = false
   toggleShowPickColor() {
      this.showPickColor = !this.showPickColor
      this.modelMaterial.showPickColor(this.showPickColor)
   }

   async updateColorTest() {
      let result = await new Promise((resolve) => {
         var tempArray = new Float32Array(this.maxIndex * 4)
         for (let idx = 0; idx < this.gCodeLines.length; idx++) {
            let line = this.gCodeLines[idx]
            if (line && line.mesh) {
               tempArray.set([Math.random() % 255, Math.random() % 255, Math.random() % 255], line.index * 4)
            }
         }
         resolve(tempArray)
      })
      this.meshes[0].thinInstancePartialBufferUpdate('color', result as Float32Array, 0)
   }

   async testRenderScene() {
      //let material = new StandardMaterial('materia', this.scene)
      //material.diffuseColor = new Color3(0.5, 0.5, 0.5)

      let material = this.modelMaterial.material

      this.scene.meshes.forEach((m) => {
         m.dispose()
      })

      for (let idx = 0; idx < this.meshes.length; idx++) {
         this.scene.unregisterBeforeRender(this.renderFuncs[idx])
         this.meshes[idx].dispose()
      }
      this.renderFuncs = []
      this.meshes = []

      const renderlines = []
      let tossCount = 0
      for (let idx = 0; idx < this.gCodeLines.length - 1; idx++) {
         try {
            if (
               this.gCodeLines[idx] &&
               this.gCodeLines[idx].isMove &&
               this.gCodeLines[idx].extruding &&
               this.gCodeLines[idx].length > 0.05
            ) {
               renderlines.push(this.gCodeLines[idx])
            } else {
               tossCount++
            }
         } catch (ex) {
            console.error(this.gCodeLines[idx], ex)
         }
      }

      let lastMod = Math.floor(renderlines.length / this.breakPoint)

      for (let idx = 0; idx <= lastMod; idx++) {
         let sl = renderlines.slice(idx * this.breakPoint, (idx + 1) * this.breakPoint)
         let rl = this.testBuildMesh(sl, material)
         this.meshes.push(rl)
         //if (idx % 2 == 0) {
         await this.delay(0.0001)
         //}
      }

      //Now that everything is loaded lets add the meshes to the gpu picker
      for (let m in this.meshes) {
         let mesh = this.meshes[m]
         this.gpuPicker.addToRenderList(mesh)
      }
   }

   delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms))
   }

   testBuildMesh(renderlines, material): Mesh {
      this.maxIndex = renderlines.length
      let box = MeshBuilder.CreateBox('box2', { width: 1, height: 1, depth: 1 }, this.scene)
      box.position = new Vector3(0, 0, 0)
      box.rotate(Axis.X, Math.PI / 4, Space.LOCAL)
      box.bakeCurrentTransformIntoVertices()
      box.convertToUnIndexedMesh()

      // let box = MeshBuilder.CreateCylinder('box', { height: 1, diameter: 1 }, this.scene)
      // box.locallyTranslate(new Vector3(0, 0, 0))
      // box.rotate(new Vector3(0, 0, 1), Math.PI / 2, Space.WORLD)
      // box.bakeCurrentTransformIntoVertices()

      let matrixData = new Float32Array(16 * renderlines.length)
      let colorData = new Float32Array(4 * renderlines.length)
      let pickData = new Float32Array(3 * renderlines.length)
      let filePositionData = new Float32Array(renderlines.length)
      let toolData = new Float32Array(renderlines.length)

      box.material = material

      box.name = `Mesh${this.meshes.length}}`

      for (let idx = 0; idx < renderlines.length; idx++) {
         let line = renderlines[idx] as Move
         let lineData = line.renderLine(0.4, 0.2)

         lineData.Matrix.copyToArray(matrixData, idx * 16)
         colorData.set(lineData.Color, idx * 4)

         //colorData.set([line.colorId[0] / 255, line.colorId[1] / 255, line.colorId[2] / 255, 1], idx * 4)
         pickData.set([line.colorId[0] / 255, line.colorId[1] / 255, line.colorId[2] / 255], idx * 3)

         filePositionData.set([line.filePosition], idx) //Record the file position with the mesh
         toolData.set([line.tool], idx)
         this.gCodeLines[colorToNum(line.colorId)] = new Move_Thin(line, box, idx) //remove unnecessary information now that we have the matrix
      }

      box.thinInstanceSetBuffer('matrix', matrixData, 16, true)
      box.doNotSyncBoundingInfo = true
      box.thinInstanceRefreshBoundingInfo(false)
      box.thinInstanceSetBuffer('color', colorData, 4)
      box.thinInstanceSetBuffer('pickColor', pickData, 3, true) //this holds the color ids for the mesh
      box.thinInstanceSetBuffer('filePosition', filePositionData, 1, true)
      box.thinInstanceSetBuffer('tool', toolData, 1, true)
      return box
   }
}
