import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene, ScenePerformancePriority } from '@babylonjs/core/scene'
import { Color4, Color3 } from '@babylonjs/core/Maths/math.color'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Light } from '@babylonjs/core/Lights/light'
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { PointLight } from '@babylonjs/core/Lights/pointLight'
import { FlyCamera } from '@babylonjs/core/Cameras/flyCamera'
import Processor from './processor'
import { EngineInstrumentation } from '@babylonjs/core/Instrumentation/engineInstrumentation'
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation'
import '@babylonjs/core/Meshes/thinInstanceMesh'
import '@babylonjs/core/Engines/Extensions/engine.query'
import GPUPicker from './gpupicker'
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents'
import '@babylonjs/core/Rendering/'

// import '@babylonjs/core/Debug/debugLayer'
// import { Inspector } from '@babylonjs/inspector'

let ColorID = [0, 0, 0]
export default class Viewer {
   scene: Scene | undefined
   engine: Engine | null = null
   orbitCamera: ArcRotateCamera | null = null
   flyCamera: FlyCamera | null = null
   offscreenCanvas: OffscreenCanvas | HTMLCanvasElement
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
   offscreen: boolean = true
   lastFrameUpdate: number = 0
   renderTimeout: number = 1000
   maxFrameRate = 1000 / 999

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

   constructor() {}

   //Init message worker
   init_worker(data: any, worker: Worker) {
      this.offscreen = true
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

   init_direct(canvas: HTMLCanvasElement, fakeWorker) {
      this.offscreen = false
      this.offscreenCanvas = canvas
      this.worker = fakeWorker
   }

   setSizes(width, height) {
      if (this.offscreen) {
         //@ts-ignore
         this.offscreenCanvas.clientWidth = width
         //@ts-ignore
         this.offscreenCanvas.clientHeight = height
         this.offscreenCanvas.width = width
         this.offscreenCanvas.height = height

         this.rect.right = this.rect.width = width
         this.rect.bottom = this.rect.height = height
      }
      if (this.engine) {
         this.engine.resize()
         this.processor.gpuPicker.updateRenderTargetSize(this.engine.getRenderWidth(), this.engine.getRenderHeight())
      }
   }

   async initEngine(useWebGPU = true) {
      if (useWebGPU === undefined) useWebGPU = false
      console.info(`G-Code Viewer- Sindarius - 1 `)

      //this will use the offscreen rendering and web worker threads
      this.engine = new Engine(this.offscreenCanvas, true, {
         doNotHandleContextLost: true,
      }) //WebGPU does not currently have a constructor that takes offscreen canvas

      this.engine.enableOfflineSupport = false

      this.scene = new Scene(this.engine)

      // Inspector.Show(this.scene, {
      //    embedMode: true,
      // })

      this.scene.clearColor = new Color4(0.3, 0.3, 0.3, 1)
      //this.scene.useOrderIndependentTransparency = true
      //this.scene.depthPeelingRenderer.passCount = 2

      if (this.offscreen) {
         this.scene.doNotHandleCursors = true //We can't make cursor changes in the worker thread
      }
      //this.scene.performancePriority = ScenePerformancePriority.Intermediate //.Aggressive
      //this.scene.autoClear = true
      this.scene.skipPointerMovePicking = true

      this.processor.scene = this.scene
      this.processor.worker = this.worker
      this.processor.gpuPicker = new GPUPicker(
         this.scene,
         this.engine,
         this.offscreenCanvas.width,
         this.offscreenCanvas.height,
      )

      //Orbit Cam
      this.orbitCamera = new ArcRotateCamera('Camera', Math.PI / 2, 2.356194, 15, new Vector3(0, 0, 0), this.scene)
      this.orbitCamera.invertRotation = false
      this.orbitCamera.attachControl(this.offscreenCanvas, true)
      this.orbitCamera.maxZ = 100000
      this.orbitCamera.lowerRadiusLimit = 5
      this.orbitCamera.setPosition(new Vector3(150, 100, 0))
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

      this.pointLight = new PointLight('pl', new Vector3(0, 1, -1), this.scene)

      this.pointLight.diffuse = new Color3(1, 1, 1)
      this.pointLight.specular = new Color3(1, 1, 1)

      this.scene.render()

      //limit frames
      let deltaTime = 0
      this.engine.runRenderLoop(() => {
         if (document.hidden) return

         deltaTime += this.engine.getDeltaTime()
         if (deltaTime > this.maxFrameRate) {
            deltaTime = 0
         } else {
            return
         }

         this.pointLight.position = this.orbitCamera?.position ?? new Vector3(0, 0, 0)
         this.scene?.render()
         this.lastFrameUpdate = Date.now()
      })

      this.scene.onPointerObservable.add((pointerInfo) => {
         if (pointerInfo.type == PointerEventTypes.POINTERTAP) {
            try {
               if (this.processor.focusedColorId > 10) {
                  var pos = this.processor.gCodeLines[this.processor.focusedColorId].filePosition
                  this.processor.updateFilePosition(pos)
                  this.worker.postMessage({ type: 'positionupdate', position: pos })
               }
            } catch {}
         }
      })

      //this.loadInstrumentation()
   }

   isArcRotateCameraStopped(camera) {
      return (
         camera.inertialAlphaOffset === 0 &&
         camera.inertialBetaOffset === 0 &&
         camera.inertialRadiusOffset === 0 &&
         camera.inertialPanningX === 0 &&
         camera.inertialPanningY === 0
      )
   }

   loadInstrumentation() {
      let inst = new EngineInstrumentation(this.engine)
      inst.captureGPUFrameTime = true
      inst.captureShaderCompilationTime = true

      let sceneInst = new SceneInstrumentation(this.scene)

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

   async loadFile(file) {
      await this.processor.loadFile(file)
   }

   setMaxFPS(fps) {
      console.log(fps)
      if (fps <= 0) fps = 1
      this.maxFrameRate = 1000 / fps
   }

   //Send message to the main thread for events we want to bind to.
   bindHandler(targetName, eventName, fn, opt) {
      let id = `${targetName}${eventName}`
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

   unload() {
      this.engine.dispose()
      this.scene = null
      this.engine = null
      this.worker.postMessage({ type: 'unloadComplete', params: [] })
   }
}
