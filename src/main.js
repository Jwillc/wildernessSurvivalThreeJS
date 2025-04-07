import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Inventory, Item } from './inventory.js';
import { BuildingSystem } from './buildingSystem.js';
import { CraftingSystem } from './craftingSystem.js';
import { Terminal } from './terminal.js';
import { Sky } from './Sky.js';
import { createFireParticles, updateFireParticles, removeFireParticles } from './fireParticles.js';
import { updateTeleportParticles } from './teleportParticles.js';
import { updateGibsParticles } from './gibsParticles.js';
import { Alien } from './alien.js';
import { TreeRegenerationSystem } from './treeRegenerationSystem.js';
import { DayNightCycle } from './dayNightCycle.js';
import { UFOSystem } from './ufoSystem.js';
import { GameOverMenu } from './gameOverMenu.js';
import { DayNightHUD } from './dayNightHUD.js';
import { BowAndArrowSystem } from './bowAndArrow.js';
import { GrassSystem } from './grassSystem.js';

const savedAxePosition = localStorage.getItem('axePosition');
const savedAxeRotation = localStorage.getItem('axeRotation');

let axePosition, axeRotation;

if (savedAxePosition) {
    const pos = JSON.parse(savedAxePosition);
    axePosition = new THREE.Vector3(pos[0], pos[1], pos[2]);
} else {
    // Use the position you adjusted in the editor as the default
    axePosition = new THREE.Vector3(0.570, -0.770, -0.960);
}

if (savedAxeRotation) {
    const rot = JSON.parse(savedAxeRotation);
    axeRotation = new THREE.Euler(rot[0], rot[1], rot[2]);
} else {
    // Use the rotation you adjusted in the editor as the default
    axeRotation = new THREE.Euler(0.055, 4.826, 0.020);
}

let camera, scene, renderer, controls;
let moveForward = false;
let moveBackward = false;

// Sky variables
let sky, sun, ambientLight, directionalLight;

// Model variables
let treeModel, rockModel, logPileModel;

// Alien variable
let alien;

// Tree regeneration system
let treeRegenerationSystem;

// Day-night cycle and UFO systems
let dayNightCycle, ufoSystem;

// Game over menu and HUD
let gameOverMenu, dayNightHUD;

// Bow and arrow system
let bowAndArrowSystem;

// Grass system
let grassSystem;
const skyParams = {
    turbidity: 8,       // Moderate turbidity for natural sky
    rayleigh: 1.5,      // Moderate rayleigh for natural atmospheric scattering
    mieCoefficient: 0.005, // Standard mie scattering
    mieDirectionalG: 0.8,
    elevation: 45,      // Standard sun position
    azimuth: 180
};
let moveLeft = false;
let moveRight = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();

let inventory;
// Make interactableObjects globally accessible
window.interactableObjects = [];
let interactableObjects = window.interactableObjects;
const INTERACT_DISTANCE = 3;
const raycaster = new THREE.Raycaster();

let axeMesh = null;
// bowMesh is managed by the BowAndArrowSystem
let editorMode = false;
let spacePressed = false;

// Axe animation variables
let axeAnimating = false;
let axeAnimationStartTime = 0;
let axeAnimationDuration = 500; // milliseconds

// Current equipped weapon
let equippedWeapon = null; // 'axe' or 'bow'

// Global flag to force blueprint cleanup
let forceCleanupBlueprint = false;

// Terminal
let terminal = null;

// Clock for animations
let clock = new THREE.Clock();

// Collision detection variables
const PLAYER_HEIGHT = 1.3; // Extremely reduced height to fit in structures
const PLAYER_RADIUS = 0.15; // Extremely reduced radius to fit through doorways
const COLLISION_THRESHOLD = 0.02; // Minimal threshold for very tight movement

const CHOP_DISTANCE = 3;
const CHOPS_TO_FELL = 5;
const treeHealth = new Map();
let buildingSystem, craftingSystem;

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    // Make resetAxePosition available globally for debugging
    window.resetAxePosition = resetAxePosition;

    // Make THREE available globally for debugging
    window.THREE = THREE;

    init();
});

// Check if a movement would cause a collision with building pieces
function checkCollision(position, direction, distance) {
    // Get all building pieces to check for collisions
    const collidableObjects = [];

    // Add all placed building pieces from the building system
    if (buildingSystem && buildingSystem.placedPieces) {
        collidableObjects.push(...buildingSystem.placedPieces);
    }

    // If there are no collidable objects, no collision
    if (collidableObjects.length === 0) return false;

    // Normalize direction
    const rayDirection = direction.clone().normalize();

    // Cast minimal rays to simulate an extremely small player capsule
    // Using only two rays for better fit in tight structures
    const rayOrigins = [
        position.clone().add(new THREE.Vector3(0, 0.3, 0)), // Higher above foot level
        position.clone().add(new THREE.Vector3(0, PLAYER_HEIGHT - 0.5, 0)) // Even lower below head level
    ];

    // Cast minimal side rays with an extremely small offset
    const sideOffset = PLAYER_RADIUS * 0.5; // Minimal side offset for very tight spaces

    // Calculate perpendicular vector to movement direction (on xz plane)
    const perpVector = new THREE.Vector3(-rayDirection.z, 0, rayDirection.x).normalize();

    // Add side rays at waist level
    rayOrigins.push(
        position.clone().add(new THREE.Vector3(0, PLAYER_HEIGHT / 2, 0)).add(perpVector.clone().multiplyScalar(sideOffset)),
        position.clone().add(new THREE.Vector3(0, PLAYER_HEIGHT / 2, 0)).add(perpVector.clone().multiplyScalar(-sideOffset))
    );

    // Check each ray for collision
    for (const origin of rayOrigins) {
        const raycaster = new THREE.Raycaster(origin, rayDirection);
        const intersects = raycaster.intersectObjects(collidableObjects, true);

        // Check each intersection
        for (const hit of intersects) {
            // Skip door frames - they should never block movement
            if (hit.object.userData.isDoorFrame || hit.object.userData.isDoor) {
                continue;
            }

            // If there's an intersection closer than our movement distance plus threshold, we have a collision
            if (hit.distance < distance + COLLISION_THRESHOLD) {
                return true;
            }
        }
    }

    // No collision detected with any ray
    return false;
}

// Function to update the sun position based on elevation and azimuth
function updateSunPosition() {
    const phi = THREE.MathUtils.degToRad(90 - skyParams.elevation);
    const theta = THREE.MathUtils.degToRad(skyParams.azimuth);

    sun.setFromSphericalCoords(1, phi, theta);

    sky.material.uniforms['sunPosition'].value.copy(sun);

    // Update directional light to match sun position
    if (directionalLight) {
        directionalLight.position.copy(sun).normalize().multiplyScalar(10);

        // Adjust directional light intensity based on time of day
        if (skyParams.elevation > 0) {
            // Daytime - moderate directional light
            directionalLight.intensity = 1.8;
        } else {
            // Nighttime - dimmer but still visible directional light
            directionalLight.intensity = 0.7;
        }
    }

    // Adjust ambient light based on time of day - balanced brightness
    if (ambientLight) {
        if (skyParams.elevation > 0) {
            // Daytime - moderate ambient
            ambientLight.intensity = 2.0;
            ambientLight.color.set(0xffffff);
        } else {
            // Nighttime - dimmer but still visible
            ambientLight.intensity = 1.5;
            ambientLight.color.set(0x8080a0); // Slightly blueish night ambient light
        }
    }
}

// Global function to force cleanup of any lingering blueprints
function forceCleanupAllBlueprints() {
    if (buildingSystem) {
        console.log('FORCE CLEANUP: Removing all blueprints');

        // First try the normal cancellation
        buildingSystem.cancelBuilding();

        // If that didn't work, try more aggressive cleanup
        if (buildingSystem.currentBlueprint) {
            console.error('FORCE CLEANUP: Blueprint still exists, using direct scene removal');

            // Try direct scene removal
            scene.remove(buildingSystem.currentBlueprint);

            // Reset all building system state
            buildingSystem.currentBlueprint = null;
            buildingSystem.isBuilding = false;
            buildingSystem.buildingType = null;
            buildingSystem.wallRotationIndex = 0;
            buildingSystem.hideBuildingInstructions();
        }

        // Set the global flag to false
        forceCleanupBlueprint = false;
    }
}

