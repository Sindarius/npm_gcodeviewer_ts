import { Base, Move, ArcMove, Move_Thin, Comment } from './GCodeLines'
import ProcessorProperties from './processorProperties'
import { ProcessLine } from './GCodeCommands/processline'
import { Scene } from '@babylonjs/core/scene'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Axis, Space } from '@babylonjs/core/Maths/math.axis'
import '@babylonjs/core/Meshes/thinInstanceMesh'
import GPUPicker from './gpupicker'
import { colorToNum, delay, binarySearchClosest } from './util'
import ModelMaterial from './modelmaterial'
import { MoveData } from './GCodeLines/move'
import { slicerFactory } from './GCodeParsers/slicerfactory'
import LineShaderMaterial from './lineshader'
import LODManager, { LODLevel } from './lodmanager'
import { GCodePools } from './objectpool'
import Nozzle from './Renderables/nozzle'
import { WasmProcessor } from './wasmprocessor'

export default class Processor {
   gCodeLines: Base[] = []
   processorProperties: ProcessorProperties = new ProcessorProperties()
   scene: Scene
   meshes: Mesh[] = []
   breakPoint = 100000
   gpuPicker: GPUPicker
   worker: Worker
   //modelMaterial: ModelMaterial[]
   modelMaterial: LineShaderMaterial[]
   filePosition: number = 0
   maxIndex: number = 0
   focusedColorId = 0
   lastMeshMode = 0
   perimeterOnly = false
   originalFile: string //May or may not keep this. May force front end to reprovide or cache file.
   lodManager: LODManager
   objectPools: GCodePools
   nozzle: Nozzle | null = null
   // Track position data for nozzle animation since Move objects get replaced with Move_Thin
   positionTracker: Map<number, { x: number; y: number; z: number; feedRate: number; extruding: boolean }> = new Map()
   // Animation playback state
   private isPlaying: boolean = false
   private playbackTimeout: number | null = null
   private sortedPositions: number[] = []
   // Progress tracking optimization
   private lastReportedProgress: number = 0
   private lastReportedChunk: number = 0
   // WASM processor for fast parsing
   private wasmProcessor: WasmProcessor | null = null
   // Processing method tracking
   private lastProcessingMethod: 'typescript' | 'wasm' | 'hybrid' | 'none' = 'none'
   private processingStats: {
      method: string
      wasmEnabled: boolean
      wasmVersion?: string
      totalTime?: number
      wasmTime?: number
      typescriptTime?: number
      wasmRenderTime?: number
      linesProcessed?: number
      movesFound?: number
      positionsExtracted?: number
      renderSegmentsGenerated?: number
   } = { method: 'none', wasmEnabled: false }

   constructor() {
      this.lodManager = new LODManager()
      this.objectPools = GCodePools.getInstance()
   }

   async enableWasmProcessing(): Promise<void> {
      if (!this.wasmProcessor) {
         this.wasmProcessor = new WasmProcessor()
         await this.wasmProcessor.initialize()
         this.processingStats.wasmEnabled = true
         console.log('WASM processing enabled for G-code parsing')
      }
   }

   getProcessingMethod(): string {
      return this.lastProcessingMethod
   }

   getProcessingStats() {
      return { ...this.processingStats }
   }

   isWasmEnabled(): boolean {
      return this.wasmProcessor !== null && this.processingStats.wasmEnabled
   }

   private async getWasmVersion(): Promise<string> {
      try {
         const { get_version } = await import('../WASM_FileProcessor/pkg/gcode_file_processor')
         return get_version()
      } catch {
         return 'unknown'
      }
   }

   initNozzle(diameter: number = 0.4) {
      if (this.scene) {
         this.nozzle = new Nozzle(this.scene, diameter)
         // Default to 1x (real-time) animation; controllable via setPlaybackSpeed
         this.nozzle.setAnimationSpeed(1.0)
         console.log('Nozzle initialized and ready for animation')
      }
   }

   getNozzle(): Nozzle | null {
      return this.nozzle
   }

   cleanup() {
      this.gpuPicker.clearRenderList()
      for (let idx = 0; idx < this.meshes.length; idx++) {
         this.scene.removeMesh(this.meshes[idx], true)
         this.meshes[idx].dispose(false, true)
      }
      this.meshes = []
      this.modelMaterial = []

      // Note: Don't dispose WASM processor here - it should persist across file loads
   }

   dispose() {
      // Clean up WASM processor only when processor itself is disposed
      if (this.wasmProcessor) {
         this.wasmProcessor.dispose()
         this.wasmProcessor = null
      }
   }

   async loadFile(file) {
      this.originalFile = file
      this.cleanup()
      this.gCodeLines = []
      this.processorProperties = new ProcessorProperties() //Reset for now
      this.processorProperties.slicer = slicerFactory(file)

      // Reset progress indicator early so UI shows immediately
      this.lastReportedProgress = 0
      this.lastReportedChunk = 0
      this.worker.postMessage({ type: 'progress', progress: 0, label: 'Loading file' })

      // Reset processing stats
      const startTime = performance.now()
      this.processingStats = {
         method: 'none',
         wasmEnabled: this.wasmProcessor !== null,
         wasmVersion: this.wasmProcessor ? await this.getWasmVersion() : undefined,
         linesProcessed: 0,
         movesFound: 0,
         positionsExtracted: 0,
      }

      console.log('Processing file')

      // Try WASM processing first for better performance, fallback to TypeScript
      if (this.wasmProcessor) {
         await this.loadFileWithWasm(file)
      } else {
         console.log('Using TypeScript parser (WASM not enabled)')
         this.lastProcessingMethod = 'typescript'
         this.processingStats.method = 'typescript'
         await this.loadFileStreamed(file)
      }

      // Calculate total processing time
      this.processingStats.totalTime = performance.now() - startTime

      // Send processing complete event with statistics
      this.worker.postMessage({
         type: 'processingComplete',
         stats: this.getProcessingStats(),
      })

      // Log final processing summary
      const totalLines = this.processingStats.linesProcessed || this.gCodeLines.length
      const processingSpeed = totalLines / ((this.processingStats.totalTime || 1) / 1000)
      console.info(
         `📊 Processing Complete: ${this.processingStats.method.toUpperCase()} method, ${totalLines.toLocaleString()} lines in ${(
            this.processingStats.totalTime || 0
         ).toFixed(0)}ms (${Math.round(processingSpeed).toLocaleString()} lines/sec)`,
      )

      console.info('File Loaded.... Rendering Vertices')

      // Check if we have WASM render buffers available
      const wasmBuffers = (this as any).wasmRenderBuffers
      if (wasmBuffers && wasmBuffers.segmentCount > 0) {
         console.log(`🚀 Using WASM render buffers directly for ${wasmBuffers.segmentCount} segments`)
         await this.buildMeshesFromWasmBuffers(wasmBuffers)
      } else {
         console.log('📦 Using traditional progressive rendering')
         await this.testRenderSceneProgressive()
      }

      //This is driving picking
      this.gpuPicker.colorTestCallBack = (colorId) => {
         let id = colorToNum(colorId) - 1
         this.focusedColorId = id
         if (this.gCodeLines[id] && id > 0) {
            let o = this.gCodeLines[id]

            this.worker.postMessage({
               type: 'currentline',
               line: o.line,
               lineNumber: o.lineNumber,
               filePosition: o.filePosition,
            })
            this.modelMaterial.forEach((m) => m.setPickColor(colorId))
         }
      }

      this.modelMaterial.forEach((m) => m.setMaxFeedRate(this.processorProperties.maxFeedRate))
      this.modelMaterial.forEach((m) => m.setMinFeedRate(this.processorProperties.minFeedRate))

      this.modelMaterial.forEach((m) =>
         m.updateCurrentFilePosition(this.gCodeLines[this.gCodeLines.length - 1].filePosition),
      ) //Set it to the end
      this.gpuPicker.updateCurrentPosition(this.gCodeLines[this.gCodeLines.length - 1].filePosition)

      // Ensure we have valid start/end values
      let startByte = this.processorProperties.firstGCodeByte
      let endByte = this.processorProperties.lastGCodeByte

      // Fallback to file bounds if no G-code lines were found
      if (startByte === 0 && endByte === 0 && this.gCodeLines.length > 0) {
         startByte = this.gCodeLines[0].filePosition
         endByte = this.gCodeLines[this.gCodeLines.length - 1].filePosition
      }

      this.worker.postMessage({
         type: 'fileloaded',
         start: startByte,
         end: endByte,
      })

      // Initialize nozzle position to start of print using WASM positions when available
      if (this.nozzle) {
         const firstIndex = 0
         if (this.sortedPositions && this.sortedPositions.length > 0) {
            const posData = this.getPositionDataForIndex(firstIndex)
            if (posData) {
               this.nozzle.setPosition({ x: posData.x, y: posData.y, z: posData.z })
            }
         }
      }

      this.setMeshMode(this.lastMeshMode)
   }

