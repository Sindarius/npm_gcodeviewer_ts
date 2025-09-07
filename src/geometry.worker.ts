// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

// Dedicated worker to build render buffers off the main viewer worker
// Uses transferables to return ArrayBuffers without copy

import { Quaternion, Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector'

type BuildRequest = {
   type: 'build'
   nozzleSize: number
   segments: Array<{
      // minimal per-segment data
      start: [number, number, number]
      end: [number, number, number]
      color: [number, number, number, number]
      lineNumber: number
      filePosition: number
      fileEndPosition: number
      tool: number
      feedRate: number
      isPerimeter: boolean
      layerHeight: number
   }>
}

type BuildResponse = {
   type: 'buffers'
   segmentCount: number
   matrixData: Float32Array
   colorData: Float32Array
   pickData: Float32Array
   filePositionData: Float32Array
   fileEndPositionData: Float32Array
   toolData: Float32Array
   feedRate: Float32Array
   isPerimeterData: Float32Array
}

function numToColor(num = 0) {
   const r = (num & 0xff0000) >> 16
   const g = (num & 0x00ff00) >> 8
   const b = (num & 0x0000ff) >> 0
   return [r, g, b]
}

// Compose the same way Move.renderLine does: Matrix.Compose(scale, rotation, translation)
function composeMatrix(
   start: [number, number, number],
   end: [number, number, number],
   layerHeight: number,
   nozzleSize: number,
): Matrix {
   const sx = end[0] - start[0]
   const sy = end[1] - start[1]
   const sz = end[2] - start[2]

   const length = Math.sqrt(sx * sx + sy * sy + sz * sz)
   const mid = new Vector3((start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2)
   const r = Math.sqrt(sx * sx + sy * sy + sz * sz)
   const phi = Math.atan2(sz, sx)
   const theta = r === 0 ? 0 : Math.acos(sy / r)

   const scale = new Vector3(length, layerHeight, nozzleSize)
   const rot = Quaternion.FromEulerVector(new Vector3(0, -phi, Math.PI / 2 - theta))
   return Matrix.Compose(scale, rot, mid)
}

self.addEventListener('message', (ev: MessageEvent<BuildRequest>) => {
   const data = ev.data
   if (!data || data.type !== 'build') return

   const count = data.segments.length
   const matrixData = new Float32Array(16 * count)
   const colorData = new Float32Array(4 * count)
   const pickData = new Float32Array(3 * count)
   const filePositionData = new Float32Array(count)
   const fileEndPositionData = new Float32Array(count)
   const toolData = new Float32Array(count)
   const feedRate = new Float32Array(count)
   const isPerimeter = new Float32Array(count)

   for (let i = 0; i < count; i++) {
      const s = data.segments[i]
      const m = composeMatrix(s.start, s.end, s.layerHeight, data.nozzleSize)
      m.copyToArray(matrixData, i * 16)

      // base color
      colorData[i * 4] = s.color[0]
      colorData[i * 4 + 1] = s.color[1]
      colorData[i * 4 + 2] = s.color[2]
      colorData[i * 4 + 3] = s.color[3]

      // pick color derived from 1-based line number
      const id = numToColor(s.lineNumber)
      pickData[i * 3] = id[0] / 255
      pickData[i * 3 + 1] = id[1] / 255
      pickData[i * 3 + 2] = id[2] / 255

      filePositionData[i] = s.filePosition
      fileEndPositionData[i] = s.fileEndPosition
      // Pack tool + flags is unchanged here; upstream expects raw tool index
      toolData[i] = s.tool
      feedRate[i] = s.feedRate
      isPerimeter[i] = s.isPerimeter ? 1 : 0
   }

   const response: BuildResponse = {
      type: 'buffers',
      segmentCount: count,
      matrixData,
      colorData,
      pickData,
      filePositionData,
      fileEndPositionData,
      toolData,
      feedRate,
      isPerimeterData: isPerimeter,
   }

   // Transfer underlying ArrayBuffers to avoid copies
   ;(self as any).postMessage(response, [
      matrixData.buffer,
      colorData.buffer,
      pickData.buffer,
      filePositionData.buffer,
      fileEndPositionData.buffer,
      toolData.buffer,
      feedRate.buffer,
      isPerimeter.buffer,
   ])
})

