import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class GrassSystem {
    constructor(scene, camera, inventory, interactableObjects) {
        this.scene = scene;
        this.camera = camera;
        this.inventory = inventory;
        this.interactableObjects = interactableObjects;
        this.grassModel = null;
        this.grassInstances = [];
        this.isCrafting = false;
        this.craftingStartTime = 0;
        this.craftingDuration = 2000; // 2 seconds in milliseconds
        this.craftingGrass = null;

        // Load the grass model
        this.loadModel();
    }

    loadModel() {
        const loader = new GLTFLoader();

        loader.load('assets/models/grass.glb', (gltf) => {
            this.grassModel = gltf.scene;

            // Make the model cast shadows
            this.grassModel.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });

            console.log('Grass model loaded successfully');

            // Add grass to the world once the model is loaded
            this.addGrassToWorld();
        }, undefined, (error) => {
            console.error('Error loading grass model:', error);
        });
    }

    addGrassToWorld(count = 50, worldSize = 80) {
        if (!this.grassModel) {
            console.error('Grass model not loaded yet');
            return;
        }

        const worldHalfSize = worldSize / 2;
        const minDistance = 3; // Minimum distance between grass patches
        const positions = [];

        // Generate random positions for grass
        for (let i = 0; i < count; i++) {
            let x, z;
            let tooClose = true;
            let attempts = 0;

            // Try to find a position that's not too close to other grass
            while (tooClose && attempts < 50) {
                x = Math.random() * worldSize - worldHalfSize;
                z = Math.random() * worldSize - worldHalfSize;

                tooClose = positions.some(pos => {
                    const dx = pos.x - x;
                    const dz = pos.z - z;
                    return Math.sqrt(dx * dx + dz * dz) < minDistance;
                });

                attempts++;
            }

            if (attempts < 50) {
                // Create a new grass instance
                const grass = this.grassModel.clone();

                // Scale the grass appropriately
                grass.scale.set(0.03, 0.03, 0.03);

                // Position the grass
                grass.position.set(x, 0, z);

                // Set grass data
                grass.userData.type = 'grass';

                // Add to scene and tracking arrays
                this.scene.add(grass);
                this.interactableObjects.push(grass);
                this.grassInstances.push(grass);

                // Store position for collision detection
                positions.push(new THREE.Vector3(x, 0, z));

                console.log(`Grass added at position (${x.toFixed(2)}, ${z.toFixed(2)})`);
            }
        }

        console.log(`Added ${this.grassInstances.length} grass patches to the world`);
    }

    // Check if player is looking at grass and close enough
    checkGrassInteraction(raycaster, maxDistance = 3, ignoreCrafting = false) {
        // If we're crafting and not explicitly ignoring that fact, return null
        if (this.isCrafting && !ignoreCrafting) return null;

        const intersects = raycaster.intersectObjects(this.grassInstances, true);

        if (intersects.length > 0 && intersects[0].distance <= maxDistance) {
            // Find the actual grass object (might be a child mesh)
            let grassObject = intersects[0].object;
            while (grassObject.parent && !grassObject.userData.type) {
                grassObject = grassObject.parent;
            }

            if (grassObject.userData.type === 'grass') {
                return grassObject;
            }
        }

        return null;
    }

    // Start crafting string from grass
    startCrafting(grassObject) {
        if (this.isCrafting) return;

        this.isCrafting = true;
        this.craftingStartTime = Date.now();
        this.craftingGrass = grassObject;

        // Show progress bar
        const progressBarContainer = document.getElementById('progress-bar-container');
        const progressBar = document.getElementById('progress-bar');
        progressBarContainer.style.display = 'block';
        progressBar.style.width = '0%';

        // Update prompt to show crafting in progress
        const promptElement = document.getElementById('interaction-prompt');
        promptElement.textContent = 'Crafting string from plant fiber...';
        promptElement.style.display = 'block';

        console.log('Started crafting string from grass');
    }

    // Update crafting progress
    updateCrafting() {
        if (!this.isCrafting) return;

        const now = Date.now();
        const elapsed = now - this.craftingStartTime;
        const progress = Math.min(elapsed / this.craftingDuration, 1);

        // Update progress bar
        const progressBar = document.getElementById('progress-bar');
        progressBar.style.width = `${progress * 100}%`;

        // Check if crafting is complete
        if (progress >= 1) {
            this.completeCrafting();
        }
    }

    // Complete the crafting process
    completeCrafting() {
        if (!this.isCrafting) return;

        // Add string to inventory
        this.inventory.addItem('string', 1);
        console.log('Crafted 1 string from grass');

        // Hide progress bar
        const progressBarContainer = document.getElementById('progress-bar-container');
        progressBarContainer.style.display = 'none';

        // Reset crafting state
        this.isCrafting = false;
        this.craftingGrass = null;

        // Update interaction prompt
        const promptElement = document.getElementById('interaction-prompt');
        promptElement.textContent = 'Crafted 1 string!';
        promptElement.style.display = 'block';

        // Hide the prompt after a short delay
        setTimeout(() => {
            promptElement.style.display = 'none';
        }, 2000);
    }

    // Cancel crafting (e.g., if player moves away)
    cancelCrafting() {
        if (!this.isCrafting) return;

        // Hide progress bar
        const progressBarContainer = document.getElementById('progress-bar-container');
        progressBarContainer.style.display = 'none';

        // Reset crafting state
        this.isCrafting = false;
        this.craftingGrass = null;

        console.log('Crafting cancelled');
    }

    // Calculate distance to the nearest grass patch
    distanceToNearestGrass(position) {
        if (this.grassInstances.length === 0) return Infinity;

        let minDistance = Infinity;

        for (const grass of this.grassInstances) {
            const distance = position.distanceTo(grass.position);
            if (distance < minDistance) {
                minDistance = distance;
            }
        }

        return minDistance;
    }

    // Update method called from main game loop
    update() {
        if (this.isCrafting) {
            this.updateCrafting();
        }
    }
}
