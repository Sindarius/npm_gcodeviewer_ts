export enum LODLevel {
   HIGH = 0,     // Box mesh - full detail
   MEDIUM = 1,   // Cylinder mesh - medium detail
   LOW = 2       // Line mesh - low detail
}

export interface LODConfig {
   maxSegmentsHigh: number
   maxSegmentsMedium: number
   maxSegmentsLow: number
   distanceThresholds: number[]
}

export default class LODManager {
   private config: LODConfig

   constructor(config?: Partial<LODConfig>) {
      this.config = {
         maxSegmentsHigh: 100000,      // Use high detail up to 100k segments
         maxSegmentsMedium: 500000,    // Use medium detail up to 500k segments  
         maxSegmentsLow: 2000000,      // Use low detail up to 2M segments
         distanceThresholds: [50, 200, 1000], // Camera distance thresholds
         ...config
      }
   }

   /**
    * Determine the appropriate LOD level based on segment count
    */
   getLODBySegmentCount(segmentCount: number): LODLevel {
      if (segmentCount <= this.config.maxSegmentsHigh) {
         return LODLevel.HIGH
      } else if (segmentCount <= this.config.maxSegmentsMedium) {
         return LODLevel.MEDIUM
      } else {
         return LODLevel.LOW
      }
   }

   /**
    * Determine the appropriate LOD level based on camera distance
    */
   getLODByDistance(distance: number): LODLevel {
      const thresholds = this.config.distanceThresholds
      
      if (distance < thresholds[0]) {
         return LODLevel.HIGH
      } else if (distance < thresholds[1]) {
         return LODLevel.MEDIUM
      } else {
         return LODLevel.LOW
      }
   }

   /**
    * Get combined LOD level considering both segment count and distance
    * Takes the lower detail level between the two factors
    */
   getCombinedLOD(segmentCount: number, cameraDistance: number): LODLevel {
      const segmentLOD = this.getLODBySegmentCount(segmentCount)
      const distanceLOD = this.getLODByDistance(cameraDistance)
      
      // Return the lower detail level (higher enum value)
      return Math.max(segmentLOD, distanceLOD) as LODLevel
   }

   /**
    * Determine if we should render this mesh chunk based on LOD
    */
   shouldRenderChunk(
      segmentCount: number, 
      cameraDistance: number, 
      targetLOD: LODLevel
   ): boolean {
      const requiredLOD = this.getCombinedLOD(segmentCount, cameraDistance)
      return requiredLOD <= targetLOD
   }

   /**
    * Get adaptive breakpoint based on current performance
    */
   getAdaptiveBreakpoint(
      currentFPS: number, 
      targetFPS: number = 30,
      baseBreakpoint: number = 100000
   ): number {
      const fpsRatio = currentFPS / targetFPS
      
      if (fpsRatio < 0.8) {
         // Performance is poor, reduce detail
         return Math.max(baseBreakpoint * 0.5, 50000)
      } else if (fpsRatio > 1.2) {
         // Performance is good, can increase detail
         return Math.min(baseBreakpoint * 1.5, 200000)
      }
      
      return baseBreakpoint
   }

   /**
    * Update LOD configuration at runtime
    */
   updateConfig(newConfig: Partial<LODConfig>): void {
      this.config = { ...this.config, ...newConfig }
   }

   /**
    * Get current configuration
    */
   getConfig(): LODConfig {
      return { ...this.config }
   }
}