function init() {
    try {
        scene = new THREE.Scene();

        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 1.3, 0); // Extremely reduced height to match smaller player height
        scene.add(camera);

        // Create renderer
        renderer = new THREE.WebGLRenderer({
            antialias: true
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.8; // Moderate exposure for balanced brightness
        document.body.appendChild(renderer.domElement);

        // Add Sky
        sky = new Sky();
        sky.scale.setScalar(450000);
        scene.add(sky);

        // Add Sun
        sun = new THREE.Vector3();

        // Initialize sky parameters
        const uniforms = sky.material.uniforms;
        uniforms['turbidity'].value = skyParams.turbidity;
        uniforms['rayleigh'].value = skyParams.rayleigh;
        uniforms['mieCoefficient'].value = skyParams.mieCoefficient;
        uniforms['mieDirectionalG'].value = skyParams.mieDirectionalG;

        // Update sun position
        updateSunPosition();

        // Moderate ambient light for balanced visibility
        ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
        scene.add(ambientLight);

        // Create directional light to match sun position - moderate intensity
        directionalLight = new THREE.DirectionalLight(0xffffff, 1.8);
        directionalLight.position.copy(sun).normalize().multiplyScalar(10);
        directionalLight.castShadow = true;

        // Configure shadow properties
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.camera.left = -20;
        directionalLight.shadow.camera.right = 20;
        directionalLight.shadow.camera.top = 20;
        directionalLight.shadow.camera.bottom = -20;

        scene.add(directionalLight);

        // Ground with rocky texture - more segments for better detail
        const groundGeometry = new THREE.PlaneGeometry(100, 100, 32, 32);

        // Load rocky terrain texture
        const textureLoader = new THREE.TextureLoader();
        const rockyTexture = textureLoader.load('assets/textures/rocky_terrain.jpg', function(texture) {
            // Once texture is loaded, update the renderer
            renderer.render(scene, camera);
        });

        // Set texture repeat for tiling
        rockyTexture.wrapS = THREE.RepeatWrapping;
        rockyTexture.wrapT = THREE.RepeatWrapping;
        rockyTexture.repeat.set(10, 10); // Repeat the texture 10 times

        // Create a normal map from the texture
        const normalMap = textureLoader.load('assets/textures/rocky_terrain.jpg');
        normalMap.wrapS = THREE.RepeatWrapping;
        normalMap.wrapT = THREE.RepeatWrapping;
        normalMap.repeat.set(10, 10);

        const groundMaterial = new THREE.MeshStandardMaterial({
            map: rockyTexture,
            normalMap: normalMap, // Add normal mapping for depth
            normalScale: new THREE.Vector2(0.7, 0.7), // Moderate normal effect
            displacementScale: 0.0, // No displacement for better performance
            roughness: 0.8, // Moderate roughness
            metalness: 0.1, // Low metalness
            // No emissive glow for more natural appearance
        });

        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        // Initialize controls
        controls = new PointerLockControls(camera, document.body);

        document.addEventListener('click', function () {
            controls.lock();
        });

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);

        // Add global key handler for Escape key
        document.addEventListener('keydown', (event) => {
            if (event.code === 'Escape') {
                // Set the force cleanup flag
                forceCleanupBlueprint = true;
                console.log('GLOBAL ESCAPE: Setting force cleanup flag');
            }
        });

        // Initialize systems
        inventory = new Inventory();
        buildingSystem = new BuildingSystem(scene, camera, inventory);
        setupInteractionControls(); // Initialize interaction controls
        setupEditorControls(); // Initialize axe position editor controls

        // Initialize crafting system after building system
        craftingSystem = new CraftingSystem(scene, camera, inventory, buildingSystem);

        // Initialize bow and arrow system
        bowAndArrowSystem = new BowAndArrowSystem(scene, camera, inventory);

        // Initialize grass system
        grassSystem = new GrassSystem(scene, camera, inventory, interactableObjects);

        // Initialize terminal
        terminal = new Terminal({
            controls: controls,
            inventory: inventory,
            buildingSystem: buildingSystem,
            craftingSystem: craftingSystem,
            scene: scene,
            bowAndArrowSystem: bowAndArrowSystem
        });

        // Create a loader for all models
        const gltfLoader = new GLTFLoader();
        let modelsLoaded = 0;
        const totalModels = 4; // Tree, rock, log pile, and axe
        // Note: The bonfire model is loaded by the CraftingSystem class

        // Function to check if all models are loaded
        const checkAllModelsLoaded = () => {
            modelsLoaded++;
            if (modelsLoaded === totalModels) {
                // All models loaded, add environment objects
                addEnvironmentObjects();
            }
        };

        // Load tree model
        gltfLoader.load('assets/models/tree_large.glb', function(gltf) {
            treeModel = gltf.scene;

            // Make the model cast shadows
            treeModel.traverse(function(node) {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });

            checkAllModelsLoaded();
        }, undefined, function(error) {
            console.error('Error loading tree model:', error);
            modelsLoaded++; // Count as loaded even if it failed
        });

        // Load rock model
        gltfLoader.load('assets/models/rock.glb', function(gltf) {
            rockModel = gltf.scene;

            // Make the model cast shadows
            rockModel.traverse(function(node) {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });

            checkAllModelsLoaded();
        }, undefined, function(error) {
            console.error('Error loading rock model:', error);
            modelsLoaded++; // Count as loaded even if it failed
        });

        // Load log pile model
        gltfLoader.load('assets/models/log_pile.glb', function(gltf) {
            logPileModel = gltf.scene;

            // Make the model cast shadows
            logPileModel.traverse(function(node) {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });

            checkAllModelsLoaded();
        }, undefined, function(error) {
            console.error('Error loading log pile model:', error);
            modelsLoaded++; // Count as loaded even if it failed
        });

        // Load axe model
        gltfLoader.load('assets/models/axe.glb', function(gltf) {
            axeModel = gltf.scene;

            // Make the model cast shadows
            axeModel.traverse(function(node) {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });

            console.log('Axe model loaded successfully');
            checkAllModelsLoaded();
        }, undefined, function(error) {
            console.error('Error loading axe model:', error);
            modelsLoaded++; // Count as loaded even if it failed
        });

        // If models take too long to load, add environment objects with fallbacks after a timeout
        setTimeout(() => {
            if (modelsLoaded < totalModels) {
                console.warn('Some models taking too long to load, using fallbacks');
                addEnvironmentObjects(true);
            }
        }, 5000); // 5 second timeout

        // Start animation loop
        animate();

        console.log('Initialization complete');
    } catch (error) {
        console.error('Error during initialization:', error);
    }
}

