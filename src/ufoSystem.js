import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createGibsExplosion } from './gibsParticles.js';

export class UFOSystem {
    constructor(scene, camera, playerPosition) {
        this.scene = scene;
        this.camera = camera;
        this.playerPosition = playerPosition;
        this.ufoModel = null;
        this.isNight = false;
        this.isActive = false;
        this.abductionInProgress = false;
        this.abductionProgress = 0;
        this.abductionSpeed = 0.2; // Speed of abduction (higher = faster)
        this.moveSpeed = 0.2; // Speed of UFO movement
        this.hoverHeight = 30; // Height at which the UFO hovers
        this.abductionDistance = 5; // Distance at which abduction beam activates
        this.beamLight = null; // Spotlight for the beam
        this.beamCone = null; // Visual cone for the beam
        this.originalPlayerY = 0; // Original player Y position
        this.playerInBeam = false; // Track if player is in the beam (for movement restriction)

        // Cinematic properties
        this.cinematicInProgress = false;
        this.cinematicStartTime = 0;
        this.cinematicDuration = 7000; // 7 seconds for the cinematic
        this.gibsCreated = false; // Flag to track if gibs have been created
        this.gibsExplosionCount = 0; // Counter for gibs explosions
        this.maxGibsExplosions = 5; // Number of times to repeat the gibs explosion
        this.lastGibsTime = 0; // Time of the last gibs explosion
        this.gibsInterval = 1000; // 1 second between gibs explosions

        // Camera properties for cinematic
        this.originalCameraPosition = new THREE.Vector3();
        this.originalCameraRotation = new THREE.Euler();
        this.cameraControlsEnabled = true; // Track if controls are enabled

        // Load the UFO model
        this.loadModel();
    }

    loadModel() {
        const loader = new GLTFLoader();

        loader.load('assets/models/ufo.glb', (gltf) => {
            this.ufoModel = gltf.scene;

            // Scale the UFO to an appropriate size
            this.ufoModel.scale.set(3, 3, 3);

            // Position the UFO high above the scene initially
            this.ufoModel.position.set(0, 100, 0);

            // Make the UFO cast shadows
            this.ufoModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            // Add to scene but make it invisible initially
            this.ufoModel.visible = false;
            this.scene.add(this.ufoModel);

            // Create the beam light
            this.createBeamLight();

            console.log('UFO model loaded successfully');
        }, undefined, (error) => {
            console.error('Error loading UFO model:', error);
        });
    }

    createBeamLight() {
        // Create a spotlight for the beam
        this.beamLight = new THREE.SpotLight(0x88ffff, 5, 50, Math.PI / 6, 0.5, 1);
        this.beamLight.position.set(0, 0, 0); // Will be updated to match UFO position
        this.beamLight.target.position.set(0, 0, 0); // Will be updated to point downward
        this.beamLight.castShadow = true;
        this.beamLight.visible = false;

        // Add the spotlight target to the scene (required for the spotlight to work)
        this.scene.add(this.beamLight.target);
        this.scene.add(this.beamLight);

        // Create a visible cone for the beam
        const beamGeometry = new THREE.ConeGeometry(5, 30, 32, 1, true);
        const beamMaterial = new THREE.MeshBasicMaterial({
            color: 0x88ffff,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });

        this.beamCone = new THREE.Mesh(beamGeometry, beamMaterial);
        this.beamCone.rotation.x = Math.PI; // Flip the cone to point downward
        this.beamCone.visible = false;
        this.scene.add(this.beamCone);
    }

    // Start the UFO appearance
    startNightCycle() {
        if (!this.ufoModel) return;

        this.isNight = true;
        this.isActive = true;

        // Position the UFO at a random location above the player
        const angle = Math.random() * Math.PI * 2;
        const distance = 50 + Math.random() * 30;

        this.ufoModel.position.set(
            this.playerPosition.x + Math.cos(angle) * distance,
            this.hoverHeight,
            this.playerPosition.z + Math.sin(angle) * distance
        );

        // Make the UFO visible
        this.ufoModel.visible = true;

        console.log('UFO has appeared for the night cycle');
    }

    // End the UFO appearance
    endNightCycle() {
        if (!this.ufoModel) return;

        this.isNight = false;
        this.isActive = false;
        this.abductionInProgress = false;
        this.playerInBeam = false; // Ensure player movement is restored

        // Hide the UFO
        this.ufoModel.visible = false;

        // Hide the beam
        if (this.beamLight) {
            this.beamLight.visible = false;
        }

        if (this.beamCone) {
            this.beamCone.visible = false;
        }

        console.log('UFO has disappeared as night ends');
    }

