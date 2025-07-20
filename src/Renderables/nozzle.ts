import { Scene } from '@babylonjs/core'

export default class Nozzle {
   nozzleDiameter: number = 0.4 // Default nozzle diameter in mm
   nozzleColor: string = '#FF0000' // Default color in hex format
   scene: Scene

   constructor(scene: Scene, diameter: number = 0.4, color: string = '#FF0000') {
      this.nozzleDiameter = diameter
      this.nozzleColor = color
      this.scene = scene
   }

   setDiameter(diameter: number): void {
      this.nozzleDiameter = diameter
   }

   setColor(color: string): void {
      this.nozzleColor = color
   }

   getDiameter(): number {
      return this.nozzleDiameter
   }

   /**
    * Returns a string representation of the nozzle properties.
    * @returns {string} A string describing the nozzle diameter and color.
    */
   toString(): string {
      return `Nozzle Diameter: ${this.nozzleDiameter} mm, Color: ${this.nozzleColor}`
   }
}