function animate() {
    requestAnimationFrame(animate);

    // Calculate delta time once per frame
    const deltaTime = clock.getDelta();

    // Check if building system is active but should be reset
    if (buildingSystem) {
        // Check if force cleanup flag is set
        if (forceCleanupBlueprint) {
            forceCleanupAllBlueprints();
        }

        // Force cleanup of any lingering blueprints
        if (!buildingSystem.isBuilding && buildingSystem.currentBlueprint) {
            console.error('Blueprint still exists but building mode is inactive, forcing cleanup');
            forceCleanupAllBlueprints();
        }

        // Check for window blueprints specifically
        if (buildingSystem.currentBlueprint && buildingSystem.buildingType === 'window') {
            // Check if the blueprint has been in the scene for too long
            if (!buildingSystem.blueprintCreationTime) {
                buildingSystem.blueprintCreationTime = Date.now();
            } else if (Date.now() - buildingSystem.blueprintCreationTime > 10000) { // 10 seconds timeout (reduced from 30)
                console.error('Window blueprint has been active for too long, forcing cleanup');
                forceCleanupAllBlueprints();
                buildingSystem.blueprintCreationTime = null;
            }
        } else {
            buildingSystem.blueprintCreationTime = null;
        }
    }

    if (controls.isLocked) {
        velocity.x = 0;
        velocity.z = 0;

        direction.z = Number(moveBackward) - Number(moveForward);
        direction.x = Number(moveLeft) - Number(moveRight);
        direction.normalize();

        const speed = 0.1;
        let newVelocity = new THREE.Vector3(0, 0, 0);

        // Check if player is in UFO beam - if so, prevent WASD movement
        const playerCanMove = !(ufoSystem && ufoSystem.isPlayerInBeam && ufoSystem.isPlayerInBeam());

        // Calculate desired velocity - only if player can move
        if (playerCanMove && (moveForward || moveBackward)) {
            newVelocity.z = direction.z * speed;
        }
        if (playerCanMove && (moveLeft || moveRight)) {
            newVelocity.x = direction.x * speed;
        }

        // Check for collisions in X and Z directions separately
        const currentPosition = camera.position.clone();

        // Create movement vectors for collision checking
        const forwardVector = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        forwardVector.y = 0; // Keep movement on the xz plane
        forwardVector.normalize();

        const rightVector = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        rightVector.y = 0; // Keep movement on the xz plane
        rightVector.normalize();

        // Check forward/backward movement collision
        if (newVelocity.z !== 0) {
            const movementDirection = forwardVector.clone().multiplyScalar(Math.sign(-newVelocity.z));
            if (checkCollision(currentPosition, movementDirection, Math.abs(newVelocity.z))) {
                newVelocity.z = 0; // Cancel movement if collision detected
            }
        }

        // Check left/right movement collision
        if (newVelocity.x !== 0) {
            const movementDirection = rightVector.clone().multiplyScalar(Math.sign(-newVelocity.x));
            if (checkCollision(currentPosition, movementDirection, Math.abs(newVelocity.x))) {
                newVelocity.x = 0; // Cancel movement if collision detected
            }
        }

        // Apply the collision-checked velocity
        controls.moveRight(-newVelocity.x);
        controls.moveForward(-newVelocity.z);

        raycaster.setFromCamera(new THREE.Vector2(), camera);
        const intersects = raycaster.intersectObjects(interactableObjects, true);

        if (intersects.length > 0 && intersects[0].distance < INTERACT_DISTANCE) {
            const object = intersects[0].object;

            // Find the interactable object - could be the object itself or a parent
            let type = null;

            // Check if the object itself has a type
            if (object.userData.type) {
                type = object.userData.type;
            }
            // Check if the immediate parent has a type
            else if (object.parent && object.parent.userData.type) {
                type = object.parent.userData.type;
            }
            // For the loaded model, we might need to go up multiple levels
            else {
                // Traverse up the parent chain to find an object with a type
                let parent = object.parent;
                while (parent) {
                    if (parent.userData.type) {
                        type = parent.userData.type;
                        break;
                    }
                    parent = parent.parent;
                }
            }

            if (type) {
                // Special handling for bonfire
                if (type === 'bonfire') {
                    // Find the actual bonfire object
                    let bonfireObject = object;
                    if (!bonfireObject.userData.type) {
                        // Traverse up to find the bonfire object
                        let parent = object.parent;
                        while (parent) {
                            if (parent.userData.type === 'bonfire') {
                                bonfireObject = parent;
                                break;
                            }
                            parent = parent.parent;
                        }
                    }

                    // Check if the bonfire is lit
                    if (bonfireObject.userData.isLit) {
                        updatePrompts('Bonfire is lit and providing warmth');
                    } else {
                        updatePrompts('Press E to start fire with 2 rocks and a stick');
                    }
                } else {
                    updatePrompts(`Press E to collect ${type}`);
                }
            } else {
                updatePrompts('');
            }
        } else {
            updatePrompts('');
        }

        // Handle axe animation
        if (axeMesh && !editorMode && equippedWeapon === 'axe') {
            if (axeAnimating) {
                // Calculate animation progress (0 to 1)
                const elapsed = Date.now() - axeAnimationStartTime;
                const progress = Math.min(elapsed / axeAnimationDuration, 1);

                if (progress < 0.5) {
                    // Forward swing (0 to 0.5 progress) - CORRECTED DIRECTION
                    // Map 0-0.5 to 0-1 for the forward swing
                    const forwardProgress = progress * 2;
                    // Use easeOutQuad for natural deceleration at the end of the swing
                    const eased = 1 - Math.pow(1 - forwardProgress, 2);
                    // Apply rotation: start at axeRotation.x, swing DOWNWARD by 0.8 radians
                    // Negative value makes it swing forward/down in a chopping motion
                    axeMesh.rotation.x = axeRotation.x - eased * 0.8;
                } else {
                    // Return swing (0.5 to 1 progress)
                    // Map 0.5-1 to 0-1 for the return swing
                    const returnProgress = (progress - 0.5) * 2;
                    // Use easeInOutQuad for smooth return
                    const eased = returnProgress < 0.5 ? 2 * returnProgress * returnProgress : 1 - Math.pow(-2 * returnProgress + 2, 2) / 2;
                    // Apply rotation: start at max forward position, return to original position
                    // Return from the downward position back to original
                    axeMesh.rotation.x = axeRotation.x - 0.8 + eased * 0.8;
                }

                // Animation complete
                if (progress >= 1) {
                    axeAnimating = false;
                    axeMesh.rotation.copy(axeRotation);

                    // If space is still pressed, start a new animation
                    if (spacePressed) {
                        startAxeAnimation();
                        tryChopTree();
                    }
                }
            } else if (spacePressed && !axeAnimating) {
                // Start a new animation if space is pressed and no animation is running
                startAxeAnimation();
            } else {
                // Reset to default position when not animating
                axeMesh.rotation.copy(axeRotation);
            }
        }

        // Update bow and arrow system
        if (bowAndArrowSystem) {
            bowAndArrowSystem.update(deltaTime);
        }

        // Update grass system
        if (grassSystem) {
            grassSystem.update();

            // Check for grass interaction
            raycaster.setFromCamera(new THREE.Vector2(), camera);

            if (grassSystem.isCrafting) {
                // Check if player moved away from grass while crafting
                // Use a slightly larger distance check (4 instead of 3) to be a bit more forgiving
                raycaster.far = 2; // Temporarily increase raycaster distance
                const grassObject = grassSystem.checkGrassInteraction(raycaster, 2, true);
                raycaster.far = 100; // Reset to default

                // Cancel if player is not looking at grass and has moved a moderate distance away
                // This allows some movement and looking around, but not too much
                if (!grassObject && grassSystem.distanceToNearestGrass(camera.position) > 3) {
                    grassSystem.cancelCrafting();
                    updatePrompts('');
                }
            } else {
                // When not crafting, check if looking at grass to show prompt
                const grassObject = grassSystem.checkGrassInteraction(raycaster);
                if (grassObject) {
                    updatePrompts('Press E to craft string from plant fiber');
                }
            }
        }

        scene.children.forEach(child => {
            if (child.userData.isChopParticles) {
                let allSettled = true;
                child.children.forEach(particle => {
                    particle.position.add(particle.userData.velocity);
                    particle.userData.velocity.y -= 0.01;

                    if (particle.position.y > -2) {
                        allSettled = false;
                    }
                });

                if (allSettled) {
                    scene.remove(child);
                }
            }

            // Update teleport particles
            if (child.userData.isTeleportParticles) {
                const shouldRemove = updateTeleportParticles(child, deltaTime);
                if (shouldRemove) {
                    scene.remove(child);
                }
            }

            // Update gibs particles
            if (child.userData.isGibsParticles) {
                const shouldRemove = updateGibsParticles(child, deltaTime);
                if (shouldRemove) {
                    scene.remove(child);
                }
            }
        });

        if (buildingSystem.isBuilding) {
            buildingSystem.updateBlueprintPosition(raycaster);
        }

        // Update crafting blueprint position if crafting
        if (craftingSystem && craftingSystem.isCrafting) {
            // Only log occasionally to avoid console spam
            if (Math.random() < 0.01) { // Log roughly once every 100 frames
                console.log('Updating crafting blueprint position');
            }
            craftingSystem.updateBlueprintPosition(raycaster);
        }

        // Update fire particles for all lit bonfires
        scene.traverse(object => {
            if (object.userData.type === 'bonfire' && object.userData.isLit && object.userData.fireParticles) {
                // Use the delta time calculated at the beginning of the frame
                updateFireParticles(object.userData.fireParticles, deltaTime);
            }
        });

        // Update alien if it exists
        if (alien) {
            // Get all tree objects from the scene for the alien to hide behind
            const trees = scene.children.filter(obj => obj.userData && obj.userData.type === 'tree');
            alien.update(deltaTime, camera.position, trees);
        }

        // Update tree regeneration system
        if (treeRegenerationSystem) {
            treeRegenerationSystem.update(deltaTime);
        }

        // Update day-night cycle
        if (dayNightCycle) {
            dayNightCycle.update(deltaTime);

            // Update day-night HUD
            if (dayNightHUD) {
                dayNightHUD.update();
            }
        }

        // Update UFO system
        if (ufoSystem && ufoSystem.isActive) {
            const playerAbducted = ufoSystem.update(deltaTime, camera.position, buildingSystem);

            // If player has been abducted, show game over screen
            if (playerAbducted) {
                // Pause the game
                controls.unlock();

                // Show game over menu
                if (gameOverMenu) {
                    gameOverMenu.show();
                }

                // Pause day-night cycle
                if (dayNightCycle) {
                    dayNightCycle.pause();
                }
            }
        }
    }

    // Render the scene
    renderer.render(scene, camera);
}

function setupInteractionControls() {
    document.addEventListener('keydown', (event) => {
        switch (event.code) {
            case 'KeyE':
                tryInteract();
                break;
            case 'KeyC':
                tryCraft();
                break;
            case 'KeyR':
                // Rotate wall when in building mode
                if (buildingSystem.isBuilding && buildingSystem.buildingType === 'wall') {
                    buildingSystem.rotateWall();
                }
                break;
            case 'Digit1':
                // Equip axe if available
                if (inventory.hasItems(['axe'])) {
                    equipWeapon('axe');
                }
                break;
            case 'Digit2':
                // Equip bow if available
                if (inventory.hasItems(['bow'])) {
                    equipWeapon('bow');
                }
                break;
        }
    });
}