    // Check if the player is under a roof
    isPlayerUnderRoof(buildingSystem) {
        if (!buildingSystem || !buildingSystem.placedPieces) return false;

        // Get all roof pieces
        const roofPieces = buildingSystem.placedPieces.filter(piece =>
            piece.userData.buildingType === 'roof');

        if (roofPieces.length === 0) return false;

        // Cast a ray upward from the player to check for roofs
        const raycaster = new THREE.Raycaster();
        const rayOrigin = this.playerPosition.clone();
        const rayDirection = new THREE.Vector3(0, 1, 0); // Straight up

        raycaster.set(rayOrigin, rayDirection);
        const intersects = raycaster.intersectObjects(roofPieces);

        // If we hit a roof, the player is under it
        return intersects.length > 0;
    }

    // Start the abduction process
    startAbduction() {
        if (this.abductionInProgress) return;

        this.abductionInProgress = true;
        this.abductionProgress = 0;
        this.originalPlayerY = this.playerPosition.y;
        this.playerInBeam = true; // Set player in beam to restrict movement

        // Show the beam
        if (this.beamLight) {
            this.beamLight.visible = true;
        }

        if (this.beamCone) {
            this.beamCone.visible = true;
        }

        console.log('UFO abduction started - player movement restricted');
    }

    // Check if player is in the beam (for external use)
    isPlayerInBeam() {
        return this.playerInBeam;
    }

    // Update the UFO position and behavior
    update(deltaTime, playerPosition, buildingSystem) {
        if (!this.ufoModel || !this.isActive) return;

        // Update player position reference
        this.playerPosition = playerPosition;

        // Move the UFO towards the player
        const direction = new THREE.Vector3();
        direction.subVectors(
            new THREE.Vector3(this.playerPosition.x, this.hoverHeight, this.playerPosition.z),
            this.ufoModel.position
        ).normalize();

        // Move the UFO
        this.ufoModel.position.x += direction.x * this.moveSpeed * deltaTime * 60;
        this.ufoModel.position.z += direction.z * this.moveSpeed * deltaTime * 60;

        // Slowly rotate the UFO for effect
        this.ufoModel.rotation.y += 0.01 * deltaTime * 60;

        // Update beam position
        if (this.beamLight) {
            this.beamLight.position.copy(this.ufoModel.position);
            this.beamLight.target.position.set(
                this.ufoModel.position.x,
                0,
                this.ufoModel.position.z
            );
        }

        if (this.beamCone) {
            this.beamCone.position.copy(this.ufoModel.position);
        }

        // Calculate distance to player (horizontal only)
        const horizontalDistance = new THREE.Vector2(
            this.ufoModel.position.x - this.playerPosition.x,
            this.ufoModel.position.z - this.playerPosition.z
        ).length();

        // Check if player is close enough for abduction
        if (horizontalDistance < this.abductionDistance) {
            // Check if player is under a roof
            const underRoof = this.isPlayerUnderRoof(buildingSystem);

            if (!underRoof && !this.abductionInProgress) {
                this.startAbduction();
            } else if (underRoof && this.abductionInProgress) {
                // Player found shelter, stop abduction
                this.abductionInProgress = false;
                this.playerInBeam = false; // Allow player movement again
                this.beamLight.visible = false;
                this.beamCone.visible = false;
                console.log('Player found shelter - movement restored');
            }
        }

        // Update abduction if in progress
        if (this.abductionInProgress) {
            // If cinematic is in progress, handle that separately
            if (this.cinematicInProgress) {
                return this.updateCinematic(deltaTime);
            }

            // Increase abduction progress
            this.abductionProgress += this.abductionSpeed * deltaTime;

            // Calculate new player height based on abduction progress
            const newY = this.originalPlayerY + this.abductionProgress * 10;

            // Update player position (y-coordinate only)
            this.playerPosition.y = newY;

            // Check if abduction is complete
            if (this.abductionProgress >= 1) {
                // Player has been fully abducted, start the cinematic
                this.startCinematic();
                return false; // Don't end the game yet, wait for cinematic
            }
        }

        return false;
    }

    // Start the cinematic sequence
    startCinematic() {
        this.cinematicInProgress = true;
        this.cinematicStartTime = Date.now();
        this.gibsCreated = false;
        // Keep playerInBeam true during cinematic

        // Hide the beam light during the cinematic
        if (this.beamLight) {
            this.beamLight.visible = false;
        }

        if (this.beamCone) {
            this.beamCone.visible = false;
        }

        // Store original camera position and rotation
        this.originalCameraPosition.copy(this.camera.position);
        this.originalCameraRotation.copy(this.camera.rotation);

        // Hide the axe during the cinematic if it exists
        // Look for the axe in the camera's children
        if (this.camera.children) {
            for (let i = 0; i < this.camera.children.length; i++) {
                const child = this.camera.children[i];
                // Check if this is the axe (either by checking userData or assuming it's the axe model)
                if (child.isObject3D && !child.isCamera) {
                    // Store the original visibility state
                    child.userData.wasVisible = child.visible;
                    // Hide the object
                    child.visible = false;
                    console.log('Hiding axe or other camera attachment during cinematic');
                }
            }
        }

        // Disable controls during cinematic
        if (window.controls) {
            window.controls.unlock();
            this.cameraControlsEnabled = false;
        }

        console.log('Starting abduction cinematic sequence');
    }

