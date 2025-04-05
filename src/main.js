import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls';
import { Inventory, Item } from './inventory.js';
import { BuildingSystem } from './buildingSystem.js';

const savedAxePosition = localStorage.getItem('axePosition');
const savedAxeRotation = localStorage.getItem('axeRotation');

let axePosition, axeRotation;

if (savedAxePosition) {
    const pos = JSON.parse(savedAxePosition);
    axePosition = new THREE.Vector3(pos[0], pos[1], pos[2]);
} else {
    axePosition = new THREE.Vector3(0.7, -0.5, -1);
}

if (savedAxeRotation) {
    const rot = JSON.parse(savedAxeRotation);
    axeRotation = new THREE.Euler(rot[0], rot[1], rot[2]);
} else {
    axeRotation = new THREE.Euler(Math.PI / 4, -Math.PI / 6, 0);
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

const CHOP_DISTANCE = 3;
const CHOPS_TO_FELL = 5;
const treeHealth = new Map();
let buildingSystem;

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    init();
});

function init() {
    try {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87ceeb);

        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 2, 0);
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

        // Initialize systems
        inventory = new Inventory();
        buildingSystem = new BuildingSystem(scene, camera, inventory);
        setupInteractionControls(); // Add this line to initialize interaction controls

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

    if (controls.isLocked) {
        velocity.x = 0;
        velocity.z = 0;

        direction.z = Number(moveBackward) - Number(moveForward);
        direction.x = Number(moveLeft) - Number(moveRight);
        direction.normalize();

        const speed = 0.1;
        if (moveForward || moveBackward) {
            velocity.z = direction.z * speed;
        }
        if (moveLeft || moveRight) {
            velocity.x = direction.x * speed;
        }

        controls.moveRight(-velocity.x);
        controls.moveForward(-velocity.z);

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

        if (axeMesh && spacePressed) {
            axeMesh.rotation.x = axeRotation.x + Math.sin(Date.now() * 0.01) * 0.5;
        } else if (axeMesh && !editorMode) {
            axeMesh.rotation.copy(axeRotation);
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
        buildingSystem.build();
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
                tryChopTree();
            }
            break;
        case 'KeyB':
            if (!buildingSystem.isBuilding) {
                buildingSystem.showBuildingMenu();
            }
            break;
        case 'Escape':
            if (buildingSystem.isBuilding) {
                buildingSystem.cancelBuilding();
            }
            break;
    }
}

function onKeyUp(event) {
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