   private async loadFileStreamed(file: string) {
      const chunkSize = 100000 // Process 10k lines at a time
      let pos = 0

      // Track TypeScript processing if not already set
      if (this.lastProcessingMethod === 'none') {
         this.lastProcessingMethod = 'typescript'
         this.processingStats.method = 'typescript'
      }

      // Estimate line count for pre-allocation (average ~40 chars per line)
      const estimatedLines = Math.ceil(file.length / 40)

      // Pre-allocate arrays with estimated capacity + 20% buffer
      const capacity = Math.ceil(estimatedLines * 1.2)
      this.gCodeLines = [] // Start with empty array, will grow as needed

      // Clear position tracker for new file
      this.positionTracker.clear()
      this.sortedPositions = []

      // Reset progress tracking
      this.lastReportedProgress = 0
      this.lastReportedChunk = 0

      // Pre-allocate position tracking arrays
      let estimatedMoves = Math.ceil(estimatedLines * 0.7) // ~70% of lines are moves
      let tempPositions: number[] = new Array(estimatedMoves)
      let tempPositionData: Array<{ x: number; y: number; z: number; feedRate: number; extruding: boolean }> =
         new Array(estimatedMoves)
      let positionCount = 0

      // Stream through file character by character instead of split('\n')
      const lines = this.streamLines(file)

      for (let chunkStart = 0; chunkStart < lines.length; chunkStart += chunkSize) {
         const chunkEnd = Math.min(chunkStart + chunkSize, lines.length)

         // Process chunk
         for (let idx = chunkStart; idx < chunkEnd; idx++) {
            const line = lines[idx]
            this.processorProperties.lineNumber = idx + 1 //Use one index to match file
            this.processorProperties.filePosition = pos
            pos += line.length + 1 //Account for newlines that have been stripped

            let gcodeLine: Base
            try {
               gcodeLine = ProcessLine(this.processorProperties, line)
            } catch (error) {
               console.error(`Error processing line ${idx + 1}: "${line}"`, error)
               // Fallback to a comment to preserve indexing
               gcodeLine = new Comment(this.processorProperties, line)
            }
            this.gCodeLines.push(gcodeLine)

            // Batch store position data for nozzle tracking
            if (gcodeLine.lineType === 'L') {
               const move = gcodeLine as Move
               if (move.end && Array.isArray(move.end) && move.end.length >= 3) {
                  // Expand arrays if we exceed initial estimate
                  if (positionCount >= estimatedMoves) {
                     const newSize = Math.ceil(estimatedMoves * 1.5)
                     const newPositions = new Array(newSize)
                     const newData = new Array(newSize)

                     // Copy existing data
                     for (let i = 0; i < positionCount; i++) {
                        newPositions[i] = tempPositions[i]
                        newData[i] = tempPositionData[i]
                     }

                     tempPositions = newPositions
                     tempPositionData = newData
                     estimatedMoves = newSize
                     console.log('Expanded position arrays to', newSize, 'entries')
                  }

                  tempPositions[positionCount] = move.filePosition
                  tempPositionData[positionCount] = {
                     x: move.end[0],
                     y: move.end[1],
                     z: move.end[2],
                     feedRate: move.feedRate || 1500,
                     extruding: move.extruding,
                  }
                  positionCount++
               }
            }
         }

         // Report progress less frequently (every 2% or every 50k lines)
         const progress = chunkEnd / lines.length
         if (progress - this.lastReportedProgress >= 0.02 || chunkEnd - this.lastReportedChunk >= 50000) {
            this.worker.postMessage({
               type: 'progress',
               progress: progress,
               label: 'Processing file',
            })
            this.lastReportedProgress = progress
            this.lastReportedChunk = chunkEnd
         }

         // Yield control to prevent blocking UI
         if (chunkEnd < lines.length) {
            await new Promise((resolve) => setTimeout(resolve, 0))
         }
      }

      this.worker.postMessage({ type: 'progress', progress: 1, label: 'Processing file' })

      // Batch transfer position data to final data structures
      console.log('Transferring', positionCount, 'positions to tracker')

      // Pre-allocate final arrays with actual count
      this.sortedPositions = new Array(positionCount)

      for (let i = 0; i < positionCount; i++) {
         const filePos = tempPositions[i]
         this.positionTracker.set(filePos, tempPositionData[i])
         this.sortedPositions[i] = filePos
      }

      // Sort positions for sequential playback (more efficient on pre-allocated array)
      this.sortedPositions.sort((a, b) => a - b)
   }

   private async loadFileWithWasm(file: string) {
      console.log('🚀 Using WASM parser for fast processing')

      try {
         const wasmStartTime = performance.now()

         // Process file with WASM for position extraction and basic analysis
         const result = await this.wasmProcessor!.processFile(file, (progress: number, label: string) => {
            this.worker.postMessage({
               type: 'progress',
               progress: progress,
               label: `WASM: ${label}`,
            })
         })

         const wasmEndTime = performance.now()
         this.processingStats.wasmTime = wasmEndTime - wasmStartTime

         if (!result.success) {
            console.warn('❌ WASM processing failed, falling back to TypeScript parser:', result.errorMessage)
            this.lastProcessingMethod = 'typescript'
            this.processingStats.method = 'typescript-fallback'
            await this.loadFileStreamed(file)
            return
         }

         const linesPerSecond = Math.round(result.lineCount / (result.processingTimeMs / 1000))
         console.log(
            `✅ WASM processed ${result.lineCount.toLocaleString()} lines with ${result.moveCount.toLocaleString()} moves in ${
               result.processingTimeMs
            }ms (${linesPerSecond.toLocaleString()} lines/sec)`,
         )

         // Update processing statistics
         this.processingStats.linesProcessed = result.lineCount
         this.processingStats.movesFound = result.moveCount
         this.lastProcessingMethod = 'hybrid'
         this.processingStats.method = 'hybrid'

         // Get position data from WASM
         const sortedPositions = this.wasmProcessor!.getSortedPositions()
         this.positionTracker.clear()
         this.sortedPositions = Array.from(sortedPositions)
         this.processingStats.positionsExtracted = sortedPositions.length

         // No JS-side Map needed; we'll query WASM on demand for position data

         // Generate render buffers using WASM for maximum speed
         const renderStartTime = performance.now()
         console.log('🚀 Generating render buffers with WASM...')

         try {
            const wasmRenderBuffers = this.wasmProcessor!.generateRenderBuffers(
               0.4,
               0,
               (progress: number, label: string) => {
                  this.worker.postMessage({
                     type: 'progress',
                     progress: progress,
                     label: label,
                  })
               },
            )
            //const renderTime = performance.now() - renderStartTime
            //console.log(`✅ WASM generated ${wasmRenderBuffers.segmentCount.toFixed(2)} render segments in ${renderTime.toFixed(2)}ms`)

            // Store render buffers for mesh creation
            ;(this as any).wasmRenderBuffers = wasmRenderBuffers
            // this.processingStats.wasmRenderTime = renderTime
            this.processingStats.renderSegmentsGenerated = wasmRenderBuffers.segmentCount

            // Still need to create G-code line objects for compatibility with existing code
            console.log('🔧 Building TypeScript G-code objects for compatibility...')
            const compatStartTime = performance.now()

            // Reset processor state for TypeScript parsing phase
            this.processorProperties = new ProcessorProperties()
            this.processorProperties.slicer = slicerFactory(file)

            await this.loadFileStreamedWithPositions(file)
            const compatTime = performance.now() - compatStartTime
            console.log(`🔧 TypeScript compatibility objects created in ${compatTime.toFixed(2)}ms`)
         } catch (error) {
            console.error('❌ WASM render buffer generation failed:', error)
            console.warn('🔄 Using TypeScript fallback for rendering...')
            // Fallback to TypeScript rendering
            const tsStartTime = performance.now()
            console.log('🔧 Building TypeScript G-code objects for rendering...')

            // Reset processor state for TypeScript parsing phase
            this.processorProperties = new ProcessorProperties()
            this.processorProperties.slicer = slicerFactory(file)

            await this.loadFileStreamedWithPositions(file)
            this.processingStats.typescriptTime = performance.now() - tsStartTime
         }

         // Report final performance comparison
         const totalWasmTime = (this.processingStats.wasmTime || 0) + (this.processingStats.typescriptTime || 0)
         const efficiency = this.processingStats.wasmTime
            ? Math.round((this.processingStats.wasmTime / totalWasmTime) * 100)
            : 0
         console.log(`🎯 Hybrid processing complete - WASM: ${efficiency}%, TypeScript: ${100 - efficiency}%`)
      } catch (error) {
         console.error('💥 WASM processing error, falling back to TypeScript parser:', error)
         this.lastProcessingMethod = 'typescript'
         this.processingStats.method = 'typescript-fallback'
         await this.loadFileStreamed(file)
      }
   }

