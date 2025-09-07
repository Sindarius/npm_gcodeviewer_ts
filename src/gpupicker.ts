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
   private _lastReadTime: number = 0
   // Optional scissor optimization
   private _useScissor: boolean = false
   private _scissorSize: number = 16
   private _lastScissorX: number = 0
   private _lastScissorY: number = 0

   //  shaderMaterial: CustomMaterial
   shaderMaterial: ShaderMaterial
   constructor(scene: Scene, engine: Engine, width: number, height: number) {
      this.scene = scene
      this.engine = engine
      this.width = width
      this.height = height
      this.renderTarget = new RenderTargetTexture('rt', { width, height }, this.scene, true)
      this.renderTarget.clearColor = new Color4(0, 0, 0, 0)
      this.renderTarget.refreshRate = 1
      this.scene.customRenderTargets.push(this.renderTarget)
      console.log(this.scene.customRenderTargets)
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

      let isEnabled = false
      this.renderTarget.onBeforeRenderObservable.add(() => {
         if (!this.enabled) return
         if (this.renderTargetMeshs) {
            isEnabled = this.renderTargetMeshs[0]?.isEnabled() ?? false
            this.renderTargetMeshs.forEach((m) => m.setEnabled(true))
         }

         // Optionally scissor the render area around the pointer to reduce fragment work
         if (this._useScissor) {
            const gl: WebGLRenderingContext | WebGL2RenderingContext | undefined = (this.engine as any)?._gl
            if (gl) {
               const hx = Math.max(1, (this._scissorSize | 0))
               const half = Math.floor(hx / 2)
               const px = Math.round(this.scene.pointerX)
               const py = Math.round(this.scene.pointerY)
               // Convert to RTT coordinates (origin bottom-left)
               this._lastScissorX = Math.max(0, Math.min(this.width - hx, px - half))
               this._lastScissorY = Math.max(0, Math.min(this.height - hx, this.height - py - half))
               gl.enable(gl.SCISSOR_TEST)
               gl.scissor(this._lastScissorX, this._lastScissorY, hx, hx)
            }
         }
      })
      this.renderTarget.onAfterRenderObservable.add(() => {
         if (!this.enabled) return
         // Restore scissor state
         if (this._useScissor) {
            const gl: WebGLRenderingContext | WebGL2RenderingContext | undefined = (this.engine as any)?._gl
            if (gl) {
               gl.disable(gl.SCISSOR_TEST)
            }
         }
         const now = performance.now()
         if (now - this._lastReadTime < this.throttleMs) {
            // restore mesh enable state even if skipping readback
            if (this.renderTargetMeshs && !isEnabled) this.renderTargetMeshs.forEach((m) => m.setEnabled(false))
            return
         }
         this._lastReadTime = now

         const x = Math.round(this.scene.pointerX)
         const y = this.height - Math.round(this.scene.pointerY)

         const pixels = this.readTexturePixels(
            this.engine._gl,
            this.renderTarget._texture._hardwareTexture.underlyingResource,
            x,
            y,
            1,
            1,
         )

         if (this.colorTestCallBack) {
            this.colorTestCallBack(pixels)
         }
         if (this.renderTargetMeshs && !isEnabled) {
            this.renderTargetMeshs.forEach((m) => m.setEnabled(false))
         }
      })
   }

   readTexturePixels(gl, texture, x, y, w, h) {
      const frameBuffer = gl.createFramebuffer()
      const pixels = new Uint8Array(w * h * 4)

      gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
      gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

      return pixels
   }

   updateRenderTargetSize(width, height) {
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
      this.renderTarget.setMaterialForRendering(this.renderTargetMeshs, this.shaderMaterial)
      this.renderTarget.renderList.push(mesh)
   }

   updateCurrentPosition(currentPosition: number) {
      this.currentPosition = currentPosition
      this.shaderMaterial.setFloat('currentPosition', this.currentPosition)
   }

   setEnabled(enabled: boolean) {
      this.enabled = enabled
      // Skip whole render pass when disabled
      // @ts-ignore - property exists on RenderTargetTexture
      ;(this.renderTarget as any).skipRendering = !enabled
   }

   setThrottleMs(ms: number) {
      this.throttleMs = Math.max(0, ms | 0)
   }

   // Enable/disable scissor optimization (limits pick pass to a small region around the pointer)
   enableScissor(enabled: boolean) {
      this._useScissor = !!enabled
   }

   setScissorSize(sizePx: number) {
      this._scissorSize = Math.max(1, sizePx | 0)
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
   // Decode packed tool + flags if present: toolIndex + 1024*(b0=travel,...)
   float flags = floor(fTool / 1024.0);
   bool flagTravel = mod(flags, 2.0) >= 1.0;
   // Backward compatibility: old travel encoded as tool >= 254
   // Legacy travel encoding applies only when no packed flags are present
   bool legacyTravel = (fTool < 1024.0) && (fTool >= 254.0);

   if(vShow < 0.0 || flagTravel || legacyTravel) {
      discard;
   } else {
      gl_FragColor = vPickColor; // Write raw color, no conversions to preserve ID fidelity
      #if defined(PREPASS)
      gl_FragData[0] = gl_FragColor;
      #endif
   }
}
`
