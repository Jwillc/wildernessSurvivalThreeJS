import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createTeleportParticles } from './teleportParticles.js';

export class Alien {
    constructor(scene, camera, playerPosition) {
        this.scene = scene;
        this.camera = camera;
        this.playerPosition = playerPosition;
        this.model = null;
        this.isHiding = false;
        this.targetTree = null;
        this.moveSpeed = 0.02;
        this.minDistanceFromPlayer = 15; // Minimum distance to keep from player
        this.maxDistanceFromPlayer = 30; // Maximum distance before teleporting closer
        this.tooCloseDistance = 8; // Distance at which the alien will teleport away
        this.hidingDuration = 0; // How long the alien has been hiding
        this.maxHidingTime = 10000; // Maximum time to hide in milliseconds
        this.lastHidingTime = 0; // Last time the alien changed hiding state
        this.hidingCooldown = 5000; // Cooldown between hiding states
        this.lastPlayerPosition = new THREE.Vector3();
        this.lastPlayerPositionUpdateTime = 0;
        this.playerPositionUpdateInterval = 2000; // Update target position every 2 seconds
        this.isTeleporting = false; // Flag to track if teleport animation is in progress
        this.teleportCooldown = 0; // Cooldown timer for teleportation
        this.teleportCooldownTime = 3000; // 3 seconds between teleports

        // Load the alien model
        this.loadModel();
    }

    loadModel() {
        const loader = new GLTFLoader();

        loader.load('assets/models/alien.glb', (gltf) => {
            this.model = gltf.scene;

            // Scale the alien to an appropriate size
            this.model.scale.set(0.08, 0.08, 0.08);

            // Make sure the alien stays upright
            this.model.rotation.set(0, 0, 0);

            // Fix the alien's orientation if needed
            this.model.traverse((child) => {
                if (child.isMesh) {
                    // Ensure the alien is standing upright
                    child.rotation.x = 0;
                }
            });

            // Position the alien away from the player initially
            const randomAngle = Math.random() * Math.PI * 2;
            const randomDistance = this.minDistanceFromPlayer + Math.random() * 10;
            this.model.position.set(
                Math.cos(randomAngle) * randomDistance,
                0, // Directly on the ground
                Math.sin(randomAngle) * randomDistance
            );

            // Add to scene
            this.scene.add(this.model);

            console.log('Alien model loaded successfully');
        }, undefined, (error) => {
            console.error('Error loading alien model:', error);
        });
    }

    update(deltaTime, playerPosition, trees) {
        if (!this.model) return;

        // Update player position reference
        this.playerPosition = playerPosition;

        // Ensure the alien's X and Z rotations are always 0 to keep it upright
        this.model.rotation.x = 0;
        this.model.rotation.z = 0;

        // Update teleport cooldown
        if (this.teleportCooldown > 0) {
            this.teleportCooldown -= deltaTime * 1000;
        }

        // If teleporting, don't do anything else
        if (this.isTeleporting) {
            return;
        }

        // Calculate distance to player
        const distanceToPlayer = this.model.position.distanceTo(this.playerPosition);

        // Update target position periodically to make movement less predictable
        const now = Date.now();
        if (now - this.lastPlayerPositionUpdateTime > this.playerPositionUpdateInterval) {
            this.lastPlayerPosition.copy(this.playerPosition);
            this.lastPlayerPositionUpdateTime = now;
        }

        // Decide whether to hide or stalk
        if (!this.isHiding) {
            // If not hiding, check if we should start hiding
            if (now - this.lastHidingTime > this.hidingCooldown && Math.random() < 0.01) {
                this.findTreeToHideBehind(trees);
                if (this.targetTree) {
                    this.isHiding = true;
                    this.hidingDuration = 0;
                    this.lastHidingTime = now;
                }
            } else {
                // Stalk the player
                this.stalkPlayer(deltaTime, distanceToPlayer);
            }
        } else {
            // If hiding, update hiding duration
            this.hidingDuration += deltaTime * 1000;

            // Move towards hiding spot
            if (this.targetTree) {
                this.moveTowardsHidingSpot(deltaTime);
            }

            // Check if we should stop hiding
            if (this.hidingDuration > this.maxHidingTime) {
                this.isHiding = false;
                this.targetTree = null;
                this.lastHidingTime = now;
            }
        }

        // If too far from player, teleport closer
        if (distanceToPlayer > this.maxDistanceFromPlayer) {
            this.teleportCloserToPlayer();
        }
    }

    stalkPlayer(deltaTime, distanceToPlayer) {
        if (!this.model) return;

        // Check if player is too close and we should teleport away
        if (distanceToPlayer < this.tooCloseDistance && this.teleportCooldown <= 0) {
            // Find a new hiding spot and teleport there
            this.teleportToNewHidingSpot();
            return;
        }

        // Only move if we're outside the minimum distance
        if (distanceToPlayer > this.minDistanceFromPlayer) {
            // Calculate direction to player
            const direction = new THREE.Vector3();
            direction.subVectors(this.lastPlayerPosition, this.model.position).normalize();

            // Move towards player
            this.model.position.x += direction.x * this.moveSpeed * deltaTime * 60;
            this.model.position.z += direction.z * this.moveSpeed * deltaTime * 60;

            // Make the alien face the player (only rotate on Y axis)
            this.faceTarget(this.lastPlayerPosition);
        } else {
            // If we're too close but not close enough to teleport, move away slightly
            const direction = new THREE.Vector3();
            direction.subVectors(this.model.position, this.lastPlayerPosition).normalize();

            this.model.position.x += direction.x * this.moveSpeed * 0.5 * deltaTime * 60;
            this.model.position.z += direction.z * this.moveSpeed * 0.5 * deltaTime * 60;
        }
    }