   private async loadFileStreamedWithPositions(file: string) {
      // Lightweight version of loadFileStreamed that leverages WASM position data
      const chunkSize = 10000
      let pos = 0

      const lines = this.streamLines(file)

      // Reset processor properties for TypeScript processing
      this.processorProperties.lineNumber = 0
      this.processorProperties.filePosition = 0

      for (let chunkStart = 0; chunkStart < lines.length; chunkStart += chunkSize) {
         const chunkEnd = Math.min(chunkStart + chunkSize, lines.length)

         // Process chunk with error handling
         for (let idx = chunkStart; idx < chunkEnd; idx++) {
            try {
               const line = lines[idx]
               this.processorProperties.lineNumber = idx + 1
               this.processorProperties.filePosition = pos
               pos += line.length + 1

               // Skip temperature commands that aren't visualized (M104, M109, M140, M190, etc.)
               const trimmedLine = line.trim().toUpperCase()
               if (
                  trimmedLine.startsWith('M104') ||
                  trimmedLine.startsWith('M109') ||
                  trimmedLine.startsWith('M140') ||
                  trimmedLine.startsWith('M190') ||
                  trimmedLine.startsWith('M155')
               ) {
                  // Create a simple comment object for temperature commands to maintain line count
                  const gcodeLine = ProcessLine(this.processorProperties, ';' + line)
                  this.gCodeLines.push(gcodeLine)
                  continue
               }

               const gcodeLine = ProcessLine(this.processorProperties, line)
               this.gCodeLines.push(gcodeLine)
            } catch (error) {
               console.error(`Error processing line ${idx + 1}: "${lines[idx]}"`, error)
               // Continue processing other lines
            }
         }

         // Report progress less frequently
         const progress = chunkEnd / lines.length
         if (progress - this.lastReportedProgress >= 0.02 || chunkEnd - this.lastReportedChunk >= 50000) {
            this.worker.postMessage({
               type: 'progress',
               progress: progress,
               label: 'Building render objects',
            })
            this.lastReportedProgress = progress
            this.lastReportedChunk = chunkEnd
         }

         // Yield control
         if (chunkEnd < lines.length) {
            await new Promise((resolve) => setTimeout(resolve, 0))
         }
      }
   }

   addNewMaterial(): LineShaderMaterial {
      let m = new LineShaderMaterial(this.scene)
      this.modelMaterial.push(m)
      return m
   }

   async testRenderScene() {
      const renderlines = []
      let tossCount = 0

      let segmentCount = 0
      let lastRenderedIdx = 0
      let alphaIndex = 0

      for (let idx = 0; idx < this.gCodeLines.length - 1; idx++) {
         let gCodeline = this.gCodeLines[idx] as Move
         if (this.perimeterOnly && !gCodeline.isPerimeter) {
            this.gCodeLines[idx] = new Move_Thin(this.processorProperties, gCodeline as Move, null, idx)
            tossCount++
            continue
         }
         try {
            if (gCodeline.lineType === 'L' && gCodeline.extruding) {
               //Regular move
               renderlines.push(gCodeline)
               segmentCount++
            } else if (gCodeline.lineType === 'A' && gCodeline.extruding) {
               //Arc Move
               renderlines.push(gCodeline)
               segmentCount += (this.gCodeLines[idx] as ArcMove).segments.length
            } else if (gCodeline.lineType === 'T') {
               //Travel
               renderlines.push(gCodeline)
               segmentCount++
            } else {
               tossCount++
            }
         } catch (ex) {
            console.log(this.gCodeLines[idx], ex)
         }

         if (segmentCount >= this.breakPoint) {
            alphaIndex++
            let sl = renderlines.slice(lastRenderedIdx)
            let rl = this.testBuildMesh(sl, segmentCount, alphaIndex)
            this.meshes.push(...rl)
            this.gpuPicker.addToRenderList(rl[0]) //use the box mesh for all picking
            lastRenderedIdx = renderlines.length
            segmentCount = 0

            this.worker.postMessage({
               type: 'progress',
               progress: idx / this.gCodeLines.length,
               label: 'Generating model.',
            })
         }
      }

      if (segmentCount > 0) {
         let sl = renderlines.slice(lastRenderedIdx)
         let rl = this.testBuildMesh(sl, segmentCount, alphaIndex)
         this.meshes.push(...rl)
         this.gpuPicker.addToRenderList(rl[0]) //use the box mesh for all picking
      }

      this.worker.postMessage({
         type: 'progress',
         progress: 1,
         label: 'Generating model.',
      })

      this.modelMaterial.forEach((m) => {
         m.updateCurrentFilePosition(this.filePosition)
         m.updateToolColors(this.processorProperties.buildToolFloat32Array())
      })
   }

   async testRenderSceneProgressive() {
      const renderlines = []
      let tossCount = 0
      let segmentCount = 0
      let lastRenderedIdx = 0
      let alphaIndex = 0
      const chunkSize = 50000 // Process meshes in smaller chunks

      for (let idx = 0; idx < this.gCodeLines.length - 1; idx++) {
         let gCodeline = this.gCodeLines[idx] as Move
         if (this.perimeterOnly && !gCodeline.isPerimeter) {
            this.gCodeLines[idx] = new Move_Thin(this.processorProperties, gCodeline as Move, null, idx)
            tossCount++
            continue
         }
         try {
            if (gCodeline.lineType === 'L' && gCodeline.extruding) {
               //Regular move
               renderlines.push(gCodeline)
               segmentCount++
            } else if (gCodeline.lineType === 'A' && gCodeline.extruding) {
               //Arc Move
               renderlines.push(gCodeline)
               segmentCount += (this.gCodeLines[idx] as ArcMove).segments.length
            } else if (gCodeline.lineType === 'T') {
               //Travel
               renderlines.push(gCodeline)
               segmentCount++
            } else {
               tossCount++
            }
         } catch (ex) {
            console.log(this.gCodeLines[idx], ex)
         }

         // Use adaptive breakpoint based on LOD
         const adaptiveBreakpoint = this.lodManager.getAdaptiveBreakpoint(60, 30, this.breakPoint)

         if (segmentCount >= adaptiveBreakpoint) {
            alphaIndex++

            // Determine LOD level for this chunk
            const lodLevel = this.lodManager.getLODBySegmentCount(segmentCount)

            let sl = renderlines.slice(lastRenderedIdx)
            let rl = this.testBuildMeshWithLOD(sl, segmentCount, alphaIndex, lodLevel)
            this.meshes.push(...rl)
            this.gpuPicker.addToRenderList(rl[0]) //use the box mesh for all picking
            lastRenderedIdx = renderlines.length
            segmentCount = 0

            this.worker.postMessage({
               type: 'progress',
               progress: idx / this.gCodeLines.length,
               label: 'Generating model.',
            })

            // Yield control every few mesh generations
            if (alphaIndex % 5 === 0) {
               await new Promise((resolve) => setTimeout(resolve, 0))
            }
         }
      }

      if (segmentCount > 0) {
         let sl = renderlines.slice(lastRenderedIdx)
         // Use LOD for final chunk as well
         const lodLevel = this.lodManager.getLODBySegmentCount(segmentCount)
         let rl = this.testBuildMeshWithLOD(sl, segmentCount, alphaIndex, lodLevel)
         this.meshes.push(...rl)
         this.gpuPicker.addToRenderList(rl[0]) //use the box mesh for all picking
      }

      this.worker.postMessage({
         type: 'progress',
         progress: 1,
         label: 'Generating model.',
      })

      this.modelMaterial.forEach((m) => {
         m.updateCurrentFilePosition(this.filePosition)
         m.updateToolColors(this.processorProperties.buildToolFloat32Array())
      })
   }

