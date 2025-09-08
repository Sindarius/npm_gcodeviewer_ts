import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer'

/**
 * Interleaved Buffer Layout for optimal GPU cache performance.
 * 
 * Layout per instance (28 floats total):
 * - Matrix (16 floats): 4x4 transformation matrix
 * - Color (4 floats): RGBA base color  
 * - Pick Color (3 floats): RGB pick color for GPU picking
 * - File Position (1 float): Start position in file
 * - File Position End (1 float): End position in file  
 * - Tool (1 float): Tool identifier
 * - Feed Rate (1 float): Movement feed rate
 * - Reserved (1 float): For future expansion/alignment
 */

export interface WasmRenderBuffersInterleaved {
    segmentCount: number
    interleavedData: Float32Array
    isPerimeterData: Float32Array // Keep separate for CPU access compatibility
}

export class InterleavedBufferManager {
    private static readonly INSTANCE_SIZE = 28 // floats per instance
    private static readonly MATRIX_OFFSET = 0
    private static readonly COLOR_OFFSET = 16  
    private static readonly PICK_COLOR_OFFSET = 20
    private static readonly FILE_POS_OFFSET = 23
    private static readonly FILE_POS_END_OFFSET = 24
    private static readonly TOOL_OFFSET = 25
    private static readonly FEED_RATE_OFFSET = 26
    private static readonly RESERVED_OFFSET = 27

    /**
     * Convert separate WASM buffers to interleaved format for optimal GPU performance
     */
    static convertToInterleaved(wasmBuffers: any): WasmRenderBuffersInterleaved {
        const segmentCount = wasmBuffers.segmentCount
        const interleavedData = new Float32Array(segmentCount * this.INSTANCE_SIZE)
        
        // Pack all data together for cache efficiency
        for (let i = 0; i < segmentCount; i++) {
            const offset = i * this.INSTANCE_SIZE
            
            // Matrix (16 floats) - most frequently accessed, place first
            const matrixStart = i * 16
            for (let j = 0; j < 16; j++) {
                interleavedData[offset + this.MATRIX_OFFSET + j] = wasmBuffers.matrixData[matrixStart + j]
            }
            
            // Color (4 floats) - frequently accessed for visibility/layers
            const colorStart = i * 4
            for (let j = 0; j < 4; j++) {
                interleavedData[offset + this.COLOR_OFFSET + j] = wasmBuffers.colorData[colorStart + j]
            }
            
            // Pick color (3 floats) - used for GPU picking
            const pickStart = i * 3
            for (let j = 0; j < 3; j++) {
                interleavedData[offset + this.PICK_COLOR_OFFSET + j] = wasmBuffers.pickData[pickStart + j]
            }
            
            // Single float attributes
            interleavedData[offset + this.FILE_POS_OFFSET] = wasmBuffers.filePositionData[i]
            interleavedData[offset + this.FILE_POS_END_OFFSET] = wasmBuffers.fileEndPositionData[i]
            interleavedData[offset + this.TOOL_OFFSET] = wasmBuffers.toolData[i]
            interleavedData[offset + this.FEED_RATE_OFFSET] = wasmBuffers.feedRateData[i]
            interleavedData[offset + this.RESERVED_OFFSET] = 0.0 // Reserved for future use
        }
        
        return {
            segmentCount,
            interleavedData,
            isPerimeterData: wasmBuffers.isPerimeterData // Keep separate for CPU compatibility
        }
    }

    /**
     * Apply interleaved buffer to Babylon.js mesh using custom vertex buffer layout
     */
    static applyInterleavedBuffer(mesh: Mesh, buffers: WasmRenderBuffersInterleaved): void {
        mesh.doNotSyncBoundingInfo = true
        
        // Create single interleaved vertex buffer
        const buffer = new VertexBuffer(
            mesh.getEngine(),
            buffers.interleavedData,
            'interleaved',
            false, // not updatable for performance
            false, // not instanced at buffer level
            this.INSTANCE_SIZE, // stride
            true    // instanced
        )
        
        // Set individual attribute views into the interleaved buffer
        mesh.setVerticesBuffer(buffer.createVertexBuffer('matrix', this.MATRIX_OFFSET, 16, this.INSTANCE_SIZE, true))
        mesh.setVerticesBuffer(buffer.createVertexBuffer('baseColor', this.COLOR_OFFSET, 4, this.INSTANCE_SIZE, true))
        mesh.setVerticesBuffer(buffer.createVertexBuffer('pickColor', this.PICK_COLOR_OFFSET, 3, this.INSTANCE_SIZE, true))
        mesh.setVerticesBuffer(buffer.createVertexBuffer('filePosition', this.FILE_POS_OFFSET, 1, this.INSTANCE_SIZE, true))
        mesh.setVerticesBuffer(buffer.createVertexBuffer('filePositionEnd', this.FILE_POS_END_OFFSET, 1, this.INSTANCE_SIZE, true))
        mesh.setVerticesBuffer(buffer.createVertexBuffer('tool', this.TOOL_OFFSET, 1, this.INSTANCE_SIZE, true))
        mesh.setVerticesBuffer(buffer.createVertexBuffer('feedRate', this.FEED_RATE_OFFSET, 1, this.INSTANCE_SIZE, true))
        
        mesh.thinInstanceCount = buffers.segmentCount
        mesh.thinInstanceRefreshBoundingInfo(false)
        mesh.isPickable = false
    }

