import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Inventory, Item } from './inventory.js';
import { BuildingSystem } from './buildingSystem.js';
import { CraftingSystem } from './craftingSystem.js';
import { Terminal } from './terminal.js';
import { Sky } from './Sky.js';
import { createFireParticles, updateFireParticles, removeFireParticles } from './fireParticles.js';

const savedAxePosition = localStorage.getItem('axePosition');
const savedAxeRotation = localStorage.getItem('axeRotation');

let axePosition, axeRotation;

if (savedAxePosition) {
    const pos = JSON.parse(savedAxePosition);
    axePosition = new THREE.Vector3(pos[0], pos[1], pos[2]);
} else {
    // Use the position you adjusted in the editor as the default
    axePosition = new THREE.Vector3(0.5, -0.3, -0.7);
}

if (savedAxeRotation) {
    const rot = JSON.parse(savedAxeRotation);
    axeRotation = new THREE.Euler(rot[0], rot[1], rot[2]);
} else {
    // Use the rotation you adjusted in the editor as the default
    axeRotation = new THREE.Euler(0.2, -0.3, 0.1);
}

let camera, scene, renderer, controls;
let moveForward = false;
let moveBackward = false;

// Sky variables
let sky, sun, ambientLight, directionalLight;

// Model variables
let treeModel, rockModel, logPileModel;
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
let editorMode = false;
let spacePressed = false;

// Axe animation variables
let axeAnimating = false;
let axeAnimationStartTime = 0;
let axeAnimationDuration = 500; // milliseconds

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

        // Initialize crafting system after building system
        craftingSystem = new CraftingSystem(scene, camera, inventory, buildingSystem);

        // Initialize terminal
        terminal = new Terminal({
            controls: controls,
            inventory: inventory,
            buildingSystem: buildingSystem,
            craftingSystem: craftingSystem
        });

        // Create a loader for all models
        const gltfLoader = new GLTFLoader();
        let modelsLoaded = 0;
        const totalModels = 3; // Tree, rock, and log pile
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

        // Calculate desired velocity
        if (moveForward || moveBackward) {
            newVelocity.z = direction.z * speed;
        }
        if (moveLeft || moveRight) {
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
        if (axeMesh && !editorMode) {
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
                // Calculate delta time in seconds
                const deltaTime = clock.getDelta();
                updateFireParticles(object.userData.fireParticles, deltaTime);
            }
        });
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

        if (!axeMesh) {
            axeMesh = createAxeMesh();
            camera.add(axeMesh);
            axeMesh.position.copy(axePosition);
            axeMesh.rotation.copy(axeRotation);
        }
    }
}