   // 0 = Box, 1 = Cylinder, 2 = Line
   setMeshMode(mode) {
      mode = mode > 2 ? 0 : mode

      // If we have WASM buffers, rebuild a single active mesh for this mode
      const wasmBuffers = (this as any).wasmRenderBuffers
      if (wasmBuffers && wasmBuffers.segmentCount > 0) {
         this.rebuildWasmMeshForMode(mode, wasmBuffers)
         this.lastMeshMode = mode
         this.modelMaterial.forEach((m) => m.refreshMaterialState())
         return
      }

      // Fallback: enable/disable existing meshes (TS/progressive path)
      this.meshes.forEach((m) => m.setEnabled(false))
      this.meshes.forEach((m) => {
         const meshType = m.metadata?.meshType ?? (m.name === 'line' ? 2 : m.name === 'cyl' ? 1 : 0)
         if (meshType === mode) m.setEnabled(true)
      })
      this.lastMeshMode = mode
      this.modelMaterial.forEach((m) => m.refreshMaterialState())
   }

   private rebuildWasmMeshForMode(mode: number, wasmBuffers: any) {
      // Dispose existing active meshes
      this.meshes.forEach((m) => {
         this.scene.removeMesh(m, true)
         m.dispose(false, true)
      })
      this.meshes = []
      this.gpuPicker.clearRenderList()

      // Build base mesh per mode and apply buffers
      let mesh: Mesh
      switch (mode) {
         case 2: // line
            mesh = MeshBuilder.CreateLines(
               'line',
               { points: [new Vector3(-0.5, 0, 0), new Vector3(0.5, 0, 0)] },
               this.scene,
            )
            ;(mesh as any).metadata = { meshType: 2 }
            {
               const mm = this.addNewMaterial()
               mm.setLineMesh(true)
               mesh.material = mm.material
            }
            break
         case 1: // cylinder
            mesh = MeshBuilder.CreateCylinder('cyl', { height: 1, diameter: 1 }, this.scene)
            mesh.locallyTranslate(new Vector3(0, 0, 0))
            mesh.rotate(new Vector3(0, 0, 1), Math.PI / 2, Space.WORLD)
            mesh.bakeCurrentTransformIntoVertices()
            ;(mesh as any).metadata = { meshType: 1 }
            mesh.material = this.addNewMaterial().material
            break
         case 0: // box
         default:
            mesh = MeshBuilder.CreateBox('box', { width: 1, height: 1, depth: 1 }, this.scene)
            mesh.position = new Vector3(0, 0, 0)
            mesh.rotate(Axis.X, Math.PI / 4, Space.LOCAL)
            mesh.bakeCurrentTransformIntoVertices()
            ;(mesh as any).metadata = { meshType: 0 }
            mesh.material = this.addNewMaterial().material
            break
      }

      this.applyWasmBuffersToMesh(mesh, wasmBuffers)
      this.meshes.push(mesh)
      this.gpuPicker.addToRenderList(mesh)
   }

   testBuildMeshWithLOD(renderlines, segCount, alphaIndex, lodLevel: LODLevel): Mesh[] {
      // For LOD, we might skip certain mesh types or reduce complexity
      switch (lodLevel) {
         case LODLevel.LOW:
            return this.buildLineMeshOnly(renderlines, segCount, alphaIndex)
         case LODLevel.MEDIUM:
            return this.buildMediumDetailMesh(renderlines, segCount, alphaIndex)
         case LODLevel.HIGH:
         default:
            return this.testBuildMesh(renderlines, segCount, alphaIndex)
      }
   }

   buildLineMeshOnly(renderlines, segCount, alphaIndex): Mesh[] {
      // Create separate meshes but only render the line mesh for performance
      let box = MeshBuilder.CreateBox('box', { width: 1, height: 1, depth: 1 }, this.scene)
      box.position = new Vector3(0, 0, 0)
      box.rotate(Axis.X, Math.PI / 4, Space.LOCAL)
      box.bakeCurrentTransformIntoVertices()
      ;(box as any).metadata = { meshType: 0 }
      ;(box as any).metadata = { meshType: 0 }

      let cyl = MeshBuilder.CreateCylinder('cyl', { height: 1, diameter: 1 }, this.scene)
      cyl.locallyTranslate(new Vector3(0, 0, 0))
      cyl.rotate(new Vector3(0, 0, 1), Math.PI / 2, Space.WORLD)
      cyl.bakeCurrentTransformIntoVertices()
      ;(cyl as any).metadata = { meshType: 1 }
      ;(cyl as any).metadata = { meshType: 1 }

      let line = MeshBuilder.CreateLines(
         'line',
         {
            points: [new Vector3(-0.5, 0, 0), new Vector3(0.5, 0, 0)],
         },
         this.scene,
      )
      ;(line as any).metadata = { meshType: 2 }
      ;(line as any).metadata = { meshType: 2 }

      // Use object pooling for better memory management
      const buffers = this.objectPools.getBuffersForSegmentCount(segCount)

      // Assign materials with correct lighting settings
      box.material = this.addNewMaterial().material // lineMesh = false by default
      box.alphaIndex = alphaIndex

      cyl.material = this.addNewMaterial().material // lineMesh = false by default
      cyl.alphaIndex = alphaIndex

      let mm = this.addNewMaterial()
      line.alphaIndex = alphaIndex
      line.material = mm.material
      mm.setLineMesh(true) // Only line mesh should have lineMesh = true

      this.processRenderLines(
         renderlines,
         buffers.matrixData,
         buffers.colorData,
         buffers.pickData,
         buffers.filePositionData,
         buffers.fileEndPositionData,
         buffers.toolData,
         buffers.feedRate,
         buffers.isPerimeter,
         box,
      )

      // Copy buffers to all meshes
      this.copyBuffersToMesh(
         box,
         buffers.matrixData,
         buffers.colorData,
         buffers.pickData,
         buffers.filePositionData,
         buffers.fileEndPositionData,
         buffers.toolData,
         buffers.feedRate,
         buffers.isPerimeter,
      )
      this.copyBuffersToMesh(
         cyl,
         buffers.matrixData,
         buffers.colorData,
         buffers.pickData,
         buffers.filePositionData,
         buffers.fileEndPositionData,
         buffers.toolData,
         buffers.feedRate,
         buffers.isPerimeter,
      )
      this.copyBuffersToMesh(
         line,
         buffers.matrixData,
         buffers.colorData,
         buffers.pickData,
         buffers.filePositionData,
         buffers.fileEndPositionData,
         buffers.toolData,
         buffers.feedRate,
         buffers.isPerimeter,
      )

      // Disable box and cylinder initially (only line visible)
      box.setEnabled(false)
      cyl.setEnabled(false)

      return [box, cyl, line]
   }

