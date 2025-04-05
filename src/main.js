import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls';
import { Inventory, Item } from './inventory.js';
import { BuildingSystem } from './buildingSystem.js';
import { Terminal } from './terminal.js';

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
let moveLeft = false;
let moveRight = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();

let inventory;
let interactableObjects = [];
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

// Collision detection variables
const PLAYER_HEIGHT = 1.3; // Extremely reduced height to fit in structures
const PLAYER_RADIUS = 0.15; // Extremely reduced radius to fit through doorways
const COLLISION_THRESHOLD = 0.02; // Minimal threshold for very tight movement

const CHOP_DISTANCE = 3;
const CHOPS_TO_FELL = 5;
const treeHealth = new Map();
let buildingSystem;

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
        scene.background = new THREE.Color(0x87ceeb);

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
        document.body.appendChild(renderer.domElement);

        // Basic lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 2);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
        directionalLight.position.set(1, 3, 2);
        directionalLight.castShadow = true;
        scene.add(directionalLight);

        // Ground
        const groundGeometry = new THREE.PlaneGeometry(100, 100);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x33aa33,
            roughness: 0.8,
            metalness: 0.1
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
        setupInteractionControls(); // Add this line to initialize interaction controls

        // Initialize terminal
        terminal = new Terminal({
            controls: controls,
            inventory: inventory,
            buildingSystem: buildingSystem
        });

        // Add objects
        addEnvironmentObjects();

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
            const parentObject = object.parent.userData.type ? object.parent : object;
            const type = parentObject.userData.type;
            updatePrompts(`Press E to collect ${type}`);
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

    raycaster.setFromCamera(new THREE.Vector2(), camera);
    const intersects = raycaster.intersectObjects(interactableObjects, true);

    if (intersects.length > 0 && intersects[0].distance < INTERACT_DISTANCE) {
        const object = intersects[0].object;
        const parentObject = object.parent.userData.type ? object.parent : object;
        const type = parentObject.userData.type;

        if (type === 'tree') {
            inventory.addItem(new Item('stick'));
            updatePrompts('');
        } else if (type === 'rock') {
            inventory.addItem(new Item('rock'));
            scene.remove(parentObject);
            const index = interactableObjects.indexOf(parentObject);
            if (index > -1) {
                interactableObjects.splice(index, 1);
            }
            updatePrompts('');
        } else if (type === 'logs') {
            for (let i = 0; i < 5; i++) {
                inventory.addItem(new Item('log'));
            }
            scene.remove(parentObject);
            const index = interactableObjects.indexOf(parentObject);
            if (index > -1) {
                interactableObjects.splice(index, 1);
            }
            updatePrompts('');
        }
    }
}

function tryCraft() {
    if (inventory.hasItems(['stick', 'rock'])) {
        inventory.removeItem('stick');
        inventory.removeItem('rock');
        inventory.addItem(new Item('axe'));
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
    const logs = new THREE.Group();
    logs.userData.type = 'logs';

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

    logs.position.set(position.x, 0, position.z);
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
        const tree = object.parent.userData.type === 'tree' ? object.parent : null;

        if (tree) {
            const particles = createWoodChips();
            particles.position.copy(intersects[0].point);
            particles.userData.isChopParticles = true;
            scene.add(particles);

            const currentHealth = treeHealth.get(tree) || 0;
            const newHealth = currentHealth + 1;
            treeHealth.set(tree, newHealth);

            if (newHealth >= CHOPS_TO_FELL) {
                const logPile = createLogPile(tree.position);
                scene.add(logPile);
                interactableObjects.push(logPile);

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

function addEnvironmentObjects() {
    for (let i = 0; i < 10; i++) {
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

        const tree = new THREE.Group();
        tree.add(trunk);
        tree.add(foliage);
        tree.position.set(
            Math.random() * 40 - 20,
            2.5,
            Math.random() * 40 - 20
        );
        tree.userData.type = 'tree';
        scene.add(tree);
        interactableObjects.push(tree);
    }

    for (let i = 0; i < 5; i++) {
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
        const rock = new THREE.Mesh(rockGeometry, rockMaterial);
        rock.position.set(
            Math.random() * 40 - 20,
            0.5,
            Math.random() * 40 - 20
        );
        rock.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
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

            // Also try the normal cancellation
            if (buildingSystem.isBuilding) {
                buildingSystem.cancelBuilding();
            }
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