function tryInteract() {
    if (!controls.isLocked) return;

    // Handle building placement
    if (buildingSystem.isBuilding) {
        // Store the building type before building
        const wasWindowPlacement = buildingSystem.buildingType === 'window';

        // Attempt to build
        buildingSystem.build();

        // Extra check for window placement
        if (wasWindowPlacement) {
            // Force cleanup of any lingering window blueprint
            setTimeout(() => {
                if (buildingSystem.currentBlueprint) {
                    console.error('Window blueprint still exists after building, forcing cleanup');
                    buildingSystem.cancelBuilding();
                }
            }, 100); // Small delay to ensure the build process has completed
        }

        return;
    }

    // Handle crafting placement
    if (craftingSystem && craftingSystem.isCrafting) {
        console.log('Detected crafting in progress, attempting to place item');
        // Attempt to place the crafted item
        craftingSystem.place();
        return;
    }

    // Check for grass interaction
    if (grassSystem && !grassSystem.isCrafting) {
        raycaster.setFromCamera(new THREE.Vector2(), camera);
        const grassObject = grassSystem.checkGrassInteraction(raycaster);
        if (grassObject) {
            console.log('Looking at grass');
            updatePrompts('Press E to craft string from plant fiber');

            // Start crafting when E is pressed
            grassSystem.startCrafting(grassObject);
            return;
        }
    }

    raycaster.setFromCamera(new THREE.Vector2(), camera);
    const intersects = raycaster.intersectObjects(interactableObjects, true);

    if (intersects.length > 0 && intersects[0].distance < INTERACT_DISTANCE) {
        const object = intersects[0].object;

        // Find the interactable object - could be the object itself or a parent
        let interactableObject = null;
        let type = null;

        // Check if the object itself has a type
        if (object.userData.type) {
            interactableObject = object;
            type = object.userData.type;
        }
        // Check if the immediate parent has a type
        else if (object.parent && object.parent.userData.type) {
            interactableObject = object.parent;
            type = object.parent.userData.type;
        }
        // For the loaded model, we might need to go up multiple levels
        else {
            // Traverse up the parent chain to find an object with a type
            let parent = object.parent;
            while (parent) {
                if (parent.userData.type) {
                    interactableObject = parent;
                    type = parent.userData.type;
                    break;
                }
                parent = parent.parent;
            }
        }

        if (!interactableObject || !type) return;

        if (type === 'tree') {
            inventory.addItem(new Item('stick', 1));
            updatePrompts('');
        } else if (type === 'rock') {
            inventory.addItem(new Item('rock', 1));
            scene.remove(interactableObject);
            const index = interactableObjects.indexOf(interactableObject);
            if (index > -1) {
                interactableObjects.splice(index, 1);
            }
            updatePrompts('');
        } else if (type === 'logs') {
            // Add 5 logs as a single stacked item
            console.log('Collecting log pile - adding 5 logs to inventory');
            const beforeCount = inventory.getItemCount('log');

            // Create a new Item with explicit quantity of 5
            const logItem = new Item('log', 5);
            console.log('Created log item with quantity:', logItem.quantity);

            // Add the item to inventory
            const added = inventory.addItem(logItem);
            console.log('Item added to inventory:', added);

            const afterCount = inventory.getItemCount('log');
            console.log(`Log count before: ${beforeCount}, after: ${afterCount}, added: ${afterCount - beforeCount}`);

            scene.remove(interactableObject);
            const index = interactableObjects.indexOf(interactableObject);
            if (index > -1) {
                interactableObjects.splice(index, 1);
            }
            updatePrompts('');
        } else if (type === 'bonfire') {
            // Handle bonfire interaction
            if (!interactableObject.userData.isLit) {
                // Check if player has required items (2 rocks and a stick)
                if (inventory.getItemCount('rock') >= 2 && inventory.getItemCount('stick') >= 1) {
                    console.log('Lighting bonfire');

                    // Consume resources
                    inventory.removeItem('rock', 2);
                    inventory.removeItem('stick', 1);

                    // Light the bonfire
                    interactableObject.userData.isLit = true;

                    // Create fire particles
                    createFireParticles(interactableObject);

                    updatePrompts('Bonfire lit!');
                    setTimeout(() => updatePrompts(''), 2000); // Clear message after 2 seconds
                } else {
                    updatePrompts('Not enough materials to light the fire');
                    setTimeout(() => updatePrompts(''), 2000); // Clear message after 2 seconds
                }
            } else {
                updatePrompts('The bonfire is already lit');
                setTimeout(() => updatePrompts(''), 2000); // Clear message after 2 seconds
            }
        }
    }
}

function tryCraft() {
    if (inventory.hasItems(['stick', 'rock'])) {
        inventory.removeItem('stick');
        inventory.removeItem('rock');
        inventory.addItem(new Item('axe', 1));
        updatePrompts('');

        // Equip the axe automatically when crafted
        equipWeapon('axe');
    }
}

// Global variable to store the loaded axe model
let axeModel = null;

function createAxeMesh() {
    if (axeModel) {
        // Clone the loaded model
        const axe = axeModel.clone();

        // Apply appropriate scale for first-person view
        const scale = 3.3; // Reduced scale to make it less prominent
        axe.scale.set(scale, scale, scale);

        // Additional rotation to ensure the axe is oriented correctly
        // This rotates the model itself, separate from the animation rotation
        axe.rotation.z = Math.PI / 2; // Rotate 90 degrees to adjust orientation

        return axe;
    } else {
        // Fallback to procedural axe if model isn't loaded
        console.warn('Axe model not loaded, using fallback');

        const handleGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1);
        const handleMaterial = new THREE.MeshStandardMaterial({
            color: 0x8B4513,
            roughness: 0.8,
            metalness: 0.1
        });
        const handle = new THREE.Mesh(handleGeometry, handleMaterial);

        const headGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.1);
        const headMaterial = new THREE.MeshStandardMaterial({
            color: 0x808080,
            roughness: 0.7,
            metalness: 0.3
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.set(0.15, 0.4, 0);
        head.rotation.z = Math.PI / 2;

        const axe = new THREE.Group();
        axe.add(handle);
        axe.add(head);

        return axe;
    }
}

function createWoodChips() {
    const particles = new THREE.Group();
    for (let i = 0; i < 10; i++) {
        const geometry = new THREE.BoxGeometry(0.05, 0.05, 0.05);
        const material = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const chip = new THREE.Mesh(geometry, material);

        chip.position.set(
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.5
        );

        chip.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.1,
            Math.random() * 0.1,
            (Math.random() - 0.5) * 0.1
        );

        particles.add(chip);
    }
    return particles;
}

function createLogPile(position) {
    console.log('Creating log pile at position:', position);
    let logs;

    if (logPileModel) {
        console.log('Using loaded log pile model');
        // Use the loaded log pile model
        logs = logPileModel.clone();

        // Scale the log pile appropriately
        const scale = 2.0; // Scale set to 2.0 as requested
        logs.scale.set(scale, scale, scale);
        console.log('Set log pile scale to:', scale);

        // Keep logs consistently oriented
        logs.rotation.y = 0; // No random rotation
    } else {
        console.log('Using fallback procedural log pile');
        // Fallback to procedural log pile if model isn't loaded
        logs = new THREE.Group();

        for (let i = 0; i < 3; i++) {
            const logGeometry = new THREE.CylinderGeometry(0.2, 0.2, 2, 8);
            const logMaterial = new THREE.MeshStandardMaterial({
                color: 0x8B4513,
                roughness: 0.8,
                metalness: 0.1
            });
            const log = new THREE.Mesh(logGeometry, logMaterial);

            log.position.set(
                (Math.random() - 0.5) * 0.3,
                0.2 + i * 0.4,
                (Math.random() - 0.5) * 0.3
            );
            log.rotation.set(
                (Math.random() - 0.5) * 0.3,
                (Math.random() - 0.5) * Math.PI,
                Math.PI / 2
            );

            logs.add(log);
        }
    }

    // Set the type for interaction
    logs.userData.type = 'logs';
    console.log('Set log pile type to "logs" for interaction');

    // Position at the tree's location, slightly raised to prevent sinking
    logs.position.set(position.x, 0.3, position.z);
    console.log('Positioned log pile at:', logs.position);

    return logs;
}

function startAxeAnimation() {
    axeAnimating = true;
    axeAnimationStartTime = Date.now();
}

function equipWeapon(weapon) {
    console.log(`Equipping ${weapon}...`);

    // Check if bowAndArrowSystem is initialized
    if (weapon === 'bow' && !bowAndArrowSystem) {
        console.error('Cannot equip bow - bowAndArrowSystem is not initialized');
        return;
    }

    // Make sure pointer is locked for proper game control
    ensurePointerLock();

    // Unequip current weapon
    if (equippedWeapon === 'axe' && axeMesh) {
        console.log('Removing axe from camera');
        camera.remove(axeMesh);
        axeMesh = null;
    } else if (equippedWeapon === 'bow') {
        console.log('Unequipping bow');
        bowAndArrowSystem.unequipBow();
    }

    // Equip new weapon
    if (weapon === 'axe') {
        console.log('Creating and adding axe mesh to camera');
        if (!axeMesh) {
            axeMesh = createAxeMesh();
            camera.add(axeMesh);
            axeMesh.position.copy(axePosition);
            axeMesh.rotation.copy(axeRotation);
        }
    } else if (weapon === 'bow') {
        console.log('Calling bowAndArrowSystem.equipBow()');
        bowAndArrowSystem.equipBow();

        // Add a delayed check to verify the bow was equipped
        setTimeout(() => {
            if (!bowAndArrowSystem.isBowEquipped) {
                console.warn('Bow was not equipped after timeout, trying again...');
                bowAndArrowSystem.equipBow();
            }
        }, 1000);
    }

    equippedWeapon = weapon;
    console.log(`Successfully equipped ${weapon}`);
}

function ensurePointerLock() {
    // Check if pointer is already locked
    if (!document.pointerLockElement) {
        console.log('Pointer not locked, requesting lock');
        // Request pointer lock with a slight delay to avoid conflicts
        setTimeout(() => {
            try {
                // Get the canvas element
                const canvas = document.querySelector('canvas');
                if (canvas) {
                    canvas.requestPointerLock();
                }
            } catch (error) {
                console.warn('Error requesting pointer lock:', error);
            }
        }, 100);
    }
}

// Make equipWeapon available globally for the crafting system
window.equipWeapon = equipWeapon;

function tryChopTree() {
    if (!controls.isLocked || !inventory.hasItems(['axe'])) return;

    raycaster.setFromCamera(new THREE.Vector2(), camera);
    const intersects = raycaster.intersectObjects(interactableObjects, true);

    if (intersects.length > 0 && intersects[0].distance < CHOP_DISTANCE) {
        const object = intersects[0].object;

        // Find the tree object - could be the object itself or a parent
        let tree = null;

        // Check if the object itself is a tree
        if (object.userData.type === 'tree') {
            tree = object;
        }
        // Check if the parent is a tree
        else if (object.parent && object.parent.userData.type === 'tree') {
            tree = object.parent;
        }
        // For the loaded model, we might need to go up multiple levels
        else {
            // Traverse up the parent chain to find a tree
            let parent = object.parent;
            while (parent) {
                if (parent.userData.type === 'tree') {
                    tree = parent;
                    break;
                }
                parent = parent.parent;
            }
        }

        if (tree) {
            const particles = createWoodChips();
            particles.position.copy(intersects[0].point);
            particles.userData.isChopParticles = true;
            scene.add(particles);

            const currentHealth = treeHealth.get(tree) || 0;
            const newHealth = currentHealth + 1;
            treeHealth.set(tree, newHealth);

            if (newHealth >= CHOPS_TO_FELL) {
                console.log('Tree felled, creating log pile');
                const logPile = createLogPile(tree.position);
                scene.add(logPile);
                interactableObjects.push(logPile);
                console.log('Log pile created and added to scene');

                // Store the tree position before removing it
                const treePosition = tree.position.clone();

                const index = interactableObjects.indexOf(tree);
                if (index > -1) {
                    interactableObjects.splice(index, 1);
                }
                scene.remove(tree);
                treeHealth.delete(tree);

                // Notify the tree regeneration system that a tree was chopped
                if (treeRegenerationSystem) {
                    treeRegenerationSystem.onTreeChopped(treePosition);
                }
            }
        }
    }
}