   buildMediumDetailMesh(renderlines, segCount, alphaIndex): Mesh[] {
      // Create all three mesh types for proper material assignment
      let box = MeshBuilder.CreateBox('box', { width: 1, height: 1, depth: 1 }, this.scene)
      box.position = new Vector3(0, 0, 0)
      box.rotate(Axis.X, Math.PI / 4, Space.LOCAL)
      box.bakeCurrentTransformIntoVertices()
      ;(box as any).metadata = { meshType: 0 }

      let cyl = MeshBuilder.CreateCylinder('cyl', { height: 1, diameter: 1 }, this.scene)
      cyl.locallyTranslate(new Vector3(0, 0, 0))
      cyl.rotate(new Vector3(0, 0, 1), Math.PI / 2, Space.WORLD)
      cyl.bakeCurrentTransformIntoVertices()
      ;(cyl as any).metadata = { meshType: 1 }

      let line = MeshBuilder.CreateLines(
         'line',
         {
            points: [new Vector3(-0.5, 0, 0), new Vector3(0.5, 0, 0)],
         },
         this.scene,
      )
      ;(line as any).metadata = { meshType: 2 }

      let matrixData = new Float32Array(16 * segCount)
      let colorData = new Float32Array(4 * segCount)
      let pickData = new Float32Array(3 * segCount)
      let filePositionData = new Float32Array(segCount)
      let fileEndPositionData = new Float32Array(segCount)
      let toolData = new Float32Array(segCount)
      let feedRate = new Float32Array(segCount)
      let isPerimeter = new Float32Array(segCount)

      // Assign materials with correct lighting settings
      box.material = this.addNewMaterial().material // lineMesh = false by default
      box.alphaIndex = alphaIndex

      cyl.material = this.addNewMaterial().material // lineMesh = false by default
      cyl.alphaIndex = alphaIndex

      let mm = this.addNewMaterial()
      line.alphaIndex = alphaIndex
      line.material = mm.material
      mm.setLineMesh(true) // Only line mesh should have lineMesh = true

      this.processRenderLines(
         renderlines,
         matrixData,
         colorData,
         pickData,
         filePositionData,
         fileEndPositionData,
         toolData,
         feedRate,
         isPerimeter,
         cyl,
      )

      // Copy buffers to all meshes
      this.copyBuffersToMesh(
         box,
         matrixData,
         colorData,
         pickData,
         filePositionData,
         fileEndPositionData,
         toolData,
         feedRate,
         isPerimeter,
      )
      this.copyBuffersToMesh(
         cyl,
         matrixData,
         colorData,
         pickData,
         filePositionData,
         fileEndPositionData,
         toolData,
         feedRate,
         isPerimeter,
      )
      this.copyBuffersToMesh(
         line,
         matrixData,
         colorData,
         pickData,
         filePositionData,
         fileEndPositionData,
         toolData,
         feedRate,
         isPerimeter,
      )

      // Disable all initially, setMeshMode will enable appropriate ones
      box.setEnabled(false)
      cyl.setEnabled(false)
      line.setEnabled(false)

      return [box, cyl, line]
   }

   testBuildMesh(renderlines, segCount, alphaIndex): Mesh[] {
      let box = MeshBuilder.CreateBox('box', { width: 1, height: 1, depth: 1 }, this.scene)
      box.position = new Vector3(0, 0, 0)
      box.rotate(Axis.X, Math.PI / 4, Space.LOCAL)
      box.bakeCurrentTransformIntoVertices()
      //box.convertToUnIndexedMesh()

      let cyl = MeshBuilder.CreateCylinder('cyl', { height: 1, diameter: 1 }, this.scene)
      cyl.locallyTranslate(new Vector3(0, 0, 0))
      cyl.rotate(new Vector3(0, 0, 1), Math.PI / 2, Space.WORLD)
      cyl.bakeCurrentTransformIntoVertices()

      let line = MeshBuilder.CreateLines(
         'line',
         {
            points: [new Vector3(-0.5, 0, 0), new Vector3(0.5, 0, 0)],
         },
         this.scene,
      )

      let matrixData = new Float32Array(16 * segCount)
      let colorData = new Float32Array(4 * segCount)
      let pickData = new Float32Array(3 * segCount)
      let filePositionData = new Float32Array(segCount)
      let fileEndPositionData = new Float32Array(segCount)
      let toolData = new Float32Array(segCount)
      let feedRate = new Float32Array(segCount)
      let isPerimeter = new Float32Array(segCount)

      box.material = this.addNewMaterial().material
      box.alphaIndex = alphaIndex
      //box.material.freeze()

      cyl.material = this.addNewMaterial().material
      cyl.alphaIndex = alphaIndex
      //cyl.material.freeze()

      let mm = this.addNewMaterial()
      line.alphaIndex = alphaIndex
      line.material = mm.material
      mm.setLineMesh(true)
      //line.material.freeze()

      //  box.name = `Mesh${this.meshes.length}}`

      let segIdx = 0
      for (let idx = 0; idx < renderlines.length; idx++) {
         let line = renderlines[idx] as Base
         if (line.lineType === 'L' || line.lineType === 'T') {
            let l = line as Move
            let lineData = l.renderLine(0.4, 0.2)
            buildBuffers(lineData, l, segIdx)
            this.gCodeLines[line.lineNumber - 1] = new Move_Thin(this.processorProperties, line as Move, box, idx) //remove unnecessary information now that we have the matrix
            segIdx++
         } else if (line.lineType === 'A') {
            let arc = line as ArcMove
            //run all the segments
            for (let seg in arc.segments) {
               let segment = arc.segments[seg] as Move
               let lineData = segment.renderLine(0.38, 0.3)
               buildBuffers(lineData, arc, segIdx)
               segIdx++
            }
            this.gCodeLines[line.lineNumber - 1] = new Move_Thin(this.processorProperties, line as ArcMove, box, idx) //remove unnecessary information now that we have the matrix
         }
      }

      copyBuffers(box)
      copyBuffers(cyl)
      cyl.setEnabled(false)
      copyBuffers(line)
      line.setEnabled(false)

      return [box, cyl, line]

      function copyBuffers(m: Mesh) {
         //let matrixDataClone = Float32Array.from(matrixData) //new Float32Array(matrixData)
         m.doNotSyncBoundingInfo = true
         m.thinInstanceSetBuffer('matrix', matrixData, 16, true)
         m.thinInstanceSetBuffer('baseColor', colorData, 4, true)
         m.thinInstanceSetBuffer('pickColor', pickData, 3, true) //this holds the color ids for the mesh
         m.thinInstanceSetBuffer('filePosition', filePositionData, 1, true)
         m.thinInstanceSetBuffer('filePositionEnd', fileEndPositionData, 1, true)
         m.thinInstanceSetBuffer('tool', toolData, 1, true)
         m.thinInstanceSetBuffer('feedRate', feedRate, 1, true)
         // isPerimeter retained CPU-side for compatibility but not bound to GPU
         m.thinInstanceRefreshBoundingInfo(false)
         //         m.freezeWorldMatrix()
         m.isPickable = false
      }

      //Inner function with access to buffers
      function buildBuffers(lineData: MoveData, line: ArcMove | Move, idx: number) {
         lineData.Matrix.copyToArray(matrixData, idx * 16)
         colorData.set(lineData.Color, idx * 4)
         pickData.set([line.colorId[0] / 255, line.colorId[1] / 255, line.colorId[2] / 255], idx * 3)
         filePositionData.set([line.filePosition], idx) //Record the file position with the mesh
         fileEndPositionData.set([line.filePosition + line.line.length], idx) //Record the file position with the mesh
         toolData.set([line.tool], idx)
         feedRate.set([line.feedRate], idx)
         isPerimeter.set([line.isPerimeter ? 1 : 0], idx)
      }
   }

   getFileSize() {
      if (this.gCodeLines) {
         return this.gCodeLines[this.gCodeLines.length - 1].filePosition
      }
   }

   getGCodeInRange(filePos, count = 20) {
      let idx = binarySearchClosest(this.gCodeLines, filePos, 'filePosition')

      if (this.gCodeLines[idx].filePosition > filePos) idx--

      let min = Math.max(0, idx - count / 2)
      let max = Math.min(idx + count / 2, this.gCodeLines.length - 1)

      if (count % 2 == 1) {
         min++
         max++
      }

      let sub = this.gCodeLines.slice(min, max)
      let lines = []
      for (let idx in sub) {
         let l = sub[idx]
         lines.push({
            line: l.line,
            lineNumber: l.lineNumber,
            filePosition: l.filePosition,
            lineType: l.lineType,
            focus: false,
         })
      }

      var f = lines.find((f) => f.lineNumber == this.gCodeLines[idx].lineNumber)
      if (f) f.focus = true

      this.worker.postMessage({ type: 'getgcodes', lines: lines })
   }

   updateFilePosition(position: number, animate: boolean = false) {
      this.filePosition = position // Store the current position
      this.modelMaterial.forEach((m) => m.updateCurrentFilePosition(position)) //Set it to the end
      this.gpuPicker.updateCurrentPosition(position)

      // Update nozzle position based on G-code position
      if (this.nozzle && this.positionTracker.size > 0) {
         if (this.isPlaying && !animate) {
            // Manual position change during animation - skip to position and continue playing
            this.skipToPosition(position)
         } else if (!this.isPlaying) {
            // Normal position update when not playing
            if (animate) {
               this.updateNozzlePositionAnimated(position)
            } else {
               this.updateNozzlePositionInstant(position)
            }
         }
         // If animate is true and playing, let the animation continue naturally
      }
   }

