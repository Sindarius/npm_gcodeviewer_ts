import { Engine } from '@babylonjs/core/Engines/engine'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { Scene } from '@babylonjs/core/scene'
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial'
import { Color4 } from '@babylonjs/core/Maths/math.color'
import '@babylonjs/core/Engines/thinEngine'

export default class GPUPicker {
   scene: Scene
   engine: Engine
   renderTarget: RenderTargetTexture
   width: number
   height: number
   colorTestCallBack: any
   currentPosition: number = 0
   renderTargetMeshs: Mesh[] = []
   enabled: boolean = true
   throttleMs: number = 50
   private _isBatching: boolean = false
   private _lastReadTime: number = 0
   private _useScissor: boolean = true
   private _scissorSize: number = 32
   private _lastScissorX: number = 0
   private _lastScissorY: number = 0
   private _gl: WebGLRenderingContext | WebGL2RenderingContext | null = null

   shaderMaterial: ShaderMaterial

   constructor(scene: Scene, engine: Engine, width: number, height: number) {
      this.scene = scene
      this.engine = engine
      this.width = width
      this.height = height
      this._gl = (this.engine as any)?._gl || null

      this._setupRenderTarget()
      this._setupShaderMaterial()
      this._setupRenderCallbacks()
   }

   private _setupRenderTarget() {
      this.renderTarget = new RenderTargetTexture('rt', { width: this.width, height: this.height }, this.scene, true)
      this.renderTarget.clearColor = new Color4(0, 0, 0, 0)
      this.renderTarget.refreshRate = 1
      this.scene.customRenderTargets.push(this.renderTarget)
   }

   private _setupShaderMaterial() {
      this.shaderMaterial = new ShaderMaterial(
         'pick_mat',
         this.scene,
         {
            vertexSource: vertexShader,
            fragmentSource: fragmentShader,
         },
         {
            attributes: ['position', 'pickColor', 'filePosition', 'tool'],
            uniforms: [
               'world',
               'worldView', 
               'worldViewProjection',
               'view',
               'projection',
               'viewProjection',
               'currentPosition',
            ],
         },
      )
   }

   private _setupRenderCallbacks() {
      let wasEnabled = false

      this.renderTarget.onBeforeRenderObservable.add(() => {
         if (!this.enabled) return

         wasEnabled = this._enableMeshesForPicking()
         this._enableScissorTest()
      })

      this.renderTarget.onAfterRenderObservable.add(() => {
         if (!this.enabled) return

         this._disableScissorTest()
         
         if (this._shouldReadPixels()) {
            this._readAndProcessPixels()
         }
         
         this._restoreMeshStates(wasEnabled)
      })
   }

   private _enableMeshesForPicking(): boolean {
      if (!this.renderTargetMeshs.length) return false
      const wasEnabled = this.renderTargetMeshs[0]?.isEnabled() ?? false
      this.renderTargetMeshs.forEach((m) => m.setEnabled(true))
      return wasEnabled
   }

   private _enableScissorTest() {
      if (!this._useScissor || !this._gl) return

      const half = Math.floor(this._scissorSize / 2)
      const px = Math.round(this.scene.pointerX)
      const py = Math.round(this.scene.pointerY)
      
      this._lastScissorX = Math.max(0, Math.min(this.width - this._scissorSize, px - half))
      this._lastScissorY = Math.max(0, Math.min(this.height - this._scissorSize, this.height - py - half))
      
      this._gl.enable(this._gl.SCISSOR_TEST)
      this._gl.scissor(this._lastScissorX, this._lastScissorY, this._scissorSize, this._scissorSize)
   }

   private _disableScissorTest() {
      if (this._useScissor && this._gl) {
         this._gl.disable(this._gl.SCISSOR_TEST)
      }
   }

   private _shouldReadPixels(): boolean {
      const now = performance.now()
      if (now - this._lastReadTime < this.throttleMs) return false
      this._lastReadTime = now
      return true
   }

   private _readAndProcessPixels() {
      const x = Math.round(this.scene.pointerX)
      const y = this.height - Math.round(this.scene.pointerY)

      const pixels = this._readTexturePixels(x, y, 1, 1)
      
      if (this.colorTestCallBack) {
         this.colorTestCallBack(pixels)
      }
   }

   private _restoreMeshStates(wasEnabled: boolean) {
      if (this.renderTargetMeshs.length && !wasEnabled) {
         this.renderTargetMeshs.forEach((m) => m.setEnabled(false))
      }
   }

   private _readTexturePixels(x: number, y: number, w: number, h: number): Uint8Array {
      if (!this._gl) return new Uint8Array(w * h * 4)

      const frameBuffer = this._gl.createFramebuffer()
      const pixels = new Uint8Array(w * h * 4)

      this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, frameBuffer)
      this._gl.framebufferTexture2D(
         this._gl.FRAMEBUFFER, 
         this._gl.COLOR_ATTACHMENT0, 
         this._gl.TEXTURE_2D, 
         this.renderTarget._texture._hardwareTexture.underlyingResource, 
         0
      )
      this._gl.readPixels(x, y, w, h, this._gl.RGBA, this._gl.UNSIGNED_BYTE, pixels)

