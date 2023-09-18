import Viewer from './viewer'

export default class ViewerDirect {
   viewer: Viewer
   mainCanvas: HTMLCanvasElement | null = null
   passThru: any = null

   constructor(canvas: HTMLCanvasElement) {
      this.mainCanvas = canvas
      this.viewer = new Viewer()
      this.viewer.init_direct(canvas, this)
      this.viewer.initEngine()

      window.onresize = () => {
         this.viewer.setSizes(this.mainCanvas?.clientWidth, this.mainCanvas?.clientHeight)
      }
   }

   init(): void {}

   postMessage(message: any) {
      if (this.passThru) {
         this.passThru(message)
      }
   }

   cancel(): void {}

   loadFile(file): void {
      this.viewer.loadFile(file)
   }

   unload(): void {
      this.viewer.unload()
   }

   updateFilePosition(filePosition: number): void {
      this.viewer.processor.updateFilePosition(filePosition)
   }

   getGCodes(position: number, count: number): void {
      this.viewer.processor.getGCodeInRange(position, count)
   }

   goToLineNumber(lineNumber: number): void {
      this.viewer.processor.updateByLineNumber(lineNumber)
   }

   setAlphaMode(mode: boolean): void {
      this.viewer.processor.modelMaterial.forEach((m) => m.setAlphaMode(mode))
   }

   setProgressMode(mode: boolean): void {
      this.viewer.processor.modelMaterial.forEach((m) => m.setProgressMode(mode))
   }

   setRenderMode(mode: number): void {
      this.viewer.processor.modelMaterial.forEach((m) => m.updateRenderMode(mode))
   }

   setMaxFPS(fps: number): void {
      this.viewer.setMaxFPS(fps)
   }

   setMeshMode(mode: number): void {
      this.viewer.processor.setMeshMode(mode)
   }

   setPerimeterOnly(perimeterOnly: boolean): void {
      this.viewer.processor.setPerimeterOnly(perimeterOnly)
   }
}
