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

export default class Processor {
  gCodeLines: Base[] = []
  ProcessorProperties: ProcessorProperties = new ProcessorProperties()
  scene: Scene
  meshes: Mesh[] = []
  renderFuncs: any[] = []
  breakPoint = 500
  meshDict: { [key: string]: Move[] } = {}

  constructor() {}

  loadFile(file) {
    this.gCodeLines = []
    this.ProcessorProperties = new ProcessorProperties() //Reset for now
    console.log('Processing file')
    const lines = file.split('\n')
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx]
      this.ProcessorProperties.lineNumber = idx
      this.ProcessorProperties.filePosition += line.length + 1 //Account for newlines that have been stripped
      this.gCodeLines.push(ProcessLine(this.ProcessorProperties, line.toUpperCase())) //uperrcase all the gcode
    }
    console.info('File Loaded.... Rendering Vertices')
    this.testRenderScene()
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
          this.gCodeLines[idx].length > 0.2
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
      if (idx % 500 == 0) await this.delay(0.0001)
    }

    //this.scene.freezeActiveMeshes()
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

    let material = new StandardMaterial('materia', this.scene)
    material.diffuseColor = new Color3(0.5, 0.5, 0.5)
    box.material = material
    box.thinInstanceEnablePicking = true

    box.name = `Mesh${this.meshes.length}}`
    this.meshDict[box.name] = []

    for (var idx = 0; idx < renderlines.length; idx++) {
      let line = renderlines[idx] as Move
      var lineData = line.renderLine(0.4)

      lineData.Matrix.copyToArray(matrixData, idx * 16)
      lineData.Color.toArray(colorData, idx * 4)
      this.meshDict[box.name].push(line)
    }

    box.doNotSyncBoundingInfo = false
    box.thinInstanceSetBuffer('matrix', matrixData, 16)
    box.thinInstanceSetBuffer('color', colorData, 4)
    box.thinInstanceRefreshBoundingInfo(true)

    // box.freezeWorldMatrix()

    // let beforeRenderFunc = () => {}
    // this.renderFuncs.push(beforeRenderFunc)
    // this.scene.registerBeforeRender(beforeRenderFunc)
    // this.scene.freezeActiveMeshes()
    return box
  }
}