   private updateNozzlePositionInstant(filePosition: number) {
      if (!this.nozzle) return

      const posData = this.getPositionDataForFilePosition(filePosition)
      if (posData) {
         this.nozzle.setPosition({ x: posData.x, y: posData.y, z: posData.z })
      }
   }

   private updateNozzlePositionAnimated(filePosition: number) {
      if (!this.nozzle) return

      const closest = this.getPositionDataForFilePosition(filePosition)
      if (closest) {
         const fakeMove = {
            end: [closest.x, closest.y, closest.z],
            feedRate: closest.feedRate,
            extruding: closest.extruding,
         }
         const movement = this.nozzle.createMovementFromGCode(fakeMove as any, this.nozzle.getCurrentPosition())
         this.nozzle.moveToPosition(movement)
      }
   }

   async animateNozzleToPosition(targetPosition: number): Promise<void> {
      if (!this.nozzle || this.gCodeLines.length === 0) return

      const currentIdx = binarySearchClosest(this.gCodeLines, this.filePosition, 'filePosition')
      const targetIdx = binarySearchClosest(this.gCodeLines, targetPosition, 'filePosition')

      // Animate through moves between current and target position
      const startIdx = Math.min(currentIdx, targetIdx)
      const endIdx = Math.max(currentIdx, targetIdx)

      for (let i = startIdx; i <= endIdx; i++) {
         const gcodeLine = this.gCodeLines[i]
         if (gcodeLine && gcodeLine.lineType === 'L') {
            const move = gcodeLine as Move
            const movement = this.nozzle.createMovementFromGCode(move, this.nozzle.getCurrentPosition())
            await this.nozzle.moveToPosition(movement)
         }
      }
   }

   updateByLineNumber(lineNumber: number) {
      this.updateFilePosition(this.gCodeLines[lineNumber - 1].filePosition)
   }

   private async buildMeshesFromWasmBuffers(wasmBuffers: any) {
      console.log('🔧 Building meshes directly from WASM render buffers...')
      const startTime = performance.now()

      // Create single mesh set from WASM buffers
      const lodLevel = this.lodManager.getLODBySegmentCount(wasmBuffers.segmentCount)
      let meshes: Mesh[]

      // Build only a single active mesh to reduce memory.
      // Prefer user's last selection; otherwise map LOD LOW->line, MED/HIGH->box
      let initialMode = this.lastMeshMode
      if (initialMode === undefined || initialMode === null) {
         initialMode = lodLevel === LODLevel.LOW ? 2 : 0
      }
      this.rebuildWasmMeshForMode(initialMode, wasmBuffers)

      // Update materials
      this.modelMaterial.forEach((m) => {
         m.updateCurrentFilePosition(this.filePosition)
         m.updateToolColors(this.processorProperties.buildToolFloat32Array())
      })

      const buildTime = performance.now() - startTime
      console.log(
         `✅ WASM mesh building completed in ${buildTime.toFixed(2)}ms for ${wasmBuffers.segmentCount} segments`,
      )
   }

   private createHighDetailMeshFromWasmBuffers(wasmBuffers: any): Mesh[] {
      // Create box mesh
      let box = MeshBuilder.CreateBox('box', { width: 1, height: 1, depth: 1 }, this.scene)
      box.position = new Vector3(0, 0, 0)
      box.rotate(Axis.X, Math.PI / 4, Space.LOCAL)
      box.bakeCurrentTransformIntoVertices()

      // Create cylinder mesh
      let cyl = MeshBuilder.CreateCylinder('cyl', { height: 1, diameter: 1 }, this.scene)
      cyl.locallyTranslate(new Vector3(0, 0, 0))
      cyl.rotate(new Vector3(0, 0, 1), Math.PI / 2, Space.WORLD)
      cyl.bakeCurrentTransformIntoVertices()

      // Create line mesh
      let line = MeshBuilder.CreateLines(
         'line',
         {
            points: [new Vector3(-0.5, 0, 0), new Vector3(0.5, 0, 0)],
         },
         this.scene,
      )

      // Assign materials and alpha index
      const alphaIndex = 0
      box.material = this.addNewMaterial().material
      box.alphaIndex = alphaIndex

      cyl.material = this.addNewMaterial().material
      cyl.alphaIndex = alphaIndex

      let mm = this.addNewMaterial()
      line.alphaIndex = alphaIndex
      line.material = mm.material
      mm.setLineMesh(true)

      // Apply WASM buffers directly to all meshes
      this.applyWasmBuffersToMesh(box, wasmBuffers)
      this.applyWasmBuffersToMesh(cyl, wasmBuffers)
      this.applyWasmBuffersToMesh(line, wasmBuffers)

      return [box, cyl, line]
   }

   private createMediumDetailMeshFromWasmBuffers(wasmBuffers: any): Mesh[] {
      // Similar to high detail but with optimizations
      return this.createHighDetailMeshFromWasmBuffers(wasmBuffers)
   }

   private createLineMeshFromWasmBuffers(wasmBuffers: any): Mesh[] {
      // Create all three base meshes so any mesh mode can be enabled later
      let box = MeshBuilder.CreateBox('box', { width: 1, height: 1, depth: 1 }, this.scene)
      box.position = new Vector3(0, 0, 0)
      box.rotate(Axis.X, Math.PI / 4, Space.LOCAL)
      box.bakeCurrentTransformIntoVertices()
      ;(box as any).metadata = { meshType: 0 }

      let cyl = MeshBuilder.CreateCylinder('cyl', { height: 1, diameter: 1 }, this.scene)
      cyl.locallyTranslate(new Vector3(0, 0, 0))
      cyl.rotate(new Vector3(0, 0, 1), Math.PI / 2, Space.WORLD)
      cyl.bakeCurrentTransformIntoVertices()
      ;(cyl as any).metadata = { meshType: 1 }

      let line = MeshBuilder.CreateLines(
         'line',
         {
            points: [new Vector3(-0.5, 0, 0), new Vector3(0.5, 0, 0)],
         },
         this.scene,
      )
      ;(line as any).metadata = { meshType: 2 }

      // Assign materials
      box.material = this.addNewMaterial().material
      cyl.material = this.addNewMaterial().material
      let mm = this.addNewMaterial()
      line.material = mm.material
      mm.setLineMesh(true)

      // Apply buffers to all meshes
      this.applyWasmBuffersToMesh(box, wasmBuffers)
      this.applyWasmBuffersToMesh(cyl, wasmBuffers)
      this.applyWasmBuffersToMesh(line, wasmBuffers)

      // Default to line visible only; mode switch will toggle
      box.setEnabled(false)
      cyl.setEnabled(false)
      line.setEnabled(true)

      return [box, cyl, line]
   }

   private applyWasmBuffersToMesh(mesh: Mesh, wasmBuffers: any) {
      // Apply WASM-generated buffer data directly to mesh
      const segmentCount = wasmBuffers.segmentCount

      // Mark as static where possible and refresh bounds after all buffers
      mesh.doNotSyncBoundingInfo = true

      // Set the matrix data (transformations)
      mesh.thinInstanceSetBuffer('matrix', wasmBuffers.matrixData, 16, true)

      // Set color data (match attribute name used elsewhere)
      mesh.thinInstanceSetBuffer('baseColor', wasmBuffers.colorData, 4, true)

      // Set other buffer data (use consistent attribute names and component sizes)
      mesh.thinInstanceSetBuffer('pickColor', wasmBuffers.pickData, 3, true)
      mesh.thinInstanceSetBuffer('filePosition', wasmBuffers.filePositionData, 1, true)
      mesh.thinInstanceSetBuffer('filePositionEnd', wasmBuffers.fileEndPositionData, 1, true)
      mesh.thinInstanceSetBuffer('tool', wasmBuffers.toolData, 1, true)
      mesh.thinInstanceSetBuffer('feedRate', wasmBuffers.feedRateData, 1, true)

      mesh.thinInstanceCount = segmentCount

      // Refresh bounds once
      mesh.thinInstanceRefreshBoundingInfo(false)

      console.log(`📊 Applied WASM buffers to ${mesh.name}: ${segmentCount} instances`)
   }

