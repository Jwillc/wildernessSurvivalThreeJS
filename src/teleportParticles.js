import * as THREE from 'three';

/**
 * Creates a teleport particle effect at the given position
 * @param {THREE.Scene} scene - The scene to add particles to
 * @param {THREE.Vector3} position - The position to create particles at
 * @returns {THREE.Group} - The particle group
 */
export function createTeleportParticles(scene, position) {
    // Create a group to hold all teleport particles
    const particleGroup = new THREE.Group();
    
    // Position the particle group at the given position
    particleGroup.position.copy(position);
    
    // Create particle materials with alien-like colors
    const particleMaterials = [
        new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.8 }), // Green
        new THREE.MeshBasicMaterial({ color: 0x88ff88, transparent: true, opacity: 0.7 }), // Light green
        new THREE.MeshBasicMaterial({ color: 0x44aa44, transparent: true, opacity: 0.9 })  // Dark green
    ];
    
    // Create geometries for particles
    const particleGeometry = new THREE.SphereGeometry(0.05, 8, 8);
    const glowGeometry = new THREE.SphereGeometry(0.02, 4, 4);
    
    // Create main particles
    const particleCount = 30;
    for (let i = 0; i < particleCount; i++) {
        // Choose a random material
        const material = particleMaterials[Math.floor(Math.random() * particleMaterials.length)];
        const particle = new THREE.Mesh(particleGeometry, material.clone());
        
        // Random initial position near center
        particle.position.set(
            (Math.random() - 0.5) * 0.2,
            Math.random() * 0.5,
            (Math.random() - 0.5) * 0.2
        );
        
        // Random scale for variety
        const scale = 0.3 + Math.random() * 0.7;
        particle.scale.set(scale, scale, scale);
        
        // Add animation data
        particle.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.15,
            0.05 + Math.random() * 0.15,
            (Math.random() - 0.5) * 0.15
        );
        particle.userData.rotationSpeed = (Math.random() - 0.5) * 0.1;
        particle.userData.fadeSpeed = 0.01 + Math.random() * 0.02;
        particle.userData.scaleSpeed = 0.01 + Math.random() * 0.02;
        
        particleGroup.add(particle);
    }
    
    // Create glow particles (smaller, brighter particles)
    const glowCount = 15;
    for (let i = 0; i < glowCount; i++) {
        const glowMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xaaffaa, 
            transparent: true, 
            opacity: 0.9 
        });
        
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        
        // Random position
        glow.position.set(
            (Math.random() - 0.5) * 0.3,
            Math.random() * 0.6,
            (Math.random() - 0.5) * 0.3
        );
        
        // Random scale
        const scale = 0.5 + Math.random() * 1.0;
        glow.scale.set(scale, scale, scale);
        
        // Add animation data
        glow.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.2,
            0.1 + Math.random() * 0.2,
            (Math.random() - 0.5) * 0.2
        );
        glow.userData.fadeSpeed = 0.02 + Math.random() * 0.03;
        
        particleGroup.add(glow);
    }
    
    // Add the particle group to the scene
    scene.add(particleGroup);
    
    // Mark this as teleport particles for the update function
    particleGroup.userData.isTeleportParticles = true;
    particleGroup.userData.creationTime = Date.now();
    particleGroup.userData.lifetime = 1500; // 1.5 seconds lifetime
    
    return particleGroup;
}

/**
 * Updates teleport particles animation
 * @param {THREE.Group} particleGroup - The particle group to update
 * @param {number} deltaTime - Time since last update in seconds
 * @returns {boolean} - True if particles should be removed, false otherwise
 */
export function updateTeleportParticles(particleGroup, deltaTime) {
    if (!particleGroup) return true;
    
    // Check if particles have exceeded their lifetime
    const age = Date.now() - particleGroup.userData.creationTime;
    if (age > particleGroup.userData.lifetime) {
        return true; // Should be removed
    }
    
    // Calculate lifetime progress (0 to 1)
    const progress = age / particleGroup.userData.lifetime;
    
    // Update each particle in the group
    let allFaded = true;
    
    particleGroup.children.forEach(particle => {
        // Apply velocity
        particle.position.add(particle.userData.velocity.clone().multiplyScalar(deltaTime * 60));
        
        // Apply rotation if it has rotation speed
        if (particle.userData.rotationSpeed) {
            particle.rotation.y += particle.userData.rotationSpeed * deltaTime * 60;
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
        
        // Apply scaling
        if (particle.userData.scaleSpeed) {
            const scaleFactor = 1 + particle.userData.scaleSpeed * deltaTime * 60;
            particle.scale.multiplyScalar(scaleFactor);
        }
        
        // Add pulsing effect based on lifetime
        const pulse = Math.sin(progress * Math.PI * 8) * 0.2 + 0.8;
        if (particle.material.color.g > 0.7) { // Only pulse the green particles
            particle.material.opacity *= pulse;
        }
    });
    
    return allFaded; // Remove if all particles have faded out
}
