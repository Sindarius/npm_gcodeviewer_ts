// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

import Viewer from './viewer'

self.viewer = null //Main instance of the viewer.

self.addEventListener('message', async (message) => {
   //console.info('Message received from main thread', message.data)

   let setTimeoutPromise = (timeout) =>
      new Promise((resolve) => {
         setTimeout(resolve, timeout)
      })

   switch (message.data.type) {
      case 'init':
         self.window = {
            addEventListener: (event, fn, opt) => {
               self.viewer.bindHandler('window', event, fn, opt)
            },
            setTimeout: self.setTimeout.bind(self),
            PointerEvent: true,
         }

         self.document = {
            addEventListener: (event, fn, opt) => {
               self.viewer.bindHandler('document', event, fn, opt)
            },
            // Uses to detect wheel event like at src/Inputs/scene.inputManager.ts:797
            createElement: function () {
               return { onwheel: true }
            },
            elementFromPoint: function () {
               return null
            },
            defaultView: self.window,
         }

         self.viewer = new Viewer()
         self.viewer.init_worker(message.data, self)
         self.viewer.initEngine()
         // Pre-enable WASM processing by default for performance
         try {
            await self.viewer.processor.enableWasmProcessing()
            self.postMessage({ type: 'wasmInitialized', success: true })
         } catch (error) {
            self.postMessage({ type: 'wasmInitialized', success: false, error: error?.message || 'WASM init failed' })
         }

         break
      case 'event': //UI Event
         self.viewer.handleEvent(message.data.type, message.data)
         break
      case 'resize': //Resize event was fired
         self.viewer.setSizes(message.data.width, message.data.height)
         break
      case 'loadFile':
         self.viewer.loadFile(message.data.file)
         break
      case 'unload':
         self.viewer.unload()
         break
      case 'rendermode':
         self.viewer.processor.modelMaterial.forEach((m) => m.updateRenderMode(message.data.mode))
         break
      case 'updatecolortest':
         await self.viewer.processor.updateColorTest()
         break
      case 'updatefileposition':
         self.viewer.processor.updateFilePosition(message.data.position, message.data.animate || false)
         break
      case 'getgcodes':
         {
            await self.viewer.processor.getGCodeInRange(message.data.position, message.data.count)
         }
         break
      case 'gotolinenumber':
         self.viewer.processor.updateByLineNumber(message.data.lineNumber)
         break
      case 'setalphamode':
         self.viewer.processor.modelMaterial.forEach((m) => m.setAlphaMode(message.data.mode))
         break
      case 'setprogressmode':
         self.viewer.processor.modelMaterial.forEach((m) => m.setProgressMode(message.data.mode))
         break
      case 'setmeshmode':
         self.viewer.processor.setMeshMode(message.data.mode)
         break
      case 'setfps':
         self.viewer.setMaxFPS(message.data.fps)
         break
      case 'setPickingEnabled':
         if (self.viewer?.processor?.gpuPicker) {
            self.viewer.processor.gpuPicker.setEnabled(!!message.data.enabled)
         }
         break
      case 'setPickingRate':
         if (self.viewer?.processor?.gpuPicker) {
            // message.data can be hz or throttleMs; honor ms if present
            if (typeof message.data.throttleMs === 'number') {
               self.viewer.processor.gpuPicker.setThrottleMs(message.data.throttleMs)
            } else if (typeof message.data.hz === 'number' && message.data.hz > 0) {
               const ms = Math.floor(1000 / message.data.hz)
               self.viewer.processor.gpuPicker.setThrottleMs(ms)
            }
         }
         break
      case 'perimeterOnly':
         self.viewer.processor.setPerimeterOnly(message.data.perimeterOnly)
         break
      case 'toggleNozzle':
         {
            const nozzle = self.viewer.processor.getNozzle()
            if (nozzle) {
               if (message.data.visible) {
                  nozzle.show()
               } else {
                  nozzle.hide()
               }
            }
         }
         break
      case 'startNozzleAnimation':
         self.viewer.processor.startNozzleAnimation()
         break
      case 'pauseNozzleAnimation':
         self.viewer.processor.pauseNozzleAnimation()
         break
      case 'resumeNozzleAnimation':
         self.viewer.processor.resumeNozzleAnimation()
         break
      case 'stopNozzleAnimation':
         self.viewer.processor.stopNozzleAnimation()
         break
      case 'enableWasmProcessing':
         try {
            await self.viewer.processor.enableWasmProcessing()
            self.postMessage({ type: 'wasmInitialized', success: true })
         } catch (error) {
            self.postMessage({ 
               type: 'wasmInitialized', 
               success: false, 
               error: error.message 
            })
         }
         break
      case 'getProcessingStats':
         self.postMessage({ 
            type: 'processingStatsResponse', 
            stats: self.viewer.processor.getProcessingStats() 
         })
         break
   }
})
