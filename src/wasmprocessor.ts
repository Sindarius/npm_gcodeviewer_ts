import init, { GCodeProcessor, ProcessingResult, PositionData, RenderBuffers, get_version } from '../WASM_FileProcessor/pkg/gcode_file_processor';

export interface WasmProcessingResult {
    success: boolean;
    errorMessage: string;
    lineCount: number;
    moveCount: number;
    processingTimeMs: number;
}

export interface WasmPositionData {
    x: number;
    y: number;
    z: number;
    feedRate: number;
    extruding: boolean;
}

export interface WasmRenderBuffers {
    segmentCount: number;
    matrixData: Float32Array;
    colorData: Float32Array;
    pickData: Float32Array;
    filePositionData: Float32Array;
    fileEndPositionData: Float32Array;
    toolData: Float32Array;
    feedRateData: Float32Array;
    isPerimeterData: Float32Array;
}

export class WasmProcessor {
    private processor: GCodeProcessor | null = null;
    private initialized: boolean = false;
    private pseudoProgress: number = 0;

    async initialize(): Promise<void> {
        if (!this.initialized) {
            await init();
            this.processor = new GCodeProcessor();
            this.initialized = true;
            console.log(`WASM G-code processor initialized - v${get_version()}`);
        }
    }

    async processFile(
        content: string, 
        progressCallback?: (progress: number, label: string) => void
    ): Promise<WasmProcessingResult> {
        if (!this.initialized || !this.processor) {
            throw new Error('WASM processor not initialized. Call initialize() first.');
        }

        // Reset pseudo progress for this phase
        this.pseudoProgress = 0;

        // Normalize callback arity coming from WASM glue (some builds may pass only label)
        const cb = progressCallback
            ? ((a: any, b?: any) => {
                  if (typeof a === 'number') {
                     progressCallback(a, typeof b === 'string' ? b : '')
                  } else if (typeof a === 'string') {
                     // No numeric progress provided; synthesize a smooth progress
                     const label = a
                     const done = /complete/i.test(label)
                     if (done) {
                        this.pseudoProgress = 1
                     } else {
                        this.pseudoProgress = Math.min(0.99, this.pseudoProgress + 0.02)
                     }
                     progressCallback(this.pseudoProgress, label)
                  }
               })
            : undefined

        const result: ProcessingResult = this.processor.process_file(content, cb as any);
        
        return {
            success: result.success,
            errorMessage: result.error_message,
            lineCount: result.line_count,
            moveCount: result.move_count,
            processingTimeMs: result.processing_time_ms
        };
    }

    getPositionData(filePosition: number): WasmPositionData | undefined {
        if (!this.initialized || !this.processor) {
            throw new Error('WASM processor not initialized');
        }

        const posData: PositionData | undefined = this.processor.get_position_data(filePosition);
        if (!posData) {
            return undefined;
        }

        return {
            x: posData.x,
            y: posData.y,
            z: posData.z,
            feedRate: posData.feed_rate,
            extruding: posData.extruding
        };
    }

    getSortedPositions(): Uint32Array {
        if (!this.initialized || !this.processor) {
            throw new Error('WASM processor not initialized');
        }

        return this.processor.get_sorted_positions();
    }

    getPositionCount(): number {
        if (!this.initialized || !this.processor) {
            throw new Error('WASM processor not initialized');
        }

        return this.processor.get_position_count();
    }

    findClosestPosition(targetPosition: number): number | undefined {
        if (!this.initialized || !this.processor) {
            throw new Error('WASM processor not initialized');
        }

        return this.processor.find_closest_position(targetPosition);
    }

    generateRenderBuffers(nozzleSize: number = 0.4, padding: number = 0, progressCallback?: (progress: number, label: string) => void): WasmRenderBuffers {
        if (!this.initialized || !this.processor) {
            throw new Error('WASM processor not initialized');
        }

        const cb = progressCallback
            ? ((a: any, b?: any) => {
                  if (typeof a === 'number') {
                     progressCallback(a, typeof b === 'string' ? b : '')
                  } else if (typeof a === 'string') {
                     progressCallback(Number.NaN, a)
                  }
               })
            : undefined

        // Reset pseudo progress for render buffer generation
        this.pseudoProgress = 0;

        const renderBuffers: RenderBuffers = this.processor.generate_render_buffers(nozzleSize, padding, cb as any);

        // Note: The getters on RenderBuffers already copy out of WASM memory
        // and free the underlying WASM allocation. Avoid wrapping in new
        // typed arrays again to prevent an extra copy and peak memory spike.
        return {
            segmentCount: renderBuffers.segment_count,
            matrixData: renderBuffers.matrix_data,
            colorData: renderBuffers.color_data,
            pickData: renderBuffers.pick_data,
            filePositionData: renderBuffers.file_position_data,
            fileEndPositionData: renderBuffers.file_end_position_data,
            toolData: renderBuffers.tool_data,
            feedRateData: renderBuffers.feed_rate_data,
            isPerimeterData: renderBuffers.is_perimeter_data,
        };
    }

    dispose(): void {
        if (this.processor) {
            this.processor.free();
            this.processor = null;
        }
        this.initialized = false;
    }

    async generateRenderBuffersChunked(
        nozzleSize: number,
        padding: number,
        maxSegmentsPerChunk: number,
        onChunk: (buffers: WasmRenderBuffers, chunkIndex: number) => void,
        progressCallback?: (progress: number, label: string) => void,
    ): Promise<number> {
        if (!this.initialized || !this.processor) {
            throw new Error('WASM processor not initialized');
        }

        const total = this.getPositionCount()
        if (total === 0) return 0

        let produced = 0
        let chunkIndex = 0
        for (let start = 0; start < total; start += maxSegmentsPerChunk) {
            const cb = progressCallback
                ? ((a: any, b?: any) => {
                      if (typeof a === 'number') {
                          // Map local chunk progress to global
                          const local = a
                          const global = Math.min(1, (start + local * Math.min(maxSegmentsPerChunk, total - start)) / total)
                          progressCallback(global, typeof b === 'string' ? b : 'Building render objects (chunk)')
                      } else if (typeof a === 'string') {
                          progressCallback((start + Math.min(maxSegmentsPerChunk, total - start)) / total, a)
                      }
                  })
                : undefined

            // Call the new chunked API; use any to avoid type conflicts until WASM is rebuilt
            const rb: any = (this.processor as any).generate_render_buffers_range(
                nozzleSize,
                padding,
                start,
                Math.min(maxSegmentsPerChunk, total - start),
                cb,
            )

            const buffers: WasmRenderBuffers = {
                segmentCount: rb.segment_count,
                matrixData: rb.matrix_data,
                colorData: rb.color_data,
                pickData: rb.pick_data,
                filePositionData: rb.file_position_data,
                fileEndPositionData: rb.file_end_position_data,
                toolData: rb.tool_data,
                feedRateData: rb.feed_rate_data,
                isPerimeterData: rb.is_perimeter_data,
            }

            if (buffers.segmentCount > 0) {
                onChunk(buffers, chunkIndex++)
                produced += buffers.segmentCount
            }
            // Let event loop breathe between chunks
            await Promise.resolve()
        }

        if (progressCallback) progressCallback(1, 'Render objects complete')
        return produced
    }
}
