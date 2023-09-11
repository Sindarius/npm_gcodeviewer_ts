import ProcessorProperties from '../processorproperties'
import SlicerBase from './slicerbase'

export default class PrusaSlicer extends SlicerBase {
   featureList = {
      PERIMETER: { color: [1, 0.9, 0.3, 1], perimeter: false, support: false },
      'EXTERNAL PERIMETER': { color: [1, 0.5, 0.2, 1], perimeter: true, support: false },
      'INTERNAL INFILL': { color: [0.59, 0.19, 0.16, 1], perimeter: false, support: false },
      'SOLID INFILL': { color: [0.59, 0.19, 0.8, 1], perimeter: false, support: false },
      'TOP SOLID INFILL': { color: [0.95, 0.25, 0.25, 1], perimeter: true, support: false },
      'BRIDGE INFILL': { color: [0.3, 0.5, 0.73, 1], perimeter: false, support: false },
      'GAP FILL': { color: [1, 1, 1, 1], perimeter: false, support: false },
      SKIRT: { color: [0, 0.53, 0.43, 1], perimeter: false, support: false },
      'SKIRT/BRIM': { color: [0, 0.53, 0.43, 1], perimeter: false, support: false },
      'SUPPORTED MATERIAL': { color: [0, 1, 0, 1], perimeter: false, support: true },
      'SUPPORTED MATERIAL INTERFACE': { color: [0, 0.5, 0, 1], perimeter: false, support: true },
      CUSTOM: { color: [0.5, 0.5, 0.5, 1], perimeter: false, support: false },
      UNKNOWN: { color: [0.5, 0.5, 0.5, 1], perimeter: false, support: false },

      //Look up colors
      'SUPPORT MATERIAL': { color: [0.5, 0.5, 0.5, 1], perimeter: false, support: true },
      'SUPPORT MATERIAL INTERFACE': { color: [0.5, 0.5, 0.5, 1], perimeter: false, support: true },
      'OVERHANG PERIMETER': { color: [0.5, 0.5, 0.5, 1], perimeter: true, support: false },
      'WIPE TOWER': { color: [0.5, 0.5, 0.5, 1], perimeter: true, support: false },
   }

   constructor() {
      super()
      console.info('Prusa Slicer detected')
   }

   processComment(comment: string) {
      if (comment.startsWith(';TYPE:')) {
         this.feature = comment.substring(6).trim()
      }
   }

   getFeatureColor(): number[] {
      try {
         return this.featureList[this.feature].color
      } catch {
         return [1, 1, 1, 1]
      }
   }

   isPerimeter(): boolean {
      try {
         return this.featureList[this.feature].perimeter
      } catch {
         this.reportMissingFeature(this.feature)
         return false
      }
   }

   isSupport(): boolean {
      try {
         return this.featureList[this.feature].support
      } catch {
         this.reportMissingFeature(this.feature)
         return false
      }
   }

   processHeader(file: string[], props: ProcessorProperties) {
      try {
         for (let lineIdx = file.length - 350; lineIdx < file.length - 1; lineIdx++) {
            const line = file[lineIdx]

            //Pull out the nozzle diameter for each tool
            if (line.includes('nozzle_diameter')) {
               const equalSign = line.indexOf('=') + 1
               const diameters = line.substring(equalSign).split(',')
               for (let toolIdx = 0; toolIdx < diameters.length; toolIdx++) {
                  if (props.tools.length < toolIdx) {
                     props.tools[toolIdx].diameter = Number(diameters[toolIdx])
                  }
               }
            }
         }
      } catch (e) {
         console.error(e)
      }
   }
}
