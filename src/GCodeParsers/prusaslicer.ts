import ProcessorProperties from '../processorproperties'
import ParserBase from './parserbase'

export default class PrusaSlicer extends ParserBase {
   featureList = {
      Perimeter: { color: [1, 0.9, 0.3, 1], perimeter: false, support: false },
      'External perimeter': { color: [1, 0.5, 0.2, 1], perimeter: true, support: false },
      'Internal infill': { color: [0.59, 0.19, 0.16, 1], perimeter: false, support: false },
      'Solid infill': { color: [0.59, 0.19, 0.8, 1], perimeter: false, support: false },
      'Top solid infill': { color: [0.95, 0.25, 0.25, 1], perimeter: true, support: false },
      'Bridge infill': { color: [0.3, 0.5, 0.73, 1], perimeter: false, support: false },
      'Gap fill': { color: [1, 1, 1, 1], perimeter: false, support: false },
      Skirt: { color: [0, 0.53, 0.43, 1], perimeter: false, support: false },
      'Skirt/Brim': { color: [0, 0.53, 0.43, 1], perimeter: false, support: false },
      'Supported material': { color: [0, 1, 0, 1], perimeter: false, support: true },
      'Supported material interface': { color: [0, 0.5, 0, 1], perimeter: false, support: true },
      Custom: { color: [0.5, 0.5, 0.5, 1], perimeter: false, support: false },
      Unknown: { color: [0.5, 0.5, 0.5, 1], perimeter: false, support: false },

      //Look up colors
      'Support material': { color: [0.5, 0.5, 0.5, 1], perimeter: false, support: true },
      'Support material interface': { color: [0.5, 0.5, 0.5, 1], perimeter: false, support: true },
      'Overhang perimeter': { color: [0.5, 0.5, 0.5, 1], perimeter: true, support: false },
      'Wipe tower': { color: [0.5, 0.5, 0.5, 1], perimeter: true, support: false },
   }

   constructor() {
      super()
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
