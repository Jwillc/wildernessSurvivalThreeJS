import * as THREE from 'three';

/**
 * Creates a fire particle system for a bonfire
 * @param {THREE.Object3D} bonfire - The bonfire object to attach particles to
 * @returns {THREE.Group} - The fire particle system
 */
export function createFireParticles(bonfire) {
    // Create a group to hold all fire particles
    const fireGroup = new THREE.Group();

    // Position the fire group at the top center of the bonfire
    // Lowered position to sit directly on the bonfire
    fireGroup.position.set(0, 0.1, 0);

    // Create particle materials with different colors for a realistic fire effect
    const flameMaterials = [
        new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.8 }), // Orange-red
        new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.7 }), // Orange
        new THREE.MeshBasicMaterial({ color: 0xff9900, transparent: true, opacity: 0.6 })  // Yellow
    ];

    // Create ember material (small bright particles)
    const emberMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.9 });

    // Create smoke material
    const smokeMaterial = new THREE.MeshBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.3 });

    // Create geometries for particles - reduced sizes for all particles
    const flameGeometry = new THREE.SphereGeometry(0.08, 8, 8); // Reduced from 0.15
    const emberGeometry = new THREE.SphereGeometry(0.015, 4, 4); // Reduced from 0.03
    const smokeGeometry = new THREE.SphereGeometry(0.1, 8, 8); // Reduced from 0.2

    // Create flames (reduced number of particles)
    const flameCount = 15; // Reduced from 25
    for (let i = 0; i < flameCount; i++) {
        // Choose a random flame material
        const material = flameMaterials[Math.floor(Math.random() * flameMaterials.length)];
        const flame = new THREE.Mesh(flameGeometry, material);

        // Random position within the fire area - reduced spread
        flame.position.set(
            (Math.random() - 0.5) * 0.25, // Reduced from 0.4
            Math.random() * 0.3, // Reduced from 0.5
            (Math.random() - 0.5) * 0.25 // Reduced from 0.4
        );

        // Random scale for variety - reduced overall scale
        const scale = 0.3 + Math.random() * 0.3; // Reduced from 0.5 + random * 0.5
        flame.scale.set(scale, scale + Math.random() * 0.6, scale); // Reduced vertical stretch

        // Add animation data
        flame.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.01,
            0.03 + Math.random() * 0.03,
            (Math.random() - 0.5) * 0.01
        );
        flame.userData.rotationSpeed = (Math.random() - 0.5) * 0.02;
        flame.userData.fadeSpeed = 0.005 + Math.random() * 0.005;
        flame.userData.scaleSpeed = 0.01 + Math.random() * 0.01;

        fireGroup.add(flame);
    }

    // Create embers (reduced number of particles)
    const emberCount = 8; // Reduced from 12
    for (let i = 0; i < emberCount; i++) {
        const ember = new THREE.Mesh(emberGeometry, emberMaterial);

        // Random position within the fire area - reduced spread
        ember.position.set(
            (Math.random() - 0.5) * 0.2, // Reduced from 0.3
            Math.random() * 0.2, // Reduced from 0.3
            (Math.random() - 0.5) * 0.2 // Reduced from 0.3
        );

        // Add animation data - reduced velocity
        ember.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.01, // Reduced from 0.02
            0.03 + Math.random() * 0.03, // Reduced from 0.05 + random * 0.05
            (Math.random() - 0.5) * 0.01 // Reduced from 0.02
        );
        ember.userData.lifespan = 1 + Math.random() * 2; // Seconds
        ember.userData.age = 0;

        fireGroup.add(ember);
    }

    // Create smoke (reduced number of particles)
    const smokeCount = 5; // Reduced from 8
    for (let i = 0; i < smokeCount; i++) {
        const smoke = new THREE.Mesh(smokeGeometry, smokeMaterial);

        // Position smoke above the flames - lowered height
        smoke.position.set(
            (Math.random() - 0.5) * 0.15, // Reduced from 0.2
            0.3 + Math.random() * 0.3, // Reduced from 0.5 + random * 0.5
            (Math.random() - 0.5) * 0.15 // Reduced from 0.2
        );

        // Random scale for variety - reduced overall scale
        const scale = 0.3 + Math.random() * 0.3; // Reduced from 0.5 + random * 0.5
        smoke.scale.set(scale, scale, scale);

        // Add animation data
        smoke.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.005,
            0.01 + Math.random() * 0.01,
            (Math.random() - 0.5) * 0.005
        );
        smoke.userData.rotationSpeed = (Math.random() - 0.5) * 0.01;
        smoke.userData.fadeSpeed = 0.002 + Math.random() * 0.002;
        smoke.userData.scaleSpeed = 0.005 + Math.random() * 0.005;

        fireGroup.add(smoke);
    }

    // Add the fire group to the bonfire
    bonfire.add(fireGroup);

    // Store reference to the fire group
    bonfire.userData.fireParticles = fireGroup;

    return fireGroup;
}

