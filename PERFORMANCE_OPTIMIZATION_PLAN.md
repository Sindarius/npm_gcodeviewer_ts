# G-code Viewer Performance Optimization Plan

## Current System Analysis

Your current thin instance approach uses:
- LineShaderMaterial with traditional thin instances
- Multiple mesh types (box/cylinder/line) with mode switching
- WASM-generated render buffers with separate data streams
- Matrix-based transformations for each segment
- Multiple draw calls for different mesh types

**Key Bottlenecks Identified:**
1. Heavy 3D geometry (boxes/cylinders) for simple line segments
2. Multiple separate meshes requiring mode switching
3. Inefficient memory layout with separate attribute buffers
4. No spatial culling or level-of-detail system
5. Redundant draw calls for inactive mesh modes

---

## Optimization Plan: Items 2, 4, and 5

### **Item 2: Shader-Based 3D Tube Rendering from 2D Lines**

#### **Goal**
Replace heavy 3D box/cylinder geometry with lightweight 2D lines that expand to 3D tubes in the vertex shader.

#### **Current State**
```javascript
// Creates heavy geometry for each mode
let box = MeshBuilder.CreateBox('box', { width: 1, height: 1, depth: 1 }, scene)
let cyl = MeshBuilder.CreateCylinder('cyl', { height: 1, diameter: 1 }, scene) 
let line = MeshBuilder.CreateLines('line', { points: [...] }, scene)
```

#### **Target State**
```javascript
// Single lightweight line mesh with shader expansion
let tubeLines = MeshBuilder.CreateLines('tubeLines', { points: [...] }, scene)
// Shader handles tube expansion based on uniforms
```

#### **Implementation Details**

**Phase 2a: Create Tube Expansion Shader**
- Modify LineShaderMaterial vertex shader to expand 2D lines to 3D tubes
- Use instance attributes to store segment start/end positions and radius
- Calculate tube cross-section vertices in vertex shader
- Support variable radius along segment length

**Vertex Shader Changes:**
```glsl
// Add tube-specific uniforms
uniform bool tubeMode;
uniform float globalTubeRadius;
uniform int tubeSides; // 6-8 for performance vs quality

// Expand line to tube in vertex shader
if (tubeMode) {
    vec3 segmentDir = normalize(endPos - startPos);
    vec3 right = normalize(cross(segmentDir, viewDir));
    vec3 up = cross(right, segmentDir);
    
    // Generate tube vertices on GPU
    float angle = float(gl_VertexID % tubeSides) * 2.0 * PI / float(tubeSides);
    float t = float(gl_VertexID / tubeSides); // 0.0 to 1.0 along segment
    
    vec3 center = mix(startPos, endPos, t);
    vec3 offset = (cos(angle) * right + sin(angle) * up) * radius;
    
    gl_Position = viewProjection * vec4(center + offset, 1.0);
}
```

**Phase 2b: Optimize Geometry Creation**
- Replace CreateBox/CreateCylinder with optimized line-to-tube geometry
- Use instanced quads or geometry shader expansion
- Eliminate unused mesh modes entirely

**Expected Performance Gains:**
- **Memory Usage**: 90% reduction (2 vertices vs 24+ for box)
- **GPU Geometry Processing**: 80% reduction
- **Draw Calls**: 66% reduction (single mesh vs 3)

---

### **Item 4: Memory and Buffer Optimizations**

#### **Goal**
Optimize memory layout and buffer management for maximum GPU cache efficiency and reduced bandwidth.

#### **Current Issues**
- Separate attribute buffers cause cache misses
- Non-interleaved data layout increases memory bandwidth
- Redundant data copying between WASM and JS
- Buffer fragmentation with multiple mesh types

#### **Implementation Details**

**Phase 4a: Interleaved Vertex Buffers**
```javascript
// Current: Separate buffers
mesh.thinInstanceSetBuffer('matrix', matrixData, 16, true)
mesh.thinInstanceSetBuffer('baseColor', colorData, 4, true)
mesh.thinInstanceSetBuffer('pickColor', pickData, 3, true)
// ... 7 more separate buffers

// Target: Single interleaved buffer
const INSTANCE_SIZE = 28; // floats per instance
const interleavedData = new Float32Array(segmentCount * INSTANCE_SIZE);
for (let i = 0; i < segmentCount; i++) {
    const offset = i * INSTANCE_SIZE;
    // Pack all data together for cache efficiency
    interleavedData.set(matrixData.subarray(i * 16, (i + 1) * 16), offset);
    interleavedData.set(colorData.subarray(i * 4, (i + 1) * 4), offset + 16);
    interleavedData.set(pickData.subarray(i * 3, (i + 1) * 3), offset + 20);
    // ... other attributes
}
```

**Phase 4b: Buffer Pooling and Reuse**
- Implement buffer pools to avoid GC pressure
- Reuse buffers between mesh rebuilds
- Use transferable objects for WASM-JS communication
- Implement streaming buffer updates for large files

**Phase 4c: Compressed Attribute Formats**
```javascript
// Use half-float precision where possible
// Pack flags into single integers
// Use normalized formats for colors
const optimizedLayout = {
    position: { format: 'float32', components: 3 },
    color: { format: 'uint8_normalized', components: 4 },
    flags: { format: 'uint32', components: 1 }, // packed
    feedRate: { format: 'float16', components: 1 }
};
```