    /**
     * Apply interleaved buffer using traditional thin instance API for compatibility
     */
    static applyInterleavedBufferLegacy(mesh: Mesh, buffers: WasmRenderBuffersInterleaved): void {
        mesh.doNotSyncBoundingInfo = true
        
        // Extract individual attribute arrays from interleaved data for legacy API
        const segmentCount = buffers.segmentCount
        const matrixData = new Float32Array(segmentCount * 16)
        const colorData = new Float32Array(segmentCount * 4)
        const pickData = new Float32Array(segmentCount * 3)
        const filePositionData = new Float32Array(segmentCount)
        const fileEndPositionData = new Float32Array(segmentCount)
        const toolData = new Float32Array(segmentCount)
        const feedRateData = new Float32Array(segmentCount)
        
        for (let i = 0; i < segmentCount; i++) {
            const offset = i * this.INSTANCE_SIZE
            
            // Extract matrix
            for (let j = 0; j < 16; j++) {
                matrixData[i * 16 + j] = buffers.interleavedData[offset + this.MATRIX_OFFSET + j]
            }
            
            // Extract color
            for (let j = 0; j < 4; j++) {
                colorData[i * 4 + j] = buffers.interleavedData[offset + this.COLOR_OFFSET + j]
            }
            
            // Extract pick color
            for (let j = 0; j < 3; j++) {
                pickData[i * 3 + j] = buffers.interleavedData[offset + this.PICK_COLOR_OFFSET + j]
            }
            
            // Extract single values
            filePositionData[i] = buffers.interleavedData[offset + this.FILE_POS_OFFSET]
            fileEndPositionData[i] = buffers.interleavedData[offset + this.FILE_POS_END_OFFSET]
            toolData[i] = buffers.interleavedData[offset + this.TOOL_OFFSET]
            feedRateData[i] = buffers.interleavedData[offset + this.FEED_RATE_OFFSET]
        }
        
        // Apply using traditional API
        mesh.thinInstanceSetBuffer('matrix', matrixData, 16, true)
        mesh.thinInstanceSetBuffer('baseColor', colorData, 4, true)
        mesh.thinInstanceSetBuffer('pickColor', pickData, 3, true)
        mesh.thinInstanceSetBuffer('filePosition', filePositionData, 1, true)
        mesh.thinInstanceSetBuffer('filePositionEnd', fileEndPositionData, 1, true)
        mesh.thinInstanceSetBuffer('tool', toolData, 1, true)
        mesh.thinInstanceSetBuffer('feedRate', feedRateData, 1, true)
        
        mesh.thinInstanceCount = segmentCount
        mesh.thinInstanceRefreshBoundingInfo(false)
        mesh.isPickable = false
    }

    /**
     * Create buffer pools for memory efficiency
     */
    static createInterleavedBuffer(segmentCount: number): Float32Array {
        return new Float32Array(segmentCount * this.INSTANCE_SIZE)
    }

    /**
     * Get layout information for debugging/introspection
     */
    static getLayoutInfo() {
        return {
            INSTANCE_SIZE: this.INSTANCE_SIZE,
            MATRIX_OFFSET: this.MATRIX_OFFSET,
            COLOR_OFFSET: this.COLOR_OFFSET,
            PICK_COLOR_OFFSET: this.PICK_COLOR_OFFSET,
            FILE_POS_OFFSET: this.FILE_POS_OFFSET,
            FILE_POS_END_OFFSET: this.FILE_POS_END_OFFSET,
            TOOL_OFFSET: this.TOOL_OFFSET,
            FEED_RATE_OFFSET: this.FEED_RATE_OFFSET,
            RESERVED_OFFSET: this.RESERVED_OFFSET
        }
    }
}