    findTreeToHideBehind(trees) {
        if (!trees || trees.length === 0) return;

        // Find trees that are between the alien and the player
        const potentialTrees = trees.filter(tree => {
            if (!tree) return false;

            // Check if tree is within reasonable distance
            const distanceToTree = this.model.position.distanceTo(tree.position);
            const playerDistanceToTree = this.playerPosition.distanceTo(tree.position);

            return distanceToTree < 15 && playerDistanceToTree > 5 && playerDistanceToTree < 30;
        });

        if (potentialTrees.length > 0) {
            // Choose a random tree from potential hiding spots
            this.targetTree = potentialTrees[Math.floor(Math.random() * potentialTrees.length)];
        }
    }

    moveTowardsHidingSpot(deltaTime) {
        if (!this.model || !this.targetTree) return;

        // Calculate the hiding position (opposite side of tree from player)
        const treeToPlayer = new THREE.Vector3();
        treeToPlayer.subVectors(this.playerPosition, this.targetTree.position).normalize();

        // Hiding spot is on the opposite side of the tree from the player
        const hidingSpot = new THREE.Vector3();
        hidingSpot.copy(this.targetTree.position);
        hidingSpot.sub(treeToPlayer.multiplyScalar(2)); // 2 units away from tree on opposite side

        // Move towards hiding spot
        const direction = new THREE.Vector3();
        direction.subVectors(hidingSpot, this.model.position).normalize();

        this.model.position.x += direction.x * this.moveSpeed * 1.5 * deltaTime * 60;
        this.model.position.z += direction.z * this.moveSpeed * 1.5 * deltaTime * 60;

        // Make the alien face away from the player when hiding (only rotate on Y axis)
        this.faceTarget(hidingSpot);
    }

    teleportCloserToPlayer() {
        if (!this.model) return;

        // Find a position that's not directly visible to the player
        const randomAngle = Math.random() * Math.PI * 2;
        const randomDistance = this.minDistanceFromPlayer + Math.random() * 5;

        this.model.position.set(
            this.playerPosition.x + Math.cos(randomAngle) * randomDistance,
            0, // Directly on the ground
            this.playerPosition.z + Math.sin(randomAngle) * randomDistance
        );

        // Make sure the alien is facing the player after teleporting
        this.faceTarget(this.playerPosition);

        console.log('Alien teleported closer to player');
    }

    // Helper method to make the alien face a target while staying upright
    faceTarget(target) {
        if (!this.model) return;

        // Calculate direction vector on the XZ plane only
        const direction = new THREE.Vector3();
        direction.subVectors(target, this.model.position);

        // Calculate the angle on the XZ plane (Y-rotation)
        const angle = Math.atan2(direction.x, direction.z);

        // Only update the Y rotation to keep the alien upright
        this.model.rotation.set(0, angle, 0);
    }

    // Find a new hiding spot and teleport there with particle effect
    teleportToNewHidingSpot() {
        if (!this.model) return;

        // Get all trees from the scene
        const trees = this.scene.children.filter(obj => obj.userData && obj.userData.type === 'tree');
        if (!trees || trees.length === 0) {
            console.warn('No trees available for alien to teleport to');
            return;
        }

        // Find potential hiding spots (trees that are far enough from player)
        const potentialTrees = trees.filter(tree => {
            if (!tree) return false;

            // Check if tree is within reasonable distance from alien but far from player
            const playerDistanceToTree = this.playerPosition.distanceTo(tree.position);
            return playerDistanceToTree > this.minDistanceFromPlayer && playerDistanceToTree < this.maxDistanceFromPlayer;
        });

        if (potentialTrees.length === 0) {
            console.warn('No suitable trees found for teleportation');
            return;
        }

        // Choose a random tree from potential hiding spots
        const targetTree = potentialTrees[Math.floor(Math.random() * potentialTrees.length)];

        // Create teleport particles at current position
        createTeleportParticles(this.scene, this.model.position.clone());

        // Hide the alien during teleportation
        this.model.visible = false;
        this.isTeleporting = true;

        // Calculate the hiding position (opposite side of tree from player)
        const treeToPlayer = new THREE.Vector3();
        treeToPlayer.subVectors(this.playerPosition, targetTree.position).normalize();

        // Hiding spot is on the opposite side of the tree from the player
        const hidingSpot = new THREE.Vector3();
        hidingSpot.copy(targetTree.position);
        hidingSpot.sub(treeToPlayer.multiplyScalar(2)); // 2 units away from tree on opposite side

        // After a short delay, teleport the alien to the new position
        setTimeout(() => {
            // Move to the new hiding spot
            this.model.position.copy(hidingSpot);

            // Create teleport particles at new position
            createTeleportParticles(this.scene, this.model.position.clone());

            // After another short delay, make the alien visible again
            setTimeout(() => {
                this.model.visible = true;
                this.isTeleporting = false;
                this.isHiding = true;
                this.targetTree = targetTree;
                this.hidingDuration = 0;
                this.lastHidingTime = Date.now();
                this.teleportCooldown = this.teleportCooldownTime;

                // Make the alien face away from the player
                this.faceTarget(hidingSpot.clone().add(treeToPlayer));

                console.log('Alien teleported to new hiding spot');
            }, 500); // 0.5 second delay before appearing
        }, 500); // 0.5 second delay before teleporting
    }
}
