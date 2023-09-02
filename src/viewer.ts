import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene, ScenePerformancePriority } from '@babylonjs/core/scene'
import { Color4, Color3 } from '@babylonjs/core/Maths/math.color'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Light } from '@babylonjs/core/Lights/light'
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder'
import { Axis } from '@babylonjs/core/Maths/math.axis'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { PointLight } from '@babylonjs/core/Lights/pointLight'
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera'
import { FlyCamera } from '@babylonjs/core/Cameras/flyCamera'
import '@babylonjs/core/Culling/ray'
import Processor from './processor'
import { EngineInstrumentation } from '@babylonjs/core/Instrumentation/engineInstrumentation'
import '@babylonjs/core/Engines/Extensions/engine.query'
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation'
import '@babylonjs/core/Meshes/thinInstanceMesh'
import Move from '../dist/src/GCodeLines/move'

export default class Viewer {
  scene: Scene | undefined
  engine: Engine | null = null
  orbitCamera: ArcRotateCamera | null = null
  flyCamera: FlyCamera | null = null
  offscreenCanvas: OffscreenCanvas
  box: Mesh
  boxRotation: number
  light: Light
  pointLight: PointLight
  lastTimeStamp: number
  x: number = 1
  y: number = 1
  z: number = 1
  pause: boolean = false
  registeredEventHandlers = new Map<string, any>() //These are event handlers we want to bind to. Currently Canvas, Window, Document that we fake in the worker.
  worker: Worker
  processor: Processor = new Processor()

  // getBoundingInfo()
  rect = {
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    x: 0,
    y: 0,
    height: 0,
    width: 0,
  }

  constructor(data: any, worker: Worker) {
    this.offscreenCanvas = data.offscreencanvas

    this.offscreenCanvas.addEventListener = (event, fn, opt) => {
      this.bindHandler('canvas', event, fn, opt) //we do this to capture eventtargets
    }

    this.setSizes(data.width, data.height)

    //@ts-ignore getBoundingClientRect is not defined on offscreen canvas but necessary for babylonjs
    this.offscreenCanvas.getBoundingClientRect = () => {
      return this.rect
    }

    //@ts-ignore focus is not defined on offscreen canvas but necessary for babylonjs
    this.offscreenCanvas.focus = () => {
      this.worker.postMessage({
        type: 'canvasMethod',
        method: 'focus',
        args: [],
      })
    }

    this.worker = worker
  }

  setSizes(width, height) {
    //@ts-ignore
    this.offscreenCanvas.clientWidth = width
    //@ts-ignore
    this.offscreenCanvas.clientHeight = height
    this.offscreenCanvas.width = width
    this.offscreenCanvas.height = height

    this.rect.right = this.rect.width = width
    this.rect.bottom = this.rect.height = height
    if (this.engine) {
      this.engine.resize()
    }
  }