/**
 * Updates the fire particles animation
 * @param {THREE.Group} fireGroup - The fire particle group to update
 * @param {number} deltaTime - Time since last update in seconds
 */
export function updateFireParticles(fireGroup, deltaTime) {
    if (!fireGroup) return;

    // Update each particle in the fire group
    fireGroup.children.forEach((particle, index) => {
        // Apply velocity
        particle.position.add(particle.userData.velocity);

        // Apply rotation if it has rotation speed
        if (particle.userData.rotationSpeed) {
            particle.rotation.y += particle.userData.rotationSpeed;
        }

        // Handle embers differently (they have a lifespan)
        if (particle.userData.lifespan) {
            particle.userData.age += deltaTime;

            // If ember has reached its lifespan, reset it
            if (particle.userData.age >= particle.userData.lifespan) {
                // Reset position - reduced spread
                particle.position.set(
                    (Math.random() - 0.5) * 0.2, // Reduced from 0.3
                    Math.random() * 0.2, // Reduced from 0.3
                    (Math.random() - 0.5) * 0.2 // Reduced from 0.3
                );

                // Reset velocity - reduced velocity
                particle.userData.velocity.set(
                    (Math.random() - 0.5) * 0.01, // Reduced from 0.02
                    0.03 + Math.random() * 0.03, // Reduced from 0.05 + random * 0.05
                    (Math.random() - 0.5) * 0.01 // Reduced from 0.02
                );

                // Reset age and lifespan
                particle.userData.age = 0;
                particle.userData.lifespan = 1 + Math.random() * 2;
            }
        }
        // Handle flames and smoke
        else {
            // Apply fading if it has fade speed
            if (particle.userData.fadeSpeed && particle.material.opacity > 0) {
                particle.material.opacity -= particle.userData.fadeSpeed;
            }

            // Apply scaling if it has scale speed
            if (particle.userData.scaleSpeed) {
                particle.scale.x -= particle.userData.scaleSpeed;
                particle.scale.y -= particle.userData.scaleSpeed;
                particle.scale.z -= particle.userData.scaleSpeed;
            }

            // If particle has faded out or become too small, reset it
            if (particle.material.opacity <= 0 || particle.scale.x <= 0.1) {
                // Reset position based on particle type
                if (particle.material.color.r > 0.8) { // Flame (reddish)
                    particle.position.set(
                        (Math.random() - 0.5) * 0.25, // Reduced from 0.4
                        Math.random() * 0.3, // Reduced from 0.5
                        (Math.random() - 0.5) * 0.25 // Reduced from 0.4
                    );

                    // Reset scale - reduced overall scale
                    const scale = 0.3 + Math.random() * 0.3; // Reduced from 0.5 + random * 0.5
                    particle.scale.set(scale, scale + Math.random() * 0.6, scale); // Reduced vertical stretch

                    // Reset opacity
                    particle.material.opacity = 0.6 + Math.random() * 0.3;
                } else { // Smoke (grayish)
                    particle.position.set(
                        (Math.random() - 0.5) * 0.15, // Reduced from 0.2
                        0.3 + Math.random() * 0.3, // Reduced from 0.5 + random * 0.5
                        (Math.random() - 0.5) * 0.15 // Reduced from 0.2
                    );

                    // Reset scale - reduced overall scale
                    const scale = 0.3 + Math.random() * 0.3; // Reduced from 0.5 + random * 0.5
                    particle.scale.set(scale, scale, scale);

                    // Reset opacity
                    particle.material.opacity = 0.2 + Math.random() * 0.2;
                }
            }
        }
    });
}

/**
 * Removes fire particles from a bonfire
 * @param {THREE.Object3D} bonfire - The bonfire to remove particles from
 */
export function removeFireParticles(bonfire) {
    if (bonfire && bonfire.userData.fireParticles) {
        bonfire.remove(bonfire.userData.fireParticles);
        bonfire.userData.fireParticles = null;
        bonfire.userData.isLit = false;
    }
}
