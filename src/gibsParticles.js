import * as THREE from 'three';

/**
 * Creates a bloody gibs explosion effect at the given position
 * @param {THREE.Scene} scene - The scene to add particles to
 * @param {THREE.Vector3} position - The position to create particles at
 * @returns {THREE.Group} - The particle group
 */
export function createGibsExplosion(scene, position) {
    // Create a group to hold all gibs particles
    const particleGroup = new THREE.Group();
    
    // Position the particle group at the given position
    particleGroup.position.copy(position);
    
    // Create particle materials with bloody colors
    const bloodMaterials = [
        new THREE.MeshBasicMaterial({ color: 0x8a0303, transparent: true, opacity: 0.9 }), // Dark red
        new THREE.MeshBasicMaterial({ color: 0xb00000, transparent: true, opacity: 0.8 }), // Medium red
        new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.7 })  // Bright red
    ];
    
    // Create materials for bone/flesh chunks
    const fleshMaterials = [
        new THREE.MeshBasicMaterial({ color: 0xf4a460, transparent: true, opacity: 0.9 }), // Sandy brown
        new THREE.MeshBasicMaterial({ color: 0xffdab9, transparent: true, opacity: 0.8 }), // Peach
        new THREE.MeshBasicMaterial({ color: 0xe8e4c9, transparent: true, opacity: 0.9 })  // Bone color
    ];
    
    // Create geometries for particles
    const bloodGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const smallChunkGeometry = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    const mediumChunkGeometry = new THREE.BoxGeometry(0.25, 0.25, 0.25);
    const largeChunkGeometry = new THREE.BoxGeometry(0.4, 0.2, 0.2);
    
    // Create blood splatter particles
    const bloodCount = 50;
    for (let i = 0; i < bloodCount; i++) {
        // Choose a random material
        const material = bloodMaterials[Math.floor(Math.random() * bloodMaterials.length)];
        const particle = new THREE.Mesh(bloodGeometry, material.clone());
        
        // Random initial position near center
        particle.position.set(
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.5
        );
        
        // Random scale for variety
        const scale = 0.5 + Math.random() * 1.5;
        particle.scale.set(scale, scale, scale);
        
        // Add animation data
        particle.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.3,
            -0.1 - Math.random() * 0.3, // Mostly downward
            (Math.random() - 0.5) * 0.3
        );
        particle.userData.rotationSpeed = new THREE.Vector3(
            (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.2
        );
        particle.userData.fadeSpeed = 0.01 + Math.random() * 0.02;
        particle.userData.gravity = 0.01 + Math.random() * 0.01;
        
        particleGroup.add(particle);
    }
    
    // Create flesh/bone chunks
    const chunkCount = 20;
    for (let i = 0; i < chunkCount; i++) {
        // Choose a random material and geometry
        const material = fleshMaterials[Math.floor(Math.random() * fleshMaterials.length)];
        
        // Select a random geometry based on probability
        let geometry;
        const geomRand = Math.random();
        if (geomRand < 0.6) {
            geometry = smallChunkGeometry; // 60% small chunks
        } else if (geomRand < 0.9) {
            geometry = mediumChunkGeometry; // 30% medium chunks
        } else {
            geometry = largeChunkGeometry; // 10% large chunks
        }
        
        const chunk = new THREE.Mesh(geometry, material.clone());
        
        // Random initial position near center
        chunk.position.set(
            (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5) * 0.3
        );
        
        // Random rotation
        chunk.rotation.set(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2
        );
        
        // Add animation data
        chunk.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.2,
            -0.05 - Math.random() * 0.2, // Mostly downward
            (Math.random() - 0.5) * 0.2
        );
        chunk.userData.rotationSpeed = new THREE.Vector3(
            (Math.random() - 0.5) * 0.15,
            (Math.random() - 0.5) * 0.15,
            (Math.random() - 0.5) * 0.15
        );
        chunk.userData.fadeSpeed = 0.005 + Math.random() * 0.01;
        chunk.userData.gravity = 0.015 + Math.random() * 0.01;
        
        particleGroup.add(chunk);
    }
    
    // Add blood trail particles that will spawn over time
    particleGroup.userData.lastTrailTime = 0;
    particleGroup.userData.trailInterval = 50; // ms between trail particles
    
    // Add the particle group to the scene
    scene.add(particleGroup);
    
    // Mark this as gibs particles for the update function
    particleGroup.userData.isGibsParticles = true;
    particleGroup.userData.creationTime = Date.now();
    particleGroup.userData.lifetime = 3000; // 3 seconds lifetime
    particleGroup.userData.trailDuration = 1500; // 1.5 seconds of blood trail
    
    return particleGroup;
}

/**
 * Updates gibs particles animation
 * @param {THREE.Group} particleGroup - The particle group to update
 * @param {number} deltaTime - Time since last update in seconds
 * @returns {boolean} - True if particles should be removed, false otherwise
 */
export function updateGibsParticles(particleGroup, deltaTime) {
    if (!particleGroup) return true;
    
    // Check if particles have exceeded their lifetime
    const age = Date.now() - particleGroup.userData.creationTime;
    if (age > particleGroup.userData.lifetime) {
        return true; // Should be removed
    }
    
    // Add blood trail particles if within trail duration
    if (age < particleGroup.userData.trailDuration) {
        const now = Date.now();
        if (now - particleGroup.userData.lastTrailTime > particleGroup.userData.trailInterval) {
            // Create a new blood drop
            const bloodMaterial = new THREE.MeshBasicMaterial({ 
                color: 0x8a0303, 
                transparent: true, 
                opacity: 0.8 
            });
            
            const dropGeometry = new THREE.SphereGeometry(0.08, 6, 6);
            const drop = new THREE.Mesh(dropGeometry, bloodMaterial);
            
            // Position slightly randomly below the group
            drop.position.set(
                (Math.random() - 0.5) * 0.3,
                -0.2 - Math.random() * 0.3,
                (Math.random() - 0.5) * 0.3
            );
            
            // Add animation data
            drop.userData.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.05,
                -0.2 - Math.random() * 0.1, // Faster downward
                (Math.random() - 0.5) * 0.05
            );
            drop.userData.fadeSpeed = 0.02 + Math.random() * 0.02;
            drop.userData.gravity = 0.02;
            
            particleGroup.add(drop);
            particleGroup.userData.lastTrailTime = now;
        }
    }
    
    // Update each particle in the group
    let allFaded = true;
    
    particleGroup.children.forEach(particle => {
        // Apply gravity to velocity
        particle.userData.velocity.y -= particle.userData.gravity * deltaTime * 60;
        
        // Apply velocity
        particle.position.add(particle.userData.velocity.clone().multiplyScalar(deltaTime * 60));
        
        // Apply rotation if it has rotation speed
        if (particle.userData.rotationSpeed) {
            particle.rotation.x += particle.userData.rotationSpeed.x * deltaTime * 60;
            particle.rotation.y += particle.userData.rotationSpeed.y * deltaTime * 60;
            particle.rotation.z += particle.userData.rotationSpeed.z * deltaTime * 60;
        }
        
        // Apply fading
        if (particle.userData.fadeSpeed) {
            particle.material.opacity -= particle.userData.fadeSpeed * deltaTime * 60;
            
            // Ensure opacity doesn't go below 0
            if (particle.material.opacity < 0) {
                particle.material.opacity = 0;
            } else {
                allFaded = false;
            }
        }
    });
    
    return allFaded && age > particleGroup.userData.trailDuration; // Remove if all particles have faded out and trail is done
}
