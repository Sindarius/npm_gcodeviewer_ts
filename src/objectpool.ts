/**
 * Generic object pool for reducing garbage collection pressure
 */
export class ObjectPool<T> {
   private pool: T[] = []
   private createFn: () => T
   private resetFn?: (obj: T) => void
   private maxSize: number

   constructor(createFn: () => T, resetFn?: (obj: T) => void, maxSize: number = 1000) {
      this.createFn = createFn
      this.resetFn = resetFn
      this.maxSize = maxSize
   }

   /**
    * Get an object from the pool or create a new one
    */
   acquire(): T {
      const obj = this.pool.pop()
      if (obj) {
         return obj
      }
      return this.createFn()
   }

   /**
    * Return an object to the pool
    */
   release(obj: T): void {
      if (this.pool.length < this.maxSize) {
         if (this.resetFn) {
            this.resetFn(obj)
         }
         this.pool.push(obj)
      }
   }

   /**
    * Clear the pool
    */
   clear(): void {
      this.pool.length = 0
   }

   /**
    * Get current pool size
    */
   get size(): number {
      return this.pool.length
   }
}

/**
 * Specialized pools for common G-code objects
 */
export class GCodePools {
   private static instance: GCodePools

   // Pools for different buffer types
   matrixPool: ObjectPool<Float32Array>
   colorPool: ObjectPool<Float32Array>
   pickPool: ObjectPool<Float32Array>
   positionPool: ObjectPool<Float32Array>
   toolPool: ObjectPool<Float32Array>
   feedRatePool: ObjectPool<Float32Array>
   perimeterPool: ObjectPool<Float32Array>

   // Vector pools
   vector3Pool: ObjectPool<number[]>

   constructor() {
      // Initialize buffer pools
      this.matrixPool = new ObjectPool(
         () => new Float32Array(16 * 100000), // Default size for 100k segments
         (arr) => arr.fill(0),
         50 // Keep max 50 arrays
      )

      this.colorPool = new ObjectPool(
         () => new Float32Array(4 * 100000),
         (arr) => arr.fill(0),
         50
      )

      this.pickPool = new ObjectPool(
         () => new Float32Array(3 * 100000),
         (arr) => arr.fill(0),
         50
      )

      this.positionPool = new ObjectPool(
         () => new Float32Array(100000),
         (arr) => arr.fill(0),
         50
      )

      this.toolPool = new ObjectPool(
         () => new Float32Array(100000),
         (arr) => arr.fill(0),
         50
      )

      this.feedRatePool = new ObjectPool(
         () => new Float32Array(100000),
         (arr) => arr.fill(0),
         50
      )

      this.perimeterPool = new ObjectPool(
         () => new Float32Array(100000),
         (arr) => arr.fill(0),
         50
      )

      // Vector3 pool for frequently created coordinate arrays
      this.vector3Pool = new ObjectPool(
         () => [0, 0, 0],
         (arr) => {
            arr[0] = 0
            arr[1] = 0
            arr[2] = 0
         },
         1000
      )
   }

   static getInstance(): GCodePools {
      if (!GCodePools.instance) {
         GCodePools.instance = new GCodePools()
      }
      return GCodePools.instance
   }

   /**
    * Get buffers for a specific segment count
    */
   getBuffersForSegmentCount(segmentCount: number) {
      // Adjust buffer sizes based on actual need
      const matrixBuffer = new Float32Array(16 * segmentCount)
      const colorBuffer = new Float32Array(4 * segmentCount)
      const pickBuffer = new Float32Array(3 * segmentCount)
      const positionBuffer = new Float32Array(segmentCount)
      const toolBuffer = new Float32Array(segmentCount)
      const feedRateBuffer = new Float32Array(segmentCount)
      const perimeterBuffer = new Float32Array(segmentCount)

      return {
         matrixData: matrixBuffer,
         colorData: colorBuffer,
         pickData: pickBuffer,
         filePositionData: positionBuffer,
         fileEndPositionData: new Float32Array(segmentCount),
         toolData: toolBuffer,
         feedRate: feedRateBuffer,
         isPerimeter: perimeterBuffer
      }
   }

   /**
    * Release all buffers (currently just clears, could be enhanced to actually pool)
    */
   releaseBuffers(buffers: any): void {
      // For now, just let GC handle it
      // In a more advanced implementation, we could return appropriately sized buffers to pools
   }

   /**
    * Clear all pools
    */
   clearAll(): void {
      this.matrixPool.clear()
      this.colorPool.clear()
      this.pickPool.clear()
      this.positionPool.clear()
      this.toolPool.clear()
      this.feedRatePool.clear()
      this.perimeterPool.clear()
      this.vector3Pool.clear()
   }
}