**Expected Performance Gains:**
- **Memory Bandwidth**: 40-60% reduction
- **Cache Performance**: 3-5x improvement
- **GC Pressure**: 80% reduction
- **WASM-JS Transfer**: 50% faster

---

### **Item 5: Advanced GPU Culling Features**

#### **Goal**
Implement sophisticated GPU-based culling to render only visible geometry, dramatically improving performance for large models.

#### **Current State**
- No spatial culling (all segments rendered always)
- Basic frustum culling handled by Babylon.js
- No level-of-detail system
- No layer-based visibility

#### **Implementation Strategy**

**Phase 5a: Layer-Based Culling**
```glsl
// Add to vertex shader
uniform float minVisibleLayer;
uniform float maxVisibleLayer;
uniform bool layerCullingEnabled;

if (layerCullingEnabled) {
    float segmentZ = (startPos.z + endPos.z) * 0.5;
    if (segmentZ < minVisibleLayer || segmentZ > maxVisibleLayer) {
        gl_Position = vec4(-2.0, -2.0, -2.0, 1.0); // Cull vertex
        return;
    }
}
```

**Phase 5b: Distance-Based LOD**
```javascript
// GPU-based distance culling
uniform vec3 cameraPosition;
uniform float maxRenderDistance;
uniform float lodThreshold1; // Switch to simplified rendering
uniform float lodThreshold2; // Cull completely

// In vertex shader
float distanceToCamera = distance(segmentCenter, cameraPosition);
if (distanceToCamera > maxRenderDistance) {
    gl_Position = vec4(-2.0, -2.0, -2.0, 1.0);
    return;
}

// Adjust tube detail based on distance
int tubeSides = distanceToCamera < lodThreshold1 ? 8 : 
                distanceToCamera < lodThreshold2 ? 4 : 3;
```

**Phase 5c: Frustum Culling Optimization**
- Use compute shaders for frustum culling when available
- Implement hierarchical culling (cull chunks, then segments)
- Add backface culling for dense interior segments
- Implement occlusion culling for very large models

**Phase 5d: Indirect Drawing**
```javascript
// Use indirect drawing to dynamically adjust instance counts
const indirectBuffer = scene.getEngine().createBuffer(...);
// GPU computes how many instances to draw based on culling results
mesh.drawInstancedIndirect(indirectBuffer);
```

**Expected Performance Gains:**
- **Layer Culling**: 10-50x improvement for tall prints
- **Distance LOD**: 2-10x improvement based on zoom level
- **Frustum Optimization**: 20-40% improvement
- **Combined**: Should match Three.js viewer performance

---

## Implementation Order and Timeline

### **Week 1: Shader Tube Expansion (Item 2)**
- Day 1-2: Create tube expansion vertex shader
- Day 3-4: Implement instanced line-to-quad geometry
- Day 5: Integrate with existing thin instance system
- Day 6-7: Testing and refinement

### **Week 2: Memory Optimization (Item 4)**
- Day 1-2: Implement interleaved buffer layout
- Day 3-4: Add buffer pooling system
- Day 5-6: Optimize WASM-JS data transfer
- Day 7: Performance testing and validation

### **Week 3: GPU Culling (Item 5)**
- Day 1-2: Implement layer-based culling
- Day 3-4: Add distance-based LOD
- Day 5-6: Optimize frustum culling
- Day 7: Integration testing

### **Week 4: Integration and Polish**
- Day 1-3: Integrate all optimizations
- Day 4-5: Performance benchmarking
- Day 6-7: Bug fixes and refinement

---

## Success Metrics

**Performance Targets:**
- **Frame Rate**: 60 FPS for 1M+ segment models
- **Memory Usage**: 50% reduction in GPU memory
- **Load Time**: 70% faster mesh generation
- **Responsiveness**: No frame drops during interaction

**Comparison Benchmarks:**
- Match or exceed Three.js G-code viewer performance
- Handle 5M+ segment prints smoothly
- Maintain 60 FPS during camera movement
- Sub-second layer visibility changes

---

## Risk Assessment

**Low Risk:**
- Layer culling (shader-based, easy to disable)
- Buffer interleaving (gradual migration possible)

**Medium Risk:**
- Shader tube expansion (complex but well-understood technique)
- Distance LOD (may need tuning for different model types)

**High Risk:**
- Indirect drawing (browser support varies)
- Compute shader culling (WebGL 2.0 requirement)

**Mitigation Strategy:**
- Implement features as optional enhancements
- Maintain fallback to current system
- Use feature detection for advanced GPU features
- Gradual rollout with performance monitoring

---

## Technical Notes

### **WebGL Compatibility**
- Target WebGL 1.0 for maximum compatibility
- Use WebGL 2.0 features when available (compute shaders, transform feedback)
- Implement fallbacks for older hardware

### **Browser Performance**
- Test on Chrome, Firefox, Safari, Edge
- Validate on mobile devices (WebGL ES)
- Consider memory constraints on mobile

### **Babylon.js Integration**
- Work within Babylon.js thin instance system
- Leverage Babylon.js optimization features
- Maintain compatibility with existing materials/shaders

This plan should achieve performance parity with the Three.js G-code viewer while maintaining the rich feature set of your Babylon.js implementation.