import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { Scene } from '@babylonjs/core/scene'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'

export class TubeGeometryBuilder {
  /**
   * Creates optimized tube geometry for shader-based expansion
   * This creates a cylindrical mesh that the vertex shader will position and scale
   */
  static CreateTubeGeometry(name: string, tubeSides: number, scene: Scene): Mesh {
    const mesh = new Mesh(name, scene)
    
    // Create vertices for a unit cylinder (radius 1, height 1, centered at origin)
    const vertexCount = (tubeSides + 1) * 2 // Two rings of vertices
    const indexCount = tubeSides * 6 // 2 triangles per side
    
    const positions: number[] = []
    const normals: number[] = []
    const indices: number[] = []
    
    // Generate vertices for two rings (top and bottom of cylinder)
    for (let ring = 0; ring < 2; ring++) {
      const z = ring - 0.5 // -0.5 to 0.5 (will be mapped to segment start/end)
      
      for (let i = 0; i <= tubeSides; i++) {
        const angle = (i / tubeSides) * 2 * Math.PI
        const x = Math.cos(angle) * 0.5 // Unit radius scaled to 0.5
        const y = Math.sin(angle) * 0.5
        
        positions.push(x, y, z)
        
        // Normal points outward from cylinder axis
        normals.push(Math.cos(angle), Math.sin(angle), 0)
      }
    }
    
    // Generate indices for tube sides
    const verticesPerRing = tubeSides + 1
    for (let i = 0; i < tubeSides; i++) {
      const bottomLeft = i
      const bottomRight = i + 1
      const topLeft = i + verticesPerRing
      const topRight = i + 1 + verticesPerRing
      
      // First triangle (bottom-left, top-left, bottom-right)
      indices.push(bottomLeft, topLeft, bottomRight)
      
      // Second triangle (bottom-right, top-left, top-right)
      indices.push(bottomRight, topLeft, topRight)
    }
    
    // Create vertex data
    const vertexData = new VertexData()
    vertexData.positions = positions
    vertexData.normals = normals
    vertexData.indices = indices
    
    // Apply to mesh
    vertexData.applyToMesh(mesh)
    
    return mesh
  }
  
  /**
   * Creates a simple quad geometry for line-based tube rendering
   * More efficient than full cylindrical geometry for distant objects
   */
  static CreateTubeQuadGeometry(name: string, scene: Scene): Mesh {
    const mesh = new Mesh(name, scene)
    
    // Simple quad with vertices that can be expanded in shader
    const positions = [
      // Quad vertices (will be expanded to tube in shader)
      -0.5, -0.5, -0.5,  // Bottom-left start
       0.5, -0.5, -0.5,  // Bottom-right start
       0.5,  0.5, -0.5,  // Top-right start  
      -0.5,  0.5, -0.5,  // Top-left start
      -0.5, -0.5,  0.5,  // Bottom-left end
       0.5, -0.5,  0.5,  // Bottom-right end
       0.5,  0.5,  0.5,  // Top-right end
      -0.5,  0.5,  0.5,  // Top-left end
    ]
    
    const normals = [
      0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,  // Start face
      0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,  // End face
    ]
    
    const indices = [
      // Start face
      0, 1, 2,  0, 2, 3,
      // End face  
      4, 6, 5,  4, 7, 6,
      // Sides
      0, 4, 1,  1, 4, 5,  // Bottom
      2, 6, 3,  3, 6, 7,  // Top
      0, 3, 4,  3, 7, 4,  // Left
      1, 5, 2,  2, 5, 6,  // Right
    ]
    
    const vertexData = new VertexData()
    vertexData.positions = positions
    vertexData.normals = normals
    vertexData.indices = indices
    
    vertexData.applyToMesh(mesh)
    
    return mesh
  }
  
  /**
   * Creates the most optimized geometry - a simple line that expands to tube in shader
   */
  static CreateTubeLineGeometry(name: string, scene: Scene): Mesh {
    const mesh = new Mesh(name, scene)
    
    // Ultra-simple: just two vertices representing start and end of segment
    const positions = [
      0, 0, -0.5,  // Segment start
      0, 0,  0.5,  // Segment end
    ]
    
    const normals = [
      0, 1, 0,  // Up normal
      0, 1, 0,  // Up normal
    ]
    
    // No indices needed for lines
    const vertexData = new VertexData()
    vertexData.positions = positions
    vertexData.normals = normals
    
    vertexData.applyToMesh(mesh)
    
    return mesh
  }

  /**
   * Creates a simple rotated box geometry for ultra-fast tube rendering
   * This is a 45-degree rotated square cross-section - like a diamond shape
   * Much faster than cylindrical geometry with only 8 vertices instead of 16+
   */
  static CreateTubeBoxGeometry(name: string, scene: Scene): Mesh {
    const mesh = new Mesh(name, scene)
    
    // Create a box rotated 45 degrees - diamond cross-section
    // Only 8 vertices total (4 per end cap)
    const sqrt2_2 = Math.sqrt(2) / 2 // 45-degree rotation factor
    
    const positions = [
      // Start ring (z = -0.5) - diamond shape
       sqrt2_2,  0,       -0.5,  // Top
       0,        sqrt2_2, -0.5,  // Right  
      -sqrt2_2,  0,       -0.5,  // Bottom
       0,       -sqrt2_2, -0.5,  // Left
      
      // End ring (z = 0.5) - diamond shape
       sqrt2_2,  0,        0.5,  // Top
       0,        sqrt2_2,  0.5,  // Right
      -sqrt2_2,  0,        0.5,  // Bottom  
       0,       -sqrt2_2,  0.5,  // Left
    ]
    
    const normals = [
      // Start ring normals (pointing outward from center)
       sqrt2_2,  sqrt2_2, 0,  // Top-right diagonal
      -sqrt2_2,  sqrt2_2, 0,  // Top-left diagonal
      -sqrt2_2, -sqrt2_2, 0,  // Bottom-left diagonal
       sqrt2_2, -sqrt2_2, 0,  // Bottom-right diagonal
      
      // End ring normals (same as start)
       sqrt2_2,  sqrt2_2, 0,
      -sqrt2_2,  sqrt2_2, 0,
      -sqrt2_2, -sqrt2_2, 0,
       sqrt2_2, -sqrt2_2, 0,
    ]
    
    const indices = [
      // 4 rectangular faces around the tube (2 triangles each)
      // Face 1: Top (0->4->1->5)
      0, 4, 1,  1, 4, 5,
      // Face 2: Right (1->5->2->6)  
      1, 5, 2,  2, 5, 6,
      // Face 3: Bottom (2->6->3->7)
      2, 6, 3,  3, 6, 7,
      // Face 4: Left (3->7->0->4)
      3, 7, 0,  0, 7, 4,
    ]
    
    const vertexData = new VertexData()
    vertexData.positions = positions
    vertexData.normals = normals
    vertexData.indices = indices
    
    vertexData.applyToMesh(mesh)
    
    return mesh
  }
}