function createAxeMesh() {
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

                const index = interactableObjects.indexOf(tree);
                if (index > -1) {
                    interactableObjects.splice(index, 1);
                }
                scene.remove(tree);
                treeHealth.delete(tree);
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
    for (let i = 0; i < 10; i++) {
        let tree;

        if (treeModel && !useFallbackTrees) {
            // Use the loaded tree model
            tree = treeModel.clone();

            // Scale the tree appropriately
            const scale = 3.5 + Math.random() * 3.5; // Random scale between 3.5 and 7.0
            tree.scale.set(scale, scale, scale);

            // Rotate slightly for variety
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

        // Position the tree
        tree.position.set(
            Math.random() * 40 - 20,
            0, // Position at ground level, the model has its own height
            Math.random() * 40 - 20
        );
        tree.userData.type = 'tree';
        scene.add(tree);
        interactableObjects.push(tree);
    }

    for (let i = 0; i < 15; i++) { // Increased number of rocks to better fill the grid
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

        // Position the rock with more consistent spacing
        // Create a grid-like distribution with slight randomness
        const gridSize = 10; // Size of the grid
        const cellSize = 40 / gridSize; // Size of each cell
        const gridX = i % gridSize;
        const gridZ = Math.floor(i / gridSize);

        rock.position.set(
            -20 + gridX * cellSize + Math.random() * (cellSize * 0.5),
            0, // Position at ground level, the model has its own height
            -20 + gridZ * cellSize + Math.random() * (cellSize * 0.5)
        );

        rock.userData.type = 'rock';
        rock.castShadow = true;
        scene.add(rock);
        interactableObjects.push(rock);
    }
}

// Function to reset axe position to default (can be called from console for testing)
function resetAxePosition() {
    localStorage.removeItem('axePosition');
    localStorage.removeItem('axeRotation');
    console.log('Axe position and rotation reset to default. Refresh the page to apply.');
}

function setupEditorControls() {
    const MOVE_SPEED = 0.01;
    const ROTATE_SPEED = 0.01;

    document.addEventListener('keydown', (event) => {
        if (event.ctrlKey && event.code === 'KeyE') {
            event.preventDefault();
            editorMode = !editorMode;

            if (editorMode) {
                document.getElementById('interaction-prompt').textContent =
                    'EDITOR MODE - Arrow keys to move, WASD to rotate, CTRL+E to save';
                document.getElementById('interaction-prompt').style.display = 'block';
            } else {
                if (axeMesh) {
                    axePosition.copy(axeMesh.position);
                    axeRotation.copy(axeMesh.rotation);
                    localStorage.setItem('axePosition', JSON.stringify([axeMesh.position.x, axeMesh.position.y, axeMesh.position.z]));
                    localStorage.setItem('axeRotation', JSON.stringify([axeMesh.rotation.x, axeMesh.rotation.y, axeMesh.rotation.z]));
                }
                document.getElementById('interaction-prompt').style.display = 'none';
            }
            return;
        }

        if (!editorMode || !axeMesh) return;

        switch (event.code) {
            case 'ArrowUp':
                axeMesh.position.y += MOVE_SPEED;
                break;
            case 'ArrowDown':
                axeMesh.position.y -= MOVE_SPEED;
                break;
            case 'ArrowLeft':
                axeMesh.position.x -= MOVE_SPEED;
                break;
            case 'ArrowRight':
                axeMesh.position.x += MOVE_SPEED;
                break;
            case 'PageUp':
                axeMesh.position.z -= MOVE_SPEED;
                break;
            case 'PageDown':
                axeMesh.position.z += MOVE_SPEED;
                break;
            case 'KeyW':
                if (!event.ctrlKey) axeMesh.rotation.x -= ROTATE_SPEED;
                break;
            case 'KeyS':
                if (!event.ctrlKey) axeMesh.rotation.x += ROTATE_SPEED;
                break;
            case 'KeyA':
                if (!event.ctrlKey) axeMesh.rotation.y -= ROTATE_SPEED;
                break;
            case 'KeyD':
                if (!event.ctrlKey) axeMesh.rotation.y += ROTATE_SPEED;
                break;
            case 'KeyQ':
                axeMesh.rotation.z -= ROTATE_SPEED;
                break;
            case 'KeyE':
                if (!event.ctrlKey) axeMesh.rotation.z += ROTATE_SPEED;
                break;
        }
    });
}

function onKeyDown(event) {
    // Handle terminal toggle with ~ key (Backquote)
    if (event.code === 'Backquote') {
        if (terminal) {
            terminal.toggle();
            event.preventDefault();
            return;
        }
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

    // Don't process other keys when terminal is open
    if (terminal && terminal.isOpen) {
        return;
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
            if (inventory.hasItems(['axe'])) {
                spacePressed = true;
                // Only start animation and try chopping if not already animating
                if (!axeAnimating) {
                    startAxeAnimation();
                    tryChopTree();
                }
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
            // Cycle through times of day - balanced lighting
            if (skyParams.elevation > 30) {
                // Switch to sunset
                skyParams.elevation = 10;
                skyParams.turbidity = 10;
                skyParams.rayleigh = 2;
                console.log('Time of day: Sunset');
            } else if (skyParams.elevation > 0) {
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
            break;
    }
}

function onKeyUp(event) {
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