      return pixels
   }

   updateRenderTargetSize(width: number, height: number) {
      this.width = width
      this.height = height
      this.renderTarget.resize({ width, height })
   }

   clearRenderList() {
      this.renderTarget.renderList = []
      this.renderTargetMeshs = []
   }

   addToRenderList(mesh: Mesh) {
      this.renderTargetMeshs.push(mesh)
      this.renderTarget.renderList.push(mesh)
      
      // Only update material assignment if not in batch mode
      if (!this._isBatching) {
         this.renderTarget.setMaterialForRendering(this.renderTargetMeshs, this.shaderMaterial)
      }
   }

   updateCurrentPosition(currentPosition: number) {
      this.currentPosition = currentPosition
      this.shaderMaterial.setFloat('currentPosition', this.currentPosition)
   }

   private removeFromScene() {
      const index = this.scene.customRenderTargets.indexOf(this.renderTarget)
      if (index > -1) {
         this.scene.customRenderTargets.splice(index, 1)
      }
   }

   private addToScene() {
      if (!this.scene.customRenderTargets.includes(this.renderTarget)) {
         this.scene.customRenderTargets.push(this.renderTarget)
      }
   }

   setEnabled(enabled: boolean) {
      this.enabled = enabled
      ;(this.renderTarget as any).skipRendering = !enabled
      
      if (enabled) {
         this.addToScene()
      } else {
         this.removeFromScene()
      }
   }

   beginBatch() {
      this._isBatching = true
   }

   endBatch() {
      this._isBatching = false
      // Update material assignment once for all accumulated meshes
      if (this.renderTargetMeshs.length > 0) {
         this.renderTarget.setMaterialForRendering(this.renderTargetMeshs, this.shaderMaterial)
      }
   }

   setThrottleMs(ms: number) {
      this.throttleMs = Math.max(0, ms | 0)
   }

   enableScissor(enabled: boolean) {
      this._useScissor = !!enabled
   }

   setScissorSize(sizePx: number) {
      this._scissorSize = Math.max(1, sizePx | 0)
   }

   configurePerformance(options: { scissor?: boolean; scissorSize?: number; throttleMs?: number }) {
      if (options.scissor !== undefined) this.enableScissor(options.scissor)
      if (options.scissorSize !== undefined) this.setScissorSize(options.scissorSize)
      if (options.throttleMs !== undefined) this.setThrottleMs(options.throttleMs)
   }

   optimizeForPerformance() {
      this.configurePerformance({ scissor: true, scissorSize: 16, throttleMs: 100 })
   }

   optimizeForPrecision() {
      this.configurePerformance({ scissor: false, throttleMs: 16 })
   }

   getPerformanceInfo() {
      return {
         scissorEnabled: this._useScissor,
         scissorSize: this._scissorSize,
         throttleMs: this.throttleMs,
         meshCount: this.renderTargetMeshs.length,
         targetSize: `${this.width}×${this.height}`
      }
   }


   dispose() {
      // Remove from scene
      this.removeFromScene()
      
      // Clear render lists
      this.clearRenderList()
      
      // Remove observables
      this.renderTarget.onBeforeRenderObservable.clear()
      this.renderTarget.onAfterRenderObservable.clear()
      
      // Dispose shader material
      if (this.shaderMaterial) {
         this.shaderMaterial.dispose()
      }
      
      // Dispose render target
      if (this.renderTarget) {
         this.renderTarget.dispose()
      }
   }
}

const vertexShader = `
// Vertex shader
#define THIN_INSTANCES
#if defined(WEBGL2) || defines(WEBGPU)
precision highp sampler2DArray;
#endif
precision highp float;

        // Attributes
        attribute vec3 position;
         attribute vec3 pickColor;
         attribute float filePosition;
         attribute float tool;

        // Uniforms
        uniform mat4 viewProjection;
        uniform float currentPosition;


        //to fragment

        flat out vec4 vPickColor;
        flat out float vShow;
        flat out float fTool;

#include<instancesDeclaration>


void main(void) {
   #include<instancesVertex>
   gl_Position = viewProjection * finalWorld * vec4(position, 1.0);
   vPickColor = vec4(pickColor, 1.0);
   vShow = currentPosition - filePosition;
   fTool = tool;
}
`

const fragmentShader = `
// Fragment shader
#if defined(PREPASS)
#extension GL_EXT_draw_buffers : require
layout(location = 0) out highp vec4 glFragData[SCENE_MRT_COUNT];
highp vec4 gl_FragColor;
#endif
#if defined(WEBGL2) || defines(WEBGPU)
precision highp sampler2DArray;
#endif
precision highp float;

uniform mat4 u_World;
uniform mat4 u_ViewProjection;
uniform vec4 u_color;


flat in vec4 vPickColor;
flat in float vShow;
flat in float fTool;

#include<helperFunctions>

void main(void) {
   // Decode packed tool + flags if present: toolIndex + 1024*(b0=travel,b1=perimeter,b2=support,b3=retraction,b4=zero-movement)
   float flags = floor(fTool / 1024.0);
   bool flagTravel = mod(flags, 2.0) >= 1.0;
   bool flagZeroMovement = mod(floor(flags / 16.0), 2.0) >= 1.0;
   // Backward compatibility: old travel encoded as tool >= 254
   // Legacy travel encoding applies only when no packed flags are present
   bool legacyTravel = (fTool < 1024.0) && (fTool >= 254.0);

   // Discard zero-movement segments (feedrate-only commands)
   if(flagZeroMovement || vShow < 0.0 || flagTravel || legacyTravel) {
      discard;
   } else {
      gl_FragColor = vPickColor; // Write raw color, no conversions to preserve ID fidelity
      #if defined(PREPASS)
      gl_FragData[0] = gl_FragColor;
      #endif
   }
}
`
