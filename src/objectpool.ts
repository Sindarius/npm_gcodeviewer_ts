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

   // Interleaved buffer pool for memory optimization
   interleavedPool: ObjectPool<Float32Array>

   // Vector pools  
   vector3Pool: ObjectPool<number[]>
   
   // G-code object pools
   movePool: ObjectPool<any>

   constructor() {
      // Initialize buffer pools
      this.matrixPool = new ObjectPool(
         () => new Float32Array(16 * 100000), // Default size for 100k segments
         (arr) => arr.fill(0),
         50, // Keep max 50 arrays
      )

      this.colorPool = new ObjectPool(
         () => new Float32Array(4 * 100000),
         (arr) => arr.fill(0),
         50,
      )

      this.pickPool = new ObjectPool(
         () => new Float32Array(3 * 100000),
         (arr) => arr.fill(0),
         50,
      )

      this.positionPool = new ObjectPool(
         () => new Float32Array(100000),
         (arr) => arr.fill(0),
         50,
      )

      this.toolPool = new ObjectPool(
         () => new Float32Array(100000),
         (arr) => arr.fill(0),
         50,
      )

      this.feedRatePool = new ObjectPool(
         () => new Float32Array(100000),
         (arr) => arr.fill(0),
         50,
      )

      this.perimeterPool = new ObjectPool(
         () => new Float32Array(100000),
         (arr) => arr.fill(0),
         50,
      )

      // Interleaved buffer pool - 28 floats per instance, default 10k segments
      this.interleavedPool = new ObjectPool(
         () => new Float32Array(28 * 10000),
         (arr) => arr.fill(0),
         20, // Keep fewer large interleaved buffers
      )

      // Vector3 pool for frequently created coordinate arrays
      this.vector3Pool = new ObjectPool(
         () => [0, 0, 0],
         (arr) => {
            arr[0] = 0
            arr[1] = 0
            arr[2] = 0
         },
         1000,
      )
      
      // Move object pool - we'll store reusable move data structures
      this.movePool = new ObjectPool(
         () => ({
            tool: 0,
            start: [0, 0, 0],
            end: [0, 0, 0], 
            extruding: false,
            color: [1, 1, 1, 1],
            feedRate: 0,
            layerHeight: 0.2,
            isPerimeter: false,
            isSupport: false,
            colorId: [0, 0, 0],
            lineType: 'L'
         }),
         (obj) => {
            obj.tool = 0
            obj.start[0] = obj.start[1] = obj.start[2] = 0
            obj.end[0] = obj.end[1] = obj.end[2] = 0
            obj.extruding = false
            obj.color[0] = obj.color[1] = obj.color[2] = obj.color[3] = 1
            obj.feedRate = 0
            obj.layerHeight = 0.2
            obj.isPerimeter = false
            obj.isSupport = false
            obj.colorId[0] = obj.colorId[1] = obj.colorId[2] = 0
            obj.lineType = 'L'
         },
         2000
      )
   }

   static getInstance(): GCodePools {
      if (!GCodePools.instance) {
         GCodePools.instance = new GCodePools()
      }
      return GCodePools.instance
   }

   /**
    * Get a pooled Move-like object
    */
   acquireMove(): any {
      return this.movePool.acquire()
   }
   
   /**
    * Return a Move-like object to the pool
    */
   releaseMove(moveObj: any): void {
      this.movePool.release(moveObj)
   }
   
   /**
    * Get buffers for a specific segment count
    */
   getBuffersForSegmentCount(segmentCount: number) {
      // Use pools if available, otherwise create new buffers
      const matrixRequired = 16 * segmentCount
      const colorRequired = 4 * segmentCount
      const pickRequired = 3 * segmentCount
      
      // Get pooled buffers or create new ones if pool buffer is too small
      let matrixBuffer = this.matrixPool.acquire()
      if (matrixBuffer.length < matrixRequired) {
         this.matrixPool.release(matrixBuffer)
         matrixBuffer = new Float32Array(matrixRequired)
      }
      
      let colorBuffer = this.colorPool.acquire()
      if (colorBuffer.length < colorRequired) {
         this.colorPool.release(colorBuffer)
         colorBuffer = new Float32Array(colorRequired)
      }
      
      let pickBuffer = this.pickPool.acquire()
      if (pickBuffer.length < pickRequired) {
         this.pickPool.release(pickBuffer)
         pickBuffer = new Float32Array(pickRequired)
      }
      
      let positionBuffer = this.positionPool.acquire()
      if (positionBuffer.length < segmentCount) {
         this.positionPool.release(positionBuffer)
         positionBuffer = new Float32Array(segmentCount)
      }
      
      let toolBuffer = this.toolPool.acquire()
      if (toolBuffer.length < segmentCount) {
         this.toolPool.release(toolBuffer)
         toolBuffer = new Float32Array(segmentCount)
      }
      
      let feedRateBuffer = this.feedRatePool.acquire()
      if (feedRateBuffer.length < segmentCount) {
         this.feedRatePool.release(feedRateBuffer)
         feedRateBuffer = new Float32Array(segmentCount)
      }
      
      let perimeterBuffer = this.perimeterPool.acquire()
      if (perimeterBuffer.length < segmentCount) {
         this.perimeterPool.release(perimeterBuffer)
         perimeterBuffer = new Float32Array(segmentCount)
      }


      return {
         matrixData: matrixBuffer,
         colorData: colorBuffer,
         pickData: pickBuffer,
         filePositionData: positionBuffer,
         fileEndPositionData: new Float32Array(segmentCount),
         toolData: toolBuffer,
         feedRate: feedRateBuffer,
         isPerimeter: perimeterBuffer,
      }
   }

   /**
    * Release all buffers back to their respective pools
    */
   releaseBuffers(buffers: any): void {
      if (buffers.matrixData) {
         this.matrixPool.release(buffers.matrixData)
      }
      if (buffers.colorData) {
         this.colorPool.release(buffers.colorData)
      }
      if (buffers.pickData) {
         this.pickPool.release(buffers.pickData)
      }
      if (buffers.filePositionData) {
         this.positionPool.release(buffers.filePositionData)
      }
      if (buffers.toolData) {
         this.toolPool.release(buffers.toolData)
      }
      if (buffers.feedRate) {
         this.feedRatePool.release(buffers.feedRate)
      }
      if (buffers.isPerimeter) {
         this.perimeterPool.release(buffers.isPerimeter)
      }
      // no segmentLength buffer anymore
      // fileEndPositionData is not pooled, let GC handle it
   }

   /**
    * Get a pooled interleaved buffer for the given segment count
    */
   getInterleavedBuffer(segmentCount: number): Float32Array {
      const required = 28 * segmentCount // 28 floats per instance
      
      let buffer = this.interleavedPool.acquire()
      if (buffer.length < required) {
         this.interleavedPool.release(buffer)
         buffer = new Float32Array(required)
      }
      
      return buffer
   }

   /**
    * Release an interleaved buffer back to the pool
    */
   releaseInterleavedBuffer(buffer: Float32Array): void {
      this.interleavedPool.release(buffer)
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
      this.interleavedPool.clear()
      this.vector3Pool.clear()
   }
}