    // Update the cinematic sequence
    updateCinematic(deltaTime) {
        const now = Date.now();
        const elapsed = now - this.cinematicStartTime;
        const progress = Math.min(elapsed / this.cinematicDuration, 1);

        // Start creating gibs explosions after a short delay (0.5 seconds)
        if (elapsed > 500) {
            const now = Date.now();

            // Check if it's time for a new gibs explosion
            if (this.gibsExplosionCount < this.maxGibsExplosions &&
                (now - this.lastGibsTime > this.gibsInterval || this.gibsExplosionCount === 0)) {

                // Calculate position for gibs (below the UFO)
                const gibsPosition = new THREE.Vector3(
                    this.ufoModel.position.x,
                    this.ufoModel.position.y - 2, // 2 units below the UFO
                    this.ufoModel.position.z
                );

                // Create the gibs explosion
                createGibsExplosion(this.scene, gibsPosition);

                // Play a sound effect if available
                // (You could add a sound effect here if you have a sound system)

                this.gibsCreated = true;
                this.gibsExplosionCount++;
                this.lastGibsTime = now;

                console.log(`Created bloody gibs explosion ${this.gibsExplosionCount} of ${this.maxGibsExplosions}`);
            }
        }

        // Update camera position for cinematic view
        this.updateCameraForCinematic(elapsed, progress, this.gibsCreated);

        // Check if cinematic is complete
        if (elapsed >= this.cinematicDuration) {
            // Reset camera to original position
            this.camera.position.copy(this.originalCameraPosition);
            this.camera.rotation.copy(this.originalCameraRotation);

            // Note: We don't need to restore axe visibility here since the player is dead
            // and the game over screen will be shown. The axe will be restored when the game
            // is restarted. However, we'll add the code to restore visibility for completeness.

            // Restore visibility of camera children (like the axe) if needed
            // In practice, this won't be visible since the game over screen will be shown
            if (this.camera.children) {
                for (let i = 0; i < this.camera.children.length; i++) {
                    const child = this.camera.children[i];
                    if (child.isObject3D && child.userData.wasVisible !== undefined) {
                        // Only restore if it was visible before
                        if (child.userData.wasVisible) {
                            child.visible = true;
                        }
                        // Clean up the temporary property
                        delete child.userData.wasVisible;
                    }
                }
            }

            this.cinematicInProgress = false;
            console.log('Cinematic sequence complete, showing game over');
            return true; // Signal to show game over screen
        }

        return false; // Cinematic still in progress
    }

    // Update camera position and rotation for cinematic view
    updateCameraForCinematic(elapsed, progress, gibsCreated) {
        // Calculate position for gibs (below the UFO)
        const gibsPosition = new THREE.Vector3(
            this.ufoModel.position.x,
            this.ufoModel.position.y - 2, // 2 units below the UFO
            this.ufoModel.position.z
        );

        // Calculate a position between the UFO and gibs to look at
        // This ensures both the UFO and gibs are visible
        const lookTarget = new THREE.Vector3();
        lookTarget.copy(this.ufoModel.position);
        lookTarget.y -= 1; // Halfway between UFO and gibs

        if (!gibsCreated) {
            // Before gibs are created, position camera to see the UFO from below
            const targetPosition = new THREE.Vector3();
            targetPosition.copy(this.ufoModel.position);
            targetPosition.y -= 2; // Below the UFO but not too far
            targetPosition.z += 10; // Back enough to see the whole UFO

            // Smoothly interpolate camera position
            this.camera.position.lerp(targetPosition, 0.1); // Faster transition

            // Make camera look at UFO
            this.camera.lookAt(this.ufoModel.position);
        } else {
            // After gibs are created, position camera to see both UFO and gibs
            const targetPosition = new THREE.Vector3();

            // Position camera at an angle that shows both UFO and gibs clearly
            // Use a side view that shows both the UFO and the gibs below it
            targetPosition.set(
                this.ufoModel.position.x + 5, // Offset to the side for better perspective
                this.ufoModel.position.y - 1, // Slightly below UFO
                this.ufoModel.position.z + 8  // Back enough to see everything
            );

            // Smoothly interpolate camera position
            this.camera.position.lerp(targetPosition, 0.05);

            // Look at a point between the UFO and gibs to keep both in frame
            this.camera.lookAt(lookTarget);
        }
    }
}