   private processRenderLines(
      renderlines,
      matrixData: Float32Array,
      colorData: Float32Array,
      pickData: Float32Array,
      filePositionData: Float32Array,
      fileEndPositionData: Float32Array,
      toolData: Float32Array,
      feedRate: Float32Array,
      isPerimeter: Float32Array,
      primaryMesh: Mesh, // Added mesh parameter for Move_Thin references
   ) {
      // Check if we have WASM render buffers available
      const wasmBuffers = (this as any).wasmRenderBuffers
      console.log('🔍 processRenderLines called:', {
         hasWasmBuffers: !!wasmBuffers,
         segmentCount: wasmBuffers?.segmentCount || 0,
         renderLinesLength: renderlines.length,
         matrixDataLength: matrixData.length,
      })

      if (wasmBuffers && wasmBuffers.segmentCount > 0) {
         console.log(`🚀 Using WASM render buffers for ${wasmBuffers.segmentCount} segments`)

         // Copy WASM-generated buffer data directly
         const segmentCount = Math.min(wasmBuffers.segmentCount, matrixData.length / 16)

         // Copy matrix data (16 floats per segment)
         for (let i = 0; i < segmentCount * 16; i++) {
            matrixData[i] = wasmBuffers.matrixData[i]
         }

         // Copy other buffer data
         for (let i = 0; i < segmentCount; i++) {
            if (i * 4 < colorData.length) {
               colorData[i * 4] = wasmBuffers.colorData[i * 4] || 1.0
               colorData[i * 4 + 1] = wasmBuffers.colorData[i * 4 + 1] || 1.0
               colorData[i * 4 + 2] = wasmBuffers.colorData[i * 4 + 2] || 1.0
               colorData[i * 4 + 3] = wasmBuffers.colorData[i * 4 + 3] || 1.0
            }

            // pickColor is 3 floats per instance
            if (i * 3 + 2 < pickData.length) {
               pickData[i * 3] = wasmBuffers.pickData[i * 3] || 0
               pickData[i * 3 + 1] = wasmBuffers.pickData[i * 3 + 1] || 0
               pickData[i * 3 + 2] = wasmBuffers.pickData[i * 3 + 2] || 0
            }
            if (i < filePositionData.length) filePositionData[i] = wasmBuffers.filePositionData[i] || 0
            if (i < fileEndPositionData.length) fileEndPositionData[i] = wasmBuffers.fileEndPositionData[i] || 0
            if (i < toolData.length) toolData[i] = wasmBuffers.toolData[i] || 0
            if (i < feedRate.length) feedRate[i] = wasmBuffers.feedRateData[i] || 1500
            if (i < isPerimeter.length) isPerimeter[i] = wasmBuffers.isPerimeterData[i] || 1.0
         }

         console.log(`✅ WASM buffers copied successfully for ${segmentCount} segments`)
         return // Skip traditional rendering
      }

      // Fallback to traditional TypeScript rendering
      console.log('📦 Using traditional TypeScript rendering')
      let segIdx = 0
      for (let idx = 0; idx < renderlines.length; idx++) {
         let line = renderlines[idx] as Base
         if (line.lineType === 'L' || line.lineType === 'T') {
            let l = line as Move
            // Safety check for renderLine method
            if (!l.renderLine || typeof l.renderLine !== 'function') {
               console.warn(`Line ${idx} (type ${line.lineType}) missing renderLine method, skipping`)
               continue
            }
            let lineData = l.renderLine(0.4, 0.2)
            this.buildBuffersHelper(
               lineData,
               l,
               segIdx,
               matrixData,
               colorData,
               pickData,
               filePositionData,
               fileEndPositionData,
               toolData,
               feedRate,
               isPerimeter,
            )
            this.gCodeLines[line.lineNumber - 1] = new Move_Thin(
               this.processorProperties,
               line as Move,
               primaryMesh,
               idx,
            )
            segIdx++
         } else if (line.lineType === 'A') {
            let arc = line as ArcMove
            for (let seg in arc.segments) {
               let segment = arc.segments[seg] as Move
               // Safety check for arc segment renderLine method
               if (!segment.renderLine || typeof segment.renderLine !== 'function') {
                  console.warn(`Arc segment missing renderLine method, skipping`)
                  continue
               }
               let lineData = segment.renderLine(0.38, 0.3)
               this.buildBuffersHelper(
                  lineData,
                  arc,
                  segIdx,
                  matrixData,
                  colorData,
                  pickData,
                  filePositionData,
                  fileEndPositionData,
                  toolData,
                  feedRate,
                  isPerimeter,
               )
               segIdx++
            }
            this.gCodeLines[line.lineNumber - 1] = new Move_Thin(
               this.processorProperties,
               line as ArcMove,
               primaryMesh,
               idx,
            )
         }
      }

      // Ensure UI progress reaches 100% when compatibility objects are ready
      this.worker.postMessage({
         type: 'progress',
         progress: 1,
         label: 'Ready',
      })
   }

   private buildBuffersHelper(
      lineData: MoveData,
      line: ArcMove | Move,
      idx: number,
      matrixData: Float32Array,
      colorData: Float32Array,
      pickData: Float32Array,
      filePositionData: Float32Array,
      fileEndPositionData: Float32Array,
      toolData: Float32Array,
      feedRate: Float32Array,
      isPerimeter: Float32Array,
   ) {
      lineData.Matrix.copyToArray(matrixData, idx * 16)
      colorData.set(lineData.Color, idx * 4)
      pickData.set([line.colorId[0] / 255, line.colorId[1] / 255, line.colorId[2] / 255], idx * 3)
      filePositionData.set([line.filePosition], idx)
      fileEndPositionData.set([line.filePosition + line.line.length], idx)
      // Pack tool index + flags into single float: tool + 1024*(b0=travel,b1=perimeter,b2=support,b3=retraction)
      const toolIdx = Math.min((line as any).tool || 0, 1023)
      const isTravel = ((line as any).tool >= 254) || !(line as any).extruding
      const isPerim = !!(line as any).isPerimeter
      const isSupport = !!(line as any).isSupport
      const len = (line as any).length ?? 0
      const isRetraction = (line as any).extruding && len <= 1e-6
      let flags = 0
      if (isTravel) flags |= 1
      if (isPerim) flags |= 2
      if (isSupport) flags |= 4
      if (isRetraction) flags |= 8
      const packed = toolIdx + flags * 1024
      toolData.set([packed], idx)
      feedRate.set([line.feedRate], idx)
      isPerimeter.set([line.isPerimeter ? 1 : 0], idx)
      // segment length no longer sent to GPU; encoded via flags in tool
   }

   private copyBuffersToMesh(
      mesh: Mesh,
      matrixData: Float32Array,
      colorData: Float32Array,
      pickData: Float32Array,
      filePositionData: Float32Array,
      fileEndPositionData: Float32Array,
      toolData: Float32Array,
      feedRate: Float32Array,
      isPerimeter: Float32Array,
   ) {
      mesh.doNotSyncBoundingInfo = true
      mesh.thinInstanceSetBuffer('matrix', matrixData, 16, true)
      mesh.thinInstanceSetBuffer('baseColor', colorData, 4, true)
      mesh.thinInstanceSetBuffer('pickColor', pickData, 3, true)
      mesh.thinInstanceSetBuffer('filePosition', filePositionData, 1, true)
      mesh.thinInstanceSetBuffer('filePositionEnd', fileEndPositionData, 1, true)
      mesh.thinInstanceSetBuffer('tool', toolData, 1, true)
      mesh.thinInstanceSetBuffer('feedRate', feedRate, 1, true)
      // isPerimeter retained CPU-side for compatibility but not bound
      mesh.thinInstanceRefreshBoundingInfo(false)
      mesh.isPickable = false
   }

   async setPerimeterOnly(perimeterOnly) {
      this.perimeterOnly = perimeterOnly
      await this.loadFile(this.originalFile)
   }

   showSupports(show) {
      this.modelMaterial.forEach((m) => m.showSupports(show))
   }

   // Animation control methods
   setPlaybackSpeed(multiplier: number): void {
      if (this.nozzle) {
         this.nozzle.setAnimationSpeed(multiplier)
      }
   }