function updatePrompts(message) {
    const promptElement = document.getElementById('interaction-prompt');
    promptElement.textContent = message;
    promptElement.style.display = message ? 'block' : 'none';

    const craftingPrompt = document.getElementById('crafting-prompt');
    const canCraftAxe = inventory.hasItems(['stick', 'rock']);
    craftingPrompt.textContent = canCraftAxe ? 'Press C to craft axe' : '';
    craftingPrompt.style.display = canCraftAxe ? 'block' : 'none';
}

function addEnvironmentObjects(useFallbackTrees = false) {
    // Create an extremely dense forest with collision detection
    const treeCount = 300; // Increased from 100 to 300 trees for extreme density
    const worldSize = 80; // World size (from -40 to +40)
    const worldHalfSize = worldSize / 2;
    const minTreeDistance = 2.5; // Reduced from 4 to 2.5 for denser packing
    const treePositions = []; // Array to store tree positions for collision detection

    // Store all tree objects for the alien to use
    const treeObjects = [];

    console.log(`Creating extremely dense forest with ${treeCount} trees...`);

    // Create a grid-based distribution for initial positions
    const gridSize = Math.ceil(Math.sqrt(treeCount * 2)); // 2x more grid cells than trees for better distribution
    const cellSize = worldSize / gridSize; // Smaller cells for more precise placement

    // Create a list of potential positions with some randomness within each grid cell
    const potentialPositions = [];
    for (let x = 0; x < gridSize; x++) {
        for (let z = 0; z < gridSize; z++) {
            // Calculate base position in the grid
            const baseX = (x * cellSize) - worldHalfSize + (cellSize / 2);
            const baseZ = (z * cellSize) - worldHalfSize + (cellSize / 2);

            // Add randomness within the cell
            const randomX = baseX + (Math.random() * cellSize * 0.8 - cellSize * 0.4);
            const randomZ = baseZ + (Math.random() * cellSize * 0.8 - cellSize * 0.4);

            potentialPositions.push(new THREE.Vector2(randomX, randomZ));
        }
    }

    // Shuffle the positions for more natural distribution
    for (let i = potentialPositions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [potentialPositions[i], potentialPositions[j]] = [potentialPositions[j], potentialPositions[i]];
    }

    // Function to check if a position is too close to existing trees
    // Optimized for better performance with many trees
    function isTooClose(position) {
        // Quick spatial check - only check trees that could be within range
        // This optimization is crucial for handling 300+ trees efficiently
        for (const existingPos of treePositions) {
            // Quick check on x and y separately before doing the more expensive distance calculation
            if (Math.abs(position.x - existingPos.x) < minTreeDistance &&
                Math.abs(position.y - existingPos.y) < minTreeDistance) {

                const distance = position.distanceTo(existingPos);
                if (distance < minTreeDistance) {
                    return true;
                }
            }
        }
        return false;
    }

    // Place trees using the potential positions
    let treesPlaced = 0;
    for (const position of potentialPositions) {
        // Skip if too close to another tree
        if (isTooClose(position)) {
            continue;
        }

        let tree;

        if (treeModel && !useFallbackTrees) {
            // Use the loaded tree model
            tree = treeModel.clone();

            // Scale the tree with more variety for a natural forest feel
            // Mix of smaller and larger trees with a bias toward medium-sized trees
            let scale;
            const randVal = Math.random();
            if (randVal < 0.2) {
                // 20% chance of smaller trees (2.0-3.0)
                scale = 2.0 + Math.random() * 1.0;
            } else if (randVal < 0.9) {
                // 70% chance of medium trees (3.0-5.0)
                scale = 3.0 + Math.random() * 2.0;
            } else {
                // 10% chance of larger trees (5.0-7.0)
                scale = 5.0 + Math.random() * 2.0;
            }
            tree.scale.set(scale, scale, scale);

            // Rotate for variety
            tree.rotation.y = Math.random() * Math.PI * 2;
        } else {
            // Fallback to procedural tree if model isn't loaded
            const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.7, 5);
            const trunkMaterial = new THREE.MeshStandardMaterial({
                color: 0x4d2926,
                roughness: 0.8,
                metalness: 0.1
            });
            const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
            trunk.castShadow = true;

            const foliageGeometry = new THREE.ConeGeometry(2, 4, 8);
            const foliageMaterial = new THREE.MeshStandardMaterial({
                color: 0x2d5a27,
                roughness: 0.8,
                metalness: 0.1
            });
            const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
            foliage.position.y = 3;
            foliage.castShadow = true;

            tree = new THREE.Group();
            tree.add(trunk);
            tree.add(foliage);
        }

        // Position the tree using our grid-based position
        tree.position.set(
            position.x,
            0, // Position at ground level, the model has its own height
            position.y // Vector2 uses y for the z-coordinate
        );

        tree.userData.type = 'tree';
        scene.add(tree);
        interactableObjects.push(tree);
        treeObjects.push(tree); // Add to tree objects array for alien

        // Store the position for collision detection
        treePositions.push(position);

        treesPlaced++;
        if (treesPlaced >= treeCount) {
            break;
        }
    }

    console.log(`Successfully placed ${treesPlaced} trees in the extremely dense forest`);

    // Create a larger clearing around the player's starting position for the denser forest
    const clearingRadius = 10; // Increased from 8 to 10 for more starting space
    const playerStartPos = new THREE.Vector2(0, 0);

    // Remove trees that are too close to the player's starting position
    for (let i = scene.children.length - 1; i >= 0; i--) {
        const object = scene.children[i];
        if (object.userData.type === 'tree') {
            const treePos = new THREE.Vector2(object.position.x, object.position.z);
            const distanceToPlayer = treePos.distanceTo(playerStartPos);

            if (distanceToPlayer < clearingRadius) {
                // Remove from scene and interactable objects
                scene.remove(object);
                const index = interactableObjects.indexOf(object);
                if (index > -1) {
                    interactableObjects.splice(index, 1);
                }
            }
        }
    }

    // Add rocks scattered throughout the forest
    const rockCount = 30; // Increased from 15 to 30 rocks
    const minRockDistance = 2; // Minimum distance between rocks
    const rockPositions = []; // Array to store rock positions for collision detection

    console.log(`Adding ${rockCount} rocks to the environment...`);

    // Create potential positions for rocks (different from tree positions)
    const rockPotentialPositions = [];
    for (let x = 0; x < gridSize * 1.5; x++) {
        for (let z = 0; z < gridSize * 1.5; z++) {
            // Calculate base position in a finer grid
            const baseX = ((x * cellSize) / 1.5) - worldHalfSize + (cellSize / 3);
            const baseZ = ((z * cellSize) / 1.5) - worldHalfSize + (cellSize / 3);

            // Add randomness within the cell
            const randomX = baseX + (Math.random() * cellSize * 0.6 - cellSize * 0.3);
            const randomZ = baseZ + (Math.random() * cellSize * 0.6 - cellSize * 0.3);

            rockPotentialPositions.push(new THREE.Vector2(randomX, randomZ));
        }
    }

    // Shuffle the positions for more natural distribution
    for (let i = rockPotentialPositions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rockPotentialPositions[i], rockPotentialPositions[j]] = [rockPotentialPositions[j], rockPotentialPositions[i]];
    }

    // Function to check if a rock position is too close to existing rocks or trees
    // Optimized for better performance with many objects
    function isRockTooClose(position) {
        // Check distance to trees with quick spatial check first
        const treeCheckDistance = minTreeDistance / 2; // Rocks can be closer to trees than trees to trees
        for (const treePos of treePositions) {
            // Quick check on x and y separately before doing the more expensive distance calculation
            if (Math.abs(position.x - treePos.x) < treeCheckDistance &&
                Math.abs(position.y - treePos.y) < treeCheckDistance) {

                const distance = position.distanceTo(treePos);
                if (distance < treeCheckDistance) {
                    return true;
                }
            }
        }

        // Check distance to other rocks with quick spatial check first
        for (const rockPos of rockPositions) {
            // Quick check on x and y separately before doing the more expensive distance calculation
            if (Math.abs(position.x - rockPos.x) < minRockDistance &&
                Math.abs(position.y - rockPos.y) < minRockDistance) {

                const distance = position.distanceTo(rockPos);
                if (distance < minRockDistance) {
                    return true;
                }
            }
        }

        return false;
    }

    // Place rocks using the potential positions
    let rocksPlaced = 0;
    for (const position of rockPotentialPositions) {
        // Skip if too close to trees or other rocks
        if (isRockTooClose(position)) {
            continue;
        }

        let rock;

        if (rockModel && !useFallbackTrees) { // If rock model is loaded and we're not using fallbacks
            // Use the loaded rock model
            rock = rockModel.clone();

            // Scale the rock to be very small with minimal randomness
            const scale = 0.005 + Math.random() * 0.002; // Random scale between 0.005 and 0.007
            rock.scale.set(scale, scale, scale);

            // Rotate for variety
            rock.rotation.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI
            );
        } else {
            // Fallback to procedural rock if model isn't loaded
            const rockGeometry = new THREE.DodecahedronGeometry(0.5);
            const vertices = rockGeometry.attributes.position.array;
            for (let j = 0; j < vertices.length; j += 3) {
                vertices[j] *= 0.8 + Math.random() * 0.4;
                vertices[j + 1] *= 0.8 + Math.random() * 0.4;
                vertices[j + 2] *= 0.8 + Math.random() * 0.4;
            }
            const rockMaterial = new THREE.MeshStandardMaterial({
                color: 0x808080,
                roughness: 0.9,
                metalness: 0.1
            });
            rock = new THREE.Mesh(rockGeometry, rockMaterial);
            rock.rotation.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI
            );
        }

        // Position the rock using our grid-based position
        rock.position.set(
            position.x,
            0, // Position at ground level, the model has its own height
            position.y // Vector2 uses y for the z-coordinate
        );

        rock.userData.type = 'rock';
        rock.castShadow = true;
        scene.add(rock);
        interactableObjects.push(rock);

        // Store the position for collision detection
        rockPositions.push(position);

        rocksPlaced++;
        if (rocksPlaced >= rockCount) {
            break;
        }
    }

    console.log(`Placed ${rocksPlaced} rocks in the environment`);

    // Initialize the alien after environment is created
    if (treeObjects.length > 0) {
        console.log('Initializing alien to stalk the player...');
        alien = new Alien(scene, camera, camera.position);
    } else {
        console.warn('No trees available for alien to hide behind');
    }

    // Initialize the tree regeneration system
    console.log('Initializing tree regeneration system...');
    treeRegenerationSystem = new TreeRegenerationSystem(scene, interactableObjects);
    treeRegenerationSystem.setTreeModel(treeModel);

    // Convert tree positions from Vector2 to match the format used in the regeneration system
    const treePositionsForSystem = treePositions.map(pos => new THREE.Vector2(pos.x, pos.y));
    treeRegenerationSystem.updateTreePositions(treePositionsForSystem);

    // Initialize the day-night cycle
    console.log('Initializing day-night cycle...');
    dayNightCycle = new DayNightCycle(scene, skyParams, updateSunPosition);

    // Initialize the UFO system
    console.log('Initializing UFO system...');
    ufoSystem = new UFOSystem(scene, camera, camera.position);

    // Initialize the game over menu
    console.log('Initializing game over menu...');
    gameOverMenu = new GameOverMenu();
    gameOverMenu.initialize(() => {
        // Restart game when button is clicked
        location.reload();
    });

    // Set up day-night cycle callbacks
    dayNightCycle.setCallbacks(
        // Night start callback
        () => {
            console.log('Night has started, UFO is appearing...');
            ufoSystem.startNightCycle();
        },
        // Night end callback
        () => {
            console.log('Night has ended, UFO is disappearing...');
            ufoSystem.endNightCycle();
        }
    );

    // Start the day-night cycle
    dayNightCycle.start();

    // Initialize the day-night HUD
    console.log('Initializing day-night HUD...');
    dayNightHUD = new DayNightHUD(dayNightCycle);
    dayNightHUD.initialize();

    // Update terminal with day-night cycle reference
    if (terminal) {
        terminal.game.dayNightCycle = dayNightCycle;
    }
}