  async initEngine(useWebGPU = true) {
    if (useWebGPU === undefined) useWebGPU = false
    console.info(`G-Code Viewer- Sindarius - 1 `)

    //this will use the offscreen rendering and web worker threads
    this.engine = new Engine(this.offscreenCanvas, true, {
      doNotHandleContextLost: true,
    }) //WebGPU does not currently have a constructor that takes offscreen canvas

    this.scene = new Scene(this.engine)
    this.scene.clearColor = new Color4(0.5, 0.5, 0.5, 1)
    this.scene.doNotHandleCursors = true //We can't make cursor changes in the worker thread
    //this.scene.performancePriority = ScenePerformancePriority.Aggressive
    this.processor.scene = this.scene

    //Orbit Cam
    this.orbitCamera = new ArcRotateCamera('Camera', Math.PI / 2, 2.356194, 15, new Vector3(0, 0, 0), this.scene)
    this.orbitCamera.invertRotation = false
    this.orbitCamera.attachControl(this.offscreenCanvas, true)
    this.orbitCamera.maxZ = 100000
    this.orbitCamera.lowerRadiusLimit = 5
    this.orbitCamera.setPosition(new Vector3(150, 0, 0))
    this.orbitCamera.setTarget(new Vector3(150, 0, 150))

    //Cam properties
    this.orbitCamera.speed = 500
    this.orbitCamera.inertia = 0
    this.orbitCamera.panningInertia = 0
    this.orbitCamera.inputs.attached.keyboard.angularSpeed = 0.05
    this.orbitCamera.inputs.attached.keyboard.zoomingSensibility = 0.5
    this.orbitCamera.inputs.attached.keyboard.panningSensibility = 0.5
    this.orbitCamera.angularSensibilityX = 200
    this.orbitCamera.angularSensibilityY = 200
    this.orbitCamera.panningSensibility = 2
    this.orbitCamera.wheelPrecision = 0.25

    //Fly cam
    // this.flyCamera = new FlyCamera("FreeCamera", new Vector3(0, 0, -10), this.scene);
    // this.flyCamera.setTarget(new Vector3(0, 0, 50));
    // this.flyCamera.attachControl(this.offscreenCanvas, false);

    this.pointLight = new PointLight('pl', new Vector3(0, 0, 0), this.scene)

    this.pointLight.radius = 50
    this.pointLight.diffuse = new Color3(1, 1, 1)
    this.pointLight.specular = new Color3(1, 1, 1)

    this.box = CreateBox('Box', { width: 1, height: 1, depth: 1 }, this.scene)
    this.box.position = new Vector3(150, 0, 150)
    let material = new StandardMaterial('SM', this.scene)
    material.diffuseColor = new Color3(1, 0, 0)
    this.box.material = material

    this.scene.render()
    this.lastTimeStamp = Date.now()

    this.scene.onPointerPick = (evt, pickResult) => {
      console.log('pointer down')
      console.log(pickResult)
      if (pickResult.hit) {
        let move = this.processor.meshDict[pickResult.pickedMesh.name][pickResult.thinInstanceIndex] as Move
        console.log(
          'file position ' +
            this.processor.meshDict[pickResult.pickedMesh.name][pickResult.thinInstanceIndex].filePosition,
        )

        let s = (pickResult.pickedMesh as Mesh).thinInstancePartialBufferUpdate(
          'color',
          new Float32Array([1, 0, 0, 1]),
          pickResult.thinInstanceIndex * 4,
        )
      }
    }

    this.engine.runRenderLoop(() => {
      this.pointLight.position = this.orbitCamera?.position ?? new Vector3(0, 0, 0)
      this.scene?.render()
    })

    //this.loadInstrumentation()
  }

  loadInstrumentation() {
    var inst = new EngineInstrumentation(this.engine)
    inst.captureGPUFrameTime = true
    inst.captureShaderCompilationTime = true

    var sceneInst = new SceneInstrumentation(this.scene)

    let timer = Date.now()
    this.scene.registerAfterRender(() => {
      if (Date.now() - timer > 1000) {
        timer = Date.now()
        console.log('current frame time (GPU): ' + (inst.gpuFrameTimeCounter.current * 0.000001).toFixed(2) + 'ms')
        console.log(this.scene.meshes.length)
        console.log(`average draw calls ${sceneInst.drawCallsCounter.current}`)
      }
    })
  }

  loadFile(file) {
    this.processor.loadFile(file)
  }

  //Send message to the main thread for events we want to bind to.
  bindHandler(targetName, eventName, fn, opt) {
    var id = `${targetName}${eventName}`
    this.registeredEventHandlers.set(id, fn)

    this.worker.postMessage({
      type: 'event',
      targetName: targetName,
      eventName: eventName,
      opt: opt,
    })
  }

  //We get back events from the main thread and need to handle them here to trigger babylonjs events.
  handleEvent(eventType, event) {
    const handlerId = `${event.targetName}${event.eventName}`
    event.eventClone.preventDefault = this.noop
    event.eventClone.target = this.offscreenCanvas
    this.registeredEventHandlers.get(handlerId)(event.eventClone)
  }

  noop() {}
}