   startNozzleAnimation(): void {
      if (!this.nozzle || this.sortedPositions.length === 0) {
         console.warn('Cannot start animation: nozzle or positions not available')
         return
      }

      if (this.isPlaying) {
         console.log('Animation already playing, continuing from current position')
         return
      }

      console.log('Starting animation from current file position:', this.filePosition)

      this.isPlaying = true

      // Notify UI that animation started
      this.worker.postMessage({
         type: 'animationStarted',
         currentPosition: this.getCurrentAnimationIndex(),
         totalPositions: this.sortedPositions.length,
      })

      // Start immediately without await to prevent blocking
      this.animateToNextPosition()
   }

   pauseNozzleAnimation(): void {
      if (!this.isPlaying) {
         console.log('Animation not playing, nothing to pause')
         return
      }

      this.isPlaying = false

      if (this.playbackTimeout) {
         clearTimeout(this.playbackTimeout)
         this.playbackTimeout = null
      }

      if (this.nozzle) {
         this.nozzle.stopAnimation()
      }

      // Notify UI that animation paused
      this.worker.postMessage({
         type: 'animationPaused',
         currentPosition: this.getCurrentAnimationIndex(),
         totalPositions: this.sortedPositions.length,
      })
   }

   resumeNozzleAnimation(): void {
      if (this.isPlaying) {
         console.log('Animation already playing')
         return
      }

      if (!this.nozzle || this.sortedPositions.length === 0) {
         console.warn('Cannot resume animation: nozzle or positions not available')
         return
      }

      this.isPlaying = true

      // Notify UI that animation resumed
      this.worker.postMessage({
         type: 'animationResumed',
         currentPosition: this.getCurrentAnimationIndex(),
         totalPositions: this.sortedPositions.length,
      })

      // Continue from current position
      this.animateToNextPosition()
   }

   stopNozzleAnimation(): void {
      this.isPlaying = false

      if (this.playbackTimeout) {
         clearTimeout(this.playbackTimeout)
         this.playbackTimeout = null
      }

      if (this.nozzle) {
         this.nozzle.stopAnimation()
      }

      // Notify UI that animation stopped
      this.worker.postMessage({
         type: 'animationStopped',
      })
   }

   private animateToNextPosition(): void {
      if (!this.isPlaying || !this.nozzle) {
         return
      }

      const currentIndex = this.getCurrentAnimationIndex()
      const nextIndex = currentIndex + 1

      if (nextIndex >= this.sortedPositions.length) {
         this.stopNozzleAnimation()
         return
      }

      const nextFilePosition = this.sortedPositions[nextIndex]
      const positionData = this.getPositionDataForIndex(nextIndex)

      if (positionData) {
         // Update file position to match animation progress - but don't trigger position change events
         this.filePosition = nextFilePosition
         this.modelMaterial.forEach((m) => m.updateCurrentFilePosition(nextFilePosition))
         this.gpuPicker.updateCurrentPosition(nextFilePosition)

         // Notify UI of position change
         this.worker.postMessage({
            type: 'animationPositionUpdate',
            position: nextFilePosition,
            progress: nextIndex / this.sortedPositions.length,
         })

         // Create movement for nozzle
         const fakeMove = {
            end: [positionData.x, positionData.y, positionData.z],
            feedRate: positionData.feedRate,
            extruding: positionData.extruding,
         }

         try {
            const movement = this.nozzle.createMovementFromGCode(fakeMove as any, this.nozzle.getCurrentPosition())

            // Use the actual calculated duration from nozzle movement instead of fixed delay
            this.nozzle
               .moveToPosition(movement)
               .then(() => {
                  if (this.isPlaying) {
                     // Use minimal delay - nozzle animation duration handles timing
                     this.playbackTimeout = window.setTimeout(() => {
                        this.animateToNextPosition()
                     }, 10)
                  }
               })
               .catch(() => {
                  if (this.isPlaying) {
                     this.playbackTimeout = window.setTimeout(() => {
                        this.animateToNextPosition()
                     }, 10)
                  }
               })
         } catch {
            if (this.isPlaying) {
               this.playbackTimeout = window.setTimeout(() => {
                  this.animateToNextPosition()
               }, 10)
            }
         }
      } else {
         if (this.isPlaying) {
            this.playbackTimeout = window.setTimeout(() => {
               this.animateToNextPosition()
            }, 10)
         }
      }
   }

   isNozzleAnimationPlaying(): boolean {
      return this.isPlaying
   }

   private getCurrentAnimationIndex(): number {
      return this.findClosestPositionIndex(this.filePosition)
   }

   private skipToPosition(targetFilePosition: number): void {
      if (!this.nozzle || this.sortedPositions.length === 0) {
         return
      }

      // Clear any existing timeout first
      if (this.playbackTimeout) {
         clearTimeout(this.playbackTimeout)
         this.playbackTimeout = null
      }

      // Stop current animation
      this.nozzle.stopAnimation()

      // Update file position - this is now the single source of truth
      this.filePosition = targetFilePosition

      // Find the closest position data for the nozzle
      const targetIndex = this.findClosestPositionIndex(targetFilePosition)
      if (targetIndex >= 0 && targetIndex < this.sortedPositions.length) {
         const positionData = this.getPositionDataForIndex(targetIndex)
         if (positionData) {
            // Set nozzle to the target position immediately
            this.nozzle.setPosition({
               x: positionData.x,
               y: positionData.y,
               z: positionData.z,
            })
         }
      }

      // Continue animation from this point if still playing
      if (this.isPlaying) {
         // Small delay before continuing to allow position to settle
         this.playbackTimeout = window.setTimeout(() => {
            this.animateToNextPosition()
         }, 150)
      }
   }

   private streamLines(file: string): string[] {
      // Fast line splitting without creating intermediate arrays
      const lines: string[] = []
      let start = 0

      for (let i = 0; i < file.length; i++) {
         if (file[i] === '\n') {
            lines.push(file.substring(start, i))
            start = i + 1
         }
      }

      // Handle last line if no trailing newline
      if (start < file.length) {
         lines.push(file.substring(start))
      }

      return lines
   }

   private findClosestPositionIndex(targetFilePosition: number): number {
      // Prefer WASM search when available for accuracy/perf
      if (this.wasmProcessor && this.sortedPositions.length > 0) {
         try {
            const closestFilePos = this.wasmProcessor.findClosestPosition(targetFilePosition)
            if (closestFilePos !== undefined) {
               // Map file position to index via binary search
               let left = 0
               let right = this.sortedPositions.length - 1
               let best = 0
               while (left <= right) {
                  const mid = Math.floor((left + right) / 2)
                  const val = this.sortedPositions[mid]
                  if (val === closestFilePos) {
                     return mid
                  }
                  if (val < closestFilePos) {
                     best = mid
                     left = mid + 1
                  } else {
                     right = mid - 1
                  }
               }
               return best
            }
         } catch {}
      }

      // Fallback to local binary search
      let left = 0
      let right = this.sortedPositions.length - 1
      let closestIndex = 0
      let minDistance = Infinity
      while (left <= right) {
         const mid = Math.floor((left + right) / 2)
         const distance = Math.abs(this.sortedPositions[mid] - targetFilePosition)
         if (distance < minDistance) {
            minDistance = distance
            closestIndex = mid
         }
         if (this.sortedPositions[mid] < targetFilePosition) {
            left = mid + 1
         } else {
            right = mid - 1
         }
      }
      return closestIndex
   }

   private getPositionDataForIndex(index: number) {
      if (index < 0 || index >= this.sortedPositions.length) return undefined
      const filePos = this.sortedPositions[index]
      if (this.wasmProcessor) {
         try {
            return this.wasmProcessor.getPositionData(filePos)
         } catch {}
      }
      return this.positionTracker.get(filePos)
   }

   private getPositionDataForFilePosition(filePosition: number) {
      if (this.wasmProcessor) {
         try {
            const pos = this.wasmProcessor.findClosestPosition(filePosition)
            if (pos !== undefined) {
               return this.wasmProcessor.getPositionData(pos)
            }
         } catch {}
      }
      // Fallback to JS map scan
      let closest = undefined as any
      let minDistance = Infinity
      for (const [pos, data] of this.positionTracker) {
         const d = Math.abs(pos - filePosition)
         if (d < minDistance) {
            minDistance = d
            closest = data
         }
      }
      return closest
   }
}
