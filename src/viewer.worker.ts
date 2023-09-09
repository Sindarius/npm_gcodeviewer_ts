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

         self.viewer = new Viewer(message.data, self)
         self.viewer.initEngine()

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
      // case 'reset':
      //    console.log('reset')
      //    switch (self.viewer.processor.modelMaterial.renderMode) {
      //       case 0:
      //          console.log('Tool Mode')
      //          self.viewer.processor.modelMaterial.updateRenderMode(1)
      //          break
      //       case 1:
      //          console.log('Feed Rate')
      //          self.viewer.processor.modelMaterial.updateRenderMode(2)
      //          break
      //       case 2:
      //          console.log('Color Index Mode')
      //          self.viewer.processor.modelMaterial.updateRenderMode(5)
      //          break
      //       case 5:
      //          console.log('Default Color Mode')
      //          self.viewer.processor.modelMaterial.updateRenderMode(0)
      //          break
      //    }
      //    break
      case 'updatecolortest':
         await self.viewer.processor.updateColorTest()
         break
      case 'updatefileposition':
         self.viewer.processor.updateFilePosition(message.data.position)
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
         self.viewer.processor.setMeshGeometry()
         break
      case 'setprogressmode':
         self.viewer.processor.modelMaterial.forEach((m) => m.setProgressMode(message.data.mode))
         break
   }
})
