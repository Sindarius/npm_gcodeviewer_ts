import { Base, Move } from './GCodeLines'
import ProcessorProperties from './processorProperties'
import { ProcessLine } from './GCodeCommands/processline'
import { Scene } from '@babylonjs/core/scene'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import '@babylonjs/core/Meshes/thinInstanceMesh'
import GPUPicker from './gpupicker'

export default class Processor {
  gCodeLines: Base[] = []
  ProcessorProperties: ProcessorProperties = new ProcessorProperties()
  scene: Scene
  meshes: Mesh[] = []
  renderFuncs: any[] = []
  breakPoint = 500
  meshDict: { [key: string]: {} } = {}
  gpuPicker: GPUPicker

  constructor() {}

  async loadFile(file) {
    this.gCodeLines = []
    this.ProcessorProperties = new ProcessorProperties() //Reset for now
    console.log('Processing file')
    const lines = file.split('\n')
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx]
      this.ProcessorProperties.lineNumber = idx
      this.ProcessorProperties.filePosition += line.length + 1 //Account for newlines that have been stripped
      this.gCodeLines.push(ProcessLine(this.ProcessorProperties, line.toUpperCase())) //uperrcase all the gcode
      if (idx > 20000 && idx < 20005) {
        console.log(this.gCodeLines[idx])
      }
    }
    console.info('File Loaded.... Rendering Vertices')
    await this.testRenderScene()
    let prevTarget = null
    this.gpuPicker.colorTestCallBack = (colorId) => {
      if (prevTarget) {
        let m = prevTarget
        if (m && m.mesh) m.mesh.thinInstancePartialBufferUpdate('color', m.line.color, m.index * 4)
      }
      let m = this.meshDict[colorId]
      if (m && m.mesh) m.mesh.thinInstancePartialBufferUpdate('color', [1, 0, 0, 1], m.index * 4)
      prevTarget = m
    }
  }

  async testRenderScene() {
    this.scene.meshes.forEach((m) => {
      m.dispose()
    })

    for (var idx = 0; idx < this.meshes.length; idx++) {
      this.scene.unregisterBeforeRender(this.renderFuncs[idx])
      this.meshes[idx].dispose()
    }
    this.renderFuncs = []
    this.meshes = []

    //get renderable lines
    //console.log(`gcodeLines: ${this.gCodeLines.length}`)

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
      let rl = this.testBuildMesh(sl)
      this.meshes.push(rl)
      if (idx % 500 == 0) {
        await this.delay(0.0001)
      }
    }

    for (let m in this.meshes) {
      let mesh = this.meshes[m]
      this.gpuPicker.addToRenderList(mesh)
    }
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  testBuildMesh(renderlines): Mesh {
    let box = MeshBuilder.CreateBox('box2', { width: 1, height: 1, depth: 1 }, this.scene)
    box.position = new Vector3(150, 5, 150)
    box.convertToUnIndexedMesh()
    let matrixData = new Float32Array(16 * renderlines.length)
    let colorData = new Float32Array(4 * renderlines.length)
    let pickData = new Float32Array(3 * renderlines.length)

    let material = new StandardMaterial('materia', this.scene)
    material.diffuseColor = new Color3(0.5, 0.5, 0.5)
    box.material = material

    box.name = `Mesh${this.meshes.length}}`

    for (var idx = 0; idx < renderlines.length; idx++) {
      let line = renderlines[idx] as Move
      var lineData = line.renderLine(0.4)

      lineData.Matrix.copyToArray(matrixData, idx * 16)
      colorData.set(lineData.Color, idx * 4)
      //colorData.set([line.colorId[0] / 255, line.colorId[1] / 255, line.colorId[2] / 255, 1], idx * 4)
      pickData.set([line.colorId[0] / 255, line.colorId[1] / 255, line.colorId[2] / 255], idx * 3)
      this.meshDict[`${line.colorId[0]}_${line.colorId[1]}_${line.colorId[2]}`] = { mesh: box, index: idx, line: line }
    }

    box.thinInstanceSetBuffer('matrix', matrixData, 16, true)
    box.thinInstanceSetBuffer('color', colorData, 4)
    box.thinInstanceSetBuffer('pickColor', pickData, 3) //this holds the color ids for the mesh
    return box
  }
}
