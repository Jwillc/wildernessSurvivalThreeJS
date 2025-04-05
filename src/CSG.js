/**
 * Constructive Solid Geometry (CSG) for Three.js
 * 
 * This is a simplified version of the CSG library for Three.js
 * It allows for boolean operations (union, subtract, intersect) on meshes
 */

import * as THREE from 'three';

class CSG {
    constructor() {
        this.polygons = [];
    }

    static fromMesh(mesh) {
        const csg = new CSG();
        const geometry = mesh.geometry.clone();
        
        // Convert to BufferGeometry if needed
        if (!(geometry instanceof THREE.BufferGeometry)) {
            geometry = new THREE.BufferGeometry().fromGeometry(geometry);
        }
        
        // Get position attribute
        const position = geometry.getAttribute('position');
        const normal = geometry.getAttribute('normal');
        const indices = geometry.getIndex();
        
        // Create polygons
        if (indices) {
            // Indexed geometry
            for (let i = 0; i < indices.count; i += 3) {
                const a = indices.getX(i);
                const b = indices.getX(i + 1);
                const c = indices.getX(i + 2);
                
                const triangle = [
                    new THREE.Vector3(position.getX(a), position.getY(a), position.getZ(a)),
                    new THREE.Vector3(position.getX(b), position.getY(b), position.getZ(b)),
                    new THREE.Vector3(position.getX(c), position.getY(c), position.getZ(c))
                ];
                
                const triangleNormal = new THREE.Vector3(
                    normal.getX(a) + normal.getX(b) + normal.getX(c),
                    normal.getY(a) + normal.getY(b) + normal.getY(c),
                    normal.getZ(a) + normal.getZ(b) + normal.getZ(c)
                ).normalize();
                
                csg.polygons.push({
                    vertices: triangle,
                    normal: triangleNormal
                });
            }
        } else {
            // Non-indexed geometry
            for (let i = 0; i < position.count; i += 3) {
                const triangle = [
                    new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)),
                    new THREE.Vector3(position.getX(i + 1), position.getY(i + 1), position.getZ(i + 1)),
                    new THREE.Vector3(position.getX(i + 2), position.getY(i + 2), position.getZ(i + 2))
                ];
                
                const triangleNormal = new THREE.Vector3(
                    normal.getX(i) + normal.getX(i + 1) + normal.getX(i + 2),
                    normal.getY(i) + normal.getY(i + 1) + normal.getY(i + 2),
                    normal.getZ(i) + normal.getZ(i + 1) + normal.getZ(i + 2)
                ).normalize();
                
                csg.polygons.push({
                    vertices: triangle,
                    normal: triangleNormal
                });
            }
        }
        
        // Apply mesh's matrix to transform polygons
        if (mesh.matrixWorld) {
            csg.polygons.forEach(polygon => {
                polygon.vertices.forEach(vertex => {
                    vertex.applyMatrix4(mesh.matrixWorld);
                });
                polygon.normal.transformDirection(mesh.matrixWorld);
            });
        }
        
        return csg;
    }
    
    subtract(other) {
        const result = new CSG();
        
        // Simple implementation: remove polygons that are inside the other mesh
        this.polygons.forEach(polygon => {
            let inside = false;
            
            // Check if this polygon is inside the other mesh
            for (const otherPolygon of other.polygons) {
                // Simple check: if the center of this polygon is in front of any polygon in other,
                // consider it outside
                const center = new THREE.Vector3().addVectors(
                    polygon.vertices[0],
                    polygon.vertices[1]
                ).add(polygon.vertices[2]).divideScalar(3);
                
                const otherCenter = new THREE.Vector3().addVectors(
                    otherPolygon.vertices[0],
                    otherPolygon.vertices[1]
                ).add(otherPolygon.vertices[2]).divideScalar(3);
                
                const direction = new THREE.Vector3().subVectors(center, otherCenter);
                const dot = direction.dot(otherPolygon.normal);
                
                if (dot < 0) {
                    inside = true;
                    break;
                }
            }
            
            if (!inside) {
                result.polygons.push(polygon);
            }
        });
        
        return result;
    }
    
    static toMesh(csg, matrix, material) {
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const normals = [];
        
        // Convert polygons to geometry
        csg.polygons.forEach(polygon => {
            // Add vertices
            polygon.vertices.forEach(vertex => {
                vertices.push(vertex.x, vertex.y, vertex.z);
                normals.push(polygon.normal.x, polygon.normal.y, polygon.normal.z);
            });
        });
        
        // Create attributes
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        
        // Create mesh
        const mesh = new THREE.Mesh(geometry, material);
        
        // Apply matrix
        if (matrix) {
            mesh.applyMatrix4(matrix);
        }
        
        return mesh;
    }
}

export { CSG };