// Function to reset axe position to default (can be called from console for testing)
function resetAxePosition() {
    // Set to our new improved default position and rotation
    axePosition = new THREE.Vector3(0.570, -0.770, -0.960);
    axeRotation = new THREE.Euler(0.055, 4.826, 0.020);

    // Update localStorage with these values
    localStorage.setItem('axePosition', JSON.stringify([axePosition.x, axePosition.y, axePosition.z]));
    localStorage.setItem('axeRotation', JSON.stringify([axeRotation.x, axeRotation.y, axeRotation.z]));

    // If axe is currently visible, update it immediately
    if (axeMesh) {
        axeMesh.position.copy(axePosition);
        axeMesh.rotation.copy(axeRotation);
    }

    console.log('Axe position and rotation reset to new default values and applied.');
}

function setupEditorControls() {
    let MOVE_SPEED = 0.01;
    let ROTATE_SPEED = 0.01;
    let SCALE_SPEED = 0.1;

    // Track what we're currently editing (0 = weapon, 1 = arrow, 2 = arrow orientation)
    let editingMode = 0;

    // Create a position display element
    const positionDisplay = document.createElement('div');
    positionDisplay.id = 'position-display';
    positionDisplay.style.position = 'fixed';
    positionDisplay.style.bottom = '10px';
    positionDisplay.style.right = '10px';
    positionDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    positionDisplay.style.color = 'white';
    positionDisplay.style.padding = '10px';
    positionDisplay.style.fontFamily = 'monospace';
    positionDisplay.style.fontSize = '14px';
    positionDisplay.style.borderRadius = '5px';
    positionDisplay.style.display = 'none';
    document.body.appendChild(positionDisplay);

    // Function to update position display
    function updatePositionDisplay() {
        let displayHTML = '';

        if (editingMode === 0) {
            // Editing weapon (axe or bow)
            // Get the active weapon mesh
            let weaponMesh;
            let weaponName;

            if (equippedWeapon === 'axe' && axeMesh) {
                weaponMesh = axeMesh;
                weaponName = 'Axe';
            } else if (equippedWeapon === 'bow' && bowAndArrowSystem && bowAndArrowSystem.bowMesh) {
                weaponMesh = bowAndArrowSystem.bowMesh;
                weaponName = 'Bow';
            }

            if (!weaponMesh) return;

            const pos = weaponMesh.position;
            const rot = weaponMesh.rotation;

            // Basic HTML for position and rotation
            displayHTML = `
                <strong>${weaponName} Position:</strong><br>
                X: ${pos.x.toFixed(3)}<br>
                Y: ${pos.y.toFixed(3)}<br>
                Z: ${pos.z.toFixed(3)}<br>
                <br>
                <strong>${weaponName} Rotation:</strong><br>
                X: ${rot.x.toFixed(3)}<br>
                Y: ${rot.y.toFixed(3)}<br>
                Z: ${rot.z.toFixed(3)}<br>
                <br>
            `;

            // Add scale information for bow
            if (weaponName === 'Bow') {
                const scale = weaponMesh.scale.x; // Assuming uniform scaling
                displayHTML += `
                <strong>Bow Scale:</strong><br>
                Scale: ${scale.toFixed(3)}<br>
                <br>
                `;
            }

            // Add copy values section
            displayHTML += `
                <strong>Copy these values:</strong><br>
                Position: [${pos.x.toFixed(3)}, ${pos.y.toFixed(3)}, ${pos.z.toFixed(3)}]<br>
                Rotation: [${rot.x.toFixed(3)}, ${rot.y.toFixed(3)}, ${rot.z.toFixed(3)}]<br>
            `;

            // Add scale values for bow
            if (weaponName === 'Bow') {
                const scale = weaponMesh.scale.x;
                displayHTML += `Scale: ${scale.toFixed(3)}<br>`;
            }

            // Add mode switching instructions
            if (weaponName === 'Bow' && bowAndArrowSystem && bowAndArrowSystem.isArrowNocked) {
                displayHTML += `<br><strong>Press 2 to edit arrow position</strong>`;
            }
        } else if (editingMode === 1) {
            // Editing arrow on bow
            if (equippedWeapon === 'bow' && bowAndArrowSystem && bowAndArrowSystem.currentArrow) {
                const arrowMesh = bowAndArrowSystem.currentArrow;
                const pos = arrowMesh.position;
                const rot = arrowMesh.rotation;
                const scale = arrowMesh.scale.x; // Assuming uniform scaling

                displayHTML = `
                    <strong>Arrow Position:</strong><br>
                    X: ${pos.x.toFixed(3)}<br>
                    Y: ${pos.y.toFixed(3)}<br>
                    Z: ${pos.z.toFixed(3)}<br>
                    <br>
                    <strong>Arrow Rotation:</strong><br>
                    X: ${rot.x.toFixed(3)}<br>
                    Y: ${rot.y.toFixed(3)}<br>
                    Z: ${rot.z.toFixed(3)}<br>
                    <br>
                    <strong>Arrow Scale:</strong><br>
                    Scale: ${scale.toFixed(3)}<br>
                    <br>
                    <strong>Copy these values:</strong><br>
                    Position: [${pos.x.toFixed(3)}, ${pos.y.toFixed(3)}, ${pos.z.toFixed(3)}]<br>
                    Rotation: [${rot.x.toFixed(3)}, ${rot.y.toFixed(3)}, ${rot.z.toFixed(3)}]<br>
                    Scale: ${scale.toFixed(3)}<br>
                    <br>
                    <strong>Press 1 to edit bow position</strong><br>
                    <strong>Press 3 to edit arrow orientation</strong>
                `;
            } else {
                // No arrow to edit
                displayHTML = `<strong>No arrow to edit</strong><br><br><strong>Press 1 to edit weapon</strong>`;
                editingMode = 0; // Switch back to weapon editing
            }
        } else if (editingMode === 2) {
            // Editing arrow shooting orientation
            if (equippedWeapon === 'bow' && bowAndArrowSystem) {
                // Create the orientation helper if it doesn't exist
                if (!bowAndArrowSystem.shootingOrientationHelper) {
                    bowAndArrowSystem.createShootingOrientationHelper();
                }

                const rot = bowAndArrowSystem.shootingOrientation;

                displayHTML = `
                    <strong>Arrow Shooting Orientation:</strong><br>
                    X: ${rot.x.toFixed(3)}<br>
                    Y: ${rot.y.toFixed(3)}<br>
                    Z: ${rot.z.toFixed(3)}<br>
                    <br>
                    <strong>Controls:</strong><br>
                    W/S: Rotate X axis<br>
                    A/D: Rotate Y axis<br>
                    Q/E: Rotate Z axis<br>
                    <br>
                    <strong>Copy these values:</strong><br>
                    Rotation: [${rot.x.toFixed(3)}, ${rot.y.toFixed(3)}, ${rot.z.toFixed(3)}]<br>
                    <br>
                    <strong>Press 1 to edit bow position</strong><br>
                    <strong>Press 2 to edit arrow position</strong>
                `;
            } else {
                // No bow equipped
                displayHTML = `<strong>Bow not equipped</strong><br><br><strong>Press 1 to edit weapon</strong>`;
                editingMode = 0; // Switch back to weapon editing
            }
        }

        positionDisplay.innerHTML = displayHTML;
    }

    document.addEventListener('keydown', (event) => {
        // Toggle editor mode with CTRL+E
        if (event.ctrlKey && event.code === 'KeyE') {
            event.preventDefault();
            editorMode = !editorMode;

            if (editorMode) {
                // Enter editor mode
                let instructions = 'EDITOR MODE - Arrow keys to move, < > for height, WASD to rotate';

                // Add scale instructions for bow
                if (equippedWeapon === 'bow') {
                    instructions += ', Z/X to scale, CTRL+E to save';
                } else {
                    instructions += ', CTRL+E to save';
                }

                document.getElementById('interaction-prompt').textContent = instructions;
                document.getElementById('interaction-prompt').style.display = 'block';
                positionDisplay.style.display = 'block';
                updatePositionDisplay();

                // Unlock controls when in editor mode
                if (controls.isLocked) {
                    controls.unlock();
                }
            } else {
                // Exit editor mode and save changes
                if (editingMode === 0) {
                    // Save weapon position
                    if (equippedWeapon === 'axe' && axeMesh) {
                        // Save axe position and rotation
                        axePosition.copy(axeMesh.position);
                        axeRotation.copy(axeMesh.rotation);
                        localStorage.setItem('axePosition', JSON.stringify([axeMesh.position.x, axeMesh.position.y, axeMesh.position.z]));
                        localStorage.setItem('axeRotation', JSON.stringify([axeMesh.rotation.x, axeMesh.rotation.y, axeMesh.rotation.z]));
                        console.log('Saved axe position:', [axeMesh.position.x, axeMesh.position.y, axeMesh.position.z]);
                        console.log('Saved axe rotation:', [axeMesh.rotation.x, axeMesh.rotation.y, axeMesh.rotation.z]);
                    } else if (equippedWeapon === 'bow' && bowAndArrowSystem && bowAndArrowSystem.bowMesh) {
                        // Save bow position, rotation, and scale
                        const bowMesh = bowAndArrowSystem.bowMesh;
                        bowAndArrowSystem.bowPosition.copy(bowMesh.position);
                        bowAndArrowSystem.bowRotation.copy(bowMesh.rotation);
                        bowAndArrowSystem.bowScale = bowMesh.scale.x; // Assuming uniform scaling

                        // Save to localStorage
                        localStorage.setItem('bowPosition', JSON.stringify([bowMesh.position.x, bowMesh.position.y, bowMesh.position.z]));
                        localStorage.setItem('bowRotation', JSON.stringify([bowMesh.rotation.x, bowMesh.rotation.y, bowMesh.rotation.z]));
                        localStorage.setItem('bowScale', bowMesh.scale.x);

                        console.log('Saved bow position:', [bowMesh.position.x, bowMesh.position.y, bowMesh.position.z]);
                        console.log('Saved bow rotation:', [bowMesh.rotation.x, bowMesh.rotation.y, bowMesh.rotation.z]);
                        console.log('Saved bow scale:', bowMesh.scale.x);
                    }
                } else if (editingMode === 1 || editingMode === 2) {
                    // Save arrow position, rotation, and scale (mode 1) or orientation (mode 2)
                    if (equippedWeapon === 'bow' && bowAndArrowSystem) {
                        // If we were in orientation editing mode, save the shooting orientation
                        if (editingMode === 2) {
                            // Save the shooting orientation
                            const orientation = bowAndArrowSystem.shootingOrientation;
                            localStorage.setItem('arrowShootingOrientation', JSON.stringify([orientation.x, orientation.y, orientation.z]));
                            console.log('Saved arrow shooting orientation:', [orientation.x, orientation.y, orientation.z]);

                            // Remove the orientation helper
                            bowAndArrowSystem.removeShootingOrientationHelper();
                        }

                        // Only save arrow position/rotation if we have an arrow and were in arrow position editing mode
                        if (editingMode === 1 && bowAndArrowSystem.currentArrow) {
                            const arrowMesh = bowAndArrowSystem.currentArrow;

                            // Save arrow position, rotation, and scale to localStorage
                            localStorage.setItem('arrowPosition', JSON.stringify([arrowMesh.position.x, arrowMesh.position.y, arrowMesh.position.z]));
                            localStorage.setItem('arrowRotation', JSON.stringify([arrowMesh.rotation.x, arrowMesh.rotation.y, arrowMesh.rotation.z]));
                            localStorage.setItem('arrowScale', arrowMesh.scale.x);

                            console.log('Saved arrow position:', [arrowMesh.position.x, arrowMesh.position.y, arrowMesh.position.z]);
                            console.log('Saved arrow rotation:', [arrowMesh.rotation.x, arrowMesh.rotation.y, arrowMesh.rotation.z]);
                            console.log('Saved arrow scale:', arrowMesh.scale.x);

                            // Update the default arrow position in the bow and arrow system
                            bowAndArrowSystem.arrowOffsetX = arrowMesh.position.x;
                            bowAndArrowSystem.arrowOffsetY = arrowMesh.position.y;
                            bowAndArrowSystem.arrowOffsetZ = arrowMesh.position.z;
                            bowAndArrowSystem.arrowRotationX = arrowMesh.rotation.x;
                            bowAndArrowSystem.arrowRotationY = arrowMesh.rotation.y;
                            bowAndArrowSystem.arrowRotationZ = arrowMesh.rotation.z;
                            bowAndArrowSystem.arrowScale = arrowMesh.scale.x;
                        }
                    }
                }

                document.getElementById('interaction-prompt').style.display = 'none';
                positionDisplay.style.display = 'none';
            }
            return;
        }

        // Handle editor mode key controls
        if (!editorMode) return;

        // Special handling for orientation editing mode
        if (editingMode === 2) {
            if (equippedWeapon === 'bow' && bowAndArrowSystem) {
                // Get the orientation to edit
                const orientation = bowAndArrowSystem.shootingOrientation;

                // Handle rotation controls
                switch (event.code) {
                    case 'KeyW':
                        orientation.x -= ROTATE_SPEED;
                        bowAndArrowSystem.updateShootingOrientationHelper();
                        updatePositionDisplay();
                        return;
                    case 'KeyS':
                        orientation.x += ROTATE_SPEED;
                        bowAndArrowSystem.updateShootingOrientationHelper();
                        updatePositionDisplay();
                        return;
                    case 'KeyA':
                        orientation.y -= ROTATE_SPEED;
                        bowAndArrowSystem.updateShootingOrientationHelper();
                        updatePositionDisplay();
                        return;
                    case 'KeyD':
                        orientation.y += ROTATE_SPEED;
                        bowAndArrowSystem.updateShootingOrientationHelper();
                        updatePositionDisplay();
                        return;
                    case 'KeyQ':
                        orientation.z -= ROTATE_SPEED;
                        bowAndArrowSystem.updateShootingOrientationHelper();
                        updatePositionDisplay();
                        return;
                    case 'KeyE':
                        orientation.z += ROTATE_SPEED;
                        bowAndArrowSystem.updateShootingOrientationHelper();
                        updatePositionDisplay();
                        return;
                }
            }
        }

        // Get the mesh to edit based on editing mode
        let targetMesh;

        if (editingMode === 0) {
            // Editing weapon
            if (equippedWeapon === 'axe' && axeMesh) {
                targetMesh = axeMesh;
            } else if (equippedWeapon === 'bow' && bowAndArrowSystem && bowAndArrowSystem.bowMesh) {
                targetMesh = bowAndArrowSystem.bowMesh;
            } else {
                return; // No weapon to edit
            }
        } else if (editingMode === 1) {
            // Editing arrow
            if (equippedWeapon === 'bow' && bowAndArrowSystem && bowAndArrowSystem.currentArrow) {
                targetMesh = bowAndArrowSystem.currentArrow;
            } else {
                // No arrow to edit, switch back to weapon
                editingMode = 0;
                updatePositionDisplay();
                return;
            }
        } else if (editingMode === 2) {
            // Orientation editing mode doesn't use targetMesh for movement/rotation
            return;
        }

        // Position controls with arrow keys
        switch (event.code) {
            case 'ArrowUp':
                targetMesh.position.z -= MOVE_SPEED;
                updatePositionDisplay();
                break;
            case 'ArrowDown':
                targetMesh.position.z += MOVE_SPEED;
                updatePositionDisplay();
                break;
            case 'ArrowLeft':
                targetMesh.position.x -= MOVE_SPEED;
                updatePositionDisplay();
                break;
            case 'ArrowRight':
                targetMesh.position.x += MOVE_SPEED;
                updatePositionDisplay();
                break;
            case 'Period': // > key
                targetMesh.position.y += MOVE_SPEED;
                updatePositionDisplay();
                break;
            case 'Comma': // < key
                targetMesh.position.y -= MOVE_SPEED;
                updatePositionDisplay();
                break;

            // Rotation controls with WASD
            case 'KeyW':
                targetMesh.rotation.x -= ROTATE_SPEED;
                updatePositionDisplay();
                break;
            case 'KeyS':
                targetMesh.rotation.x += ROTATE_SPEED;
                updatePositionDisplay();
                break;
            case 'KeyA':
                targetMesh.rotation.y -= ROTATE_SPEED;
                updatePositionDisplay();
                break;
            case 'KeyD':
                targetMesh.rotation.y += ROTATE_SPEED;
                updatePositionDisplay();
                break;
            case 'KeyQ':
                targetMesh.rotation.z -= ROTATE_SPEED;
                updatePositionDisplay();
                break;
            case 'KeyE':
                targetMesh.rotation.z += ROTATE_SPEED;
                updatePositionDisplay();
                break;

            // Scale controls (Z/X keys)
            case 'KeyZ':
                // Decrease scale
                const decreaseScale = Math.max(0.1, targetMesh.scale.x - SCALE_SPEED);
                targetMesh.scale.set(decreaseScale, decreaseScale, decreaseScale);
                updatePositionDisplay();
                break;
            case 'KeyX':
                // Increase scale
                const increaseScale = Math.min(20, targetMesh.scale.x + SCALE_SPEED);
                targetMesh.scale.set(increaseScale, increaseScale, increaseScale);
                updatePositionDisplay();
                break;

            // Switch between editing bow and arrow
            case 'Digit1':
                if (editingMode === 1 || editingMode === 2) {
                    // Switch to editing weapon from arrow position or orientation mode
                    editingMode = 0;
                    updatePositionDisplay();
                    document.getElementById('interaction-prompt').textContent = 'EDITOR MODE - Now editing weapon - Arrows/< > to move, WASD/QE to rotate';
                } else {
                    // Fine adjustment
                    MOVE_SPEED = 0.001;
                    ROTATE_SPEED = 0.001;
                    SCALE_SPEED = 0.01;
                    let finePrompt = 'EDITOR MODE - Fine adjustment (0.001) - Arrows/< > to move, WASD/QE to rotate';
                    if (equippedWeapon === 'bow') {
                        finePrompt += ', Z/X to scale';
                    }
                    document.getElementById('interaction-prompt').textContent = finePrompt;
                }
                break;
            case 'Digit2':
                if (equippedWeapon === 'bow' && bowAndArrowSystem && bowAndArrowSystem.isArrowNocked) {
                    // Switch to editing arrow position (from either weapon or orientation mode)
                    editingMode = 1;
                    updatePositionDisplay();
                    document.getElementById('interaction-prompt').textContent = 'EDITOR MODE - Now editing arrow - Arrows/< > to move, WASD/QE to rotate, Z/X to scale';
                } else {
                    // Medium adjustment
                    MOVE_SPEED = 0.01;
                    ROTATE_SPEED = 0.01;
                    SCALE_SPEED = 0.1;
                    let mediumPrompt = 'EDITOR MODE - Medium adjustment (0.01) - Arrows/< > to move, WASD/QE to rotate';
                    if (equippedWeapon === 'bow') {
                        mediumPrompt += ', Z/X to scale';
                    }
                    document.getElementById('interaction-prompt').textContent = mediumPrompt;
                }
                break;
            case 'Digit3':
                if (equippedWeapon === 'bow' && bowAndArrowSystem) {
                    // Switch to editing arrow shooting orientation
                    editingMode = 2;
                    updatePositionDisplay();
                    document.getElementById('interaction-prompt').textContent = 'EDITOR MODE - Now editing arrow shooting orientation - WASD/QE to rotate';

                    // Create the orientation helper if it doesn't exist
                    if (!bowAndArrowSystem.shootingOrientationHelper) {
                        bowAndArrowSystem.createShootingOrientationHelper();
                    }
                } else {
                    // Coarse adjustment
                    MOVE_SPEED = 0.1;
                    ROTATE_SPEED = 0.1;
                    SCALE_SPEED = 0.5;
                    let coarsePrompt = 'EDITOR MODE - Coarse adjustment (0.1) - Arrows/< > to move, WASD/QE to rotate';
                    if (equippedWeapon === 'bow') {
                        coarsePrompt += ', Z/X to scale';
                    }
                    document.getElementById('interaction-prompt').textContent = coarsePrompt;
                }
                break;
        }
    });
}

function onKeyDown(event) {
    // Track Ctrl key for bow and arrow system
    if (event.ctrlKey && bowAndArrowSystem) {
        bowAndArrowSystem.ctrlPressed = true;
    }

    // Track number keys for bow and arrow system
    if (event.code.startsWith('Digit') && bowAndArrowSystem) {
        const digit = event.code.replace('Digit', '');
        bowAndArrowSystem.keyPressed = digit;
    }

    // Handle terminal toggle with ~ key (Backquote)
    if (event.code === 'Backquote') {
        if (terminal) {
            terminal.toggle();
            event.preventDefault();
            return;
        }
    }

    // Don't process other keys when terminal is open
    if (terminal && terminal.isOpen) {
        return;
    }

    // Handle crafting menu toggle with I key
    if (event.code === 'KeyI') {
        if (craftingSystem) {
            console.log('Toggling crafting menu via I key');
            craftingSystem.toggleMenu();
            event.preventDefault();
            return;
        } else {
            console.warn('Crafting system not initialized yet');
        }
    }

    if (editorMode) return;

    switch (event.code) {
        case 'KeyW':
            moveForward = true;
            break;
        case 'KeyS':
            moveBackward = true;
            break;
        case 'KeyA':
            moveLeft = true;
            break;
        case 'KeyD':
            moveRight = true;
            break;
        case 'Space':
            spacePressed = true;
            if (equippedWeapon === 'axe' && inventory.hasItems(['axe'])) {
                // Only start animation and try chopping if not already animating
                if (!axeAnimating) {
                    startAxeAnimation();
                    tryChopTree();
                }
            } else if (equippedWeapon === 'bow' && inventory.hasItems(['bow', 'arrow'])) {
                // Shoot arrow
                bowAndArrowSystem.shootArrow();
            }
            break;
        case 'KeyB':
            // Force cleanup any lingering blueprints before showing the building menu
            if (buildingSystem.currentBlueprint) {
                console.log('B KEY: Cleaning up lingering blueprint before showing menu');
                forceCleanupAllBlueprints();
            }

            // Toggle the building menu: close if open, open if closed
            if (buildingSystem.isBuildingMenuOpen()) {
                console.log('B KEY: Closing building menu');
                buildingSystem.hideBuildingMenu();
            } else if (!buildingSystem.isBuilding) {
                console.log('B KEY: Opening building menu');
                buildingSystem.showBuildingMenu();
            }
            break;
        case 'Escape':
            // Set the force cleanup flag
            forceCleanupBlueprint = true;
            console.log('ESCAPE KEY: Setting force cleanup flag');

            // Try the normal cancellation for building
            if (buildingSystem.isBuilding) {
                buildingSystem.cancelBuilding();
            }

            // Cancel crafting placement if active
            if (craftingSystem && craftingSystem.isCrafting) {
                console.log('Cancelling crafting placement via Escape key');
                craftingSystem.cancelPlacement();
            }
            break;

        case 'KeyT':
            // Cycle through times of day manually
            if (dayNightCycle) {
                if (dayNightCycle.isNight) {
                    // Force day
                    dayNightCycle.setTimeOfDay('day');
                    console.log('Forced time of day: Day');
                } else {
                    // Force night
                    dayNightCycle.setTimeOfDay('night');
                    console.log('Forced time of day: Night');
                }
            } else {
                // Fallback to old method if day-night cycle isn't initialized
                if (skyParams.elevation > 0) {
                    // Switch to night
                    skyParams.elevation = -10;
                    skyParams.turbidity = 6;
                    skyParams.rayleigh = 1;
                    console.log('Time of day: Night');
                } else {
                    // Switch to day
                    skyParams.elevation = 45;
                    skyParams.turbidity = 8;
                    skyParams.rayleigh = 1.5;
                    console.log('Time of day: Day');
                }
                updateSunPosition();
            }
            break;
    }
}

function onKeyUp(event) {
    // Reset Ctrl key state for bow and arrow system
    if (event.code === 'ControlLeft' || event.code === 'ControlRight') {
        if (bowAndArrowSystem) {
            bowAndArrowSystem.ctrlPressed = false;
        }
    }

    // Don't process keys when terminal is open
    if (terminal && terminal.isOpen) {
        return;
    }

    if (editorMode) return;

    switch (event.code) {
        case 'KeyW':
            moveForward = false;
            break;
        case 'KeyS':
            moveBackward = false;
            break;
        case 'KeyA':
            moveLeft = false;
            break;
        case 'KeyD':
            moveRight = false;
            break;
        case 'Space':
            spacePressed = false;
            break;
    }
}

window.addEventListener('resize', onWindowResize, false);

function onWindowResize() {
    if (camera) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    }
    if (renderer) {
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
}