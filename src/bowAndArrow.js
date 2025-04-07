import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class BowAndArrowSystem {
    constructor(scene, camera, inventory) {
        this.scene = scene;
        this.camera = camera;
        this.inventory = inventory;

        // Models
        this.bowModel = null;
        this.arrowModel = null;

        // First-person view elements
        this.bowMesh = null;
        this.isBowEquipped = false;

        // Load saved bow position, rotation, and scale from localStorage if available
        this.loadSavedBowSettings();

        // Arrow shooting
        this.arrows = [];
        this.arrowSpeed = 10.0; // Increased speed for better collision detection and more realistic flight
        this.lastShootTime = 0;
        this.shootCooldown = 500; // ms between shots

        // Current arrow on bow
        this.currentArrow = null;
        this.isArrowNocked = false;

        // Arrow position, rotation, and scale - using the provided values
        this.arrowOffsetX = -0.510; // Left/right offset
        this.arrowOffsetY = 0.030;  // Up/down offset
        this.arrowOffsetZ = 0.110;  // Forward/backward offset
        this.arrowRotationX = 1.571; // X rotation (approximately PI/2)
        this.arrowRotationY = 0.000; // Y rotation
        this.arrowRotationZ = 1.457; // Z rotation
        this.arrowScale = 1.400;    // Scale for the nocked arrow

        // Load saved arrow settings
        this.loadSavedArrowSettings();

        // Arrow shooting orientation - this will be used to determine the direction of shot arrows
        // Using the provided values: X: -1.450, Y: 0.010, Z: 0.000
        this.shootingOrientation = new THREE.Euler(-1.450, 0.010, 0.000);

        // Save these values to localStorage
        localStorage.setItem('arrowShootingOrientation', JSON.stringify([-1.450, 0.010, 0.000]));
        console.log('Set arrow shooting orientation to:', [-1.450, 0.010, 0.000]);

        // Load saved shooting orientation if available (but only if different from our default)
        try {
            const savedShootingOrientation = localStorage.getItem('arrowShootingOrientation');
            if (savedShootingOrientation) {
                const rot = JSON.parse(savedShootingOrientation);
                // Only apply if different from our default values
                if (rot[0] !== -1.450 || rot[1] !== 0.010 || rot[2] !== 0.000) {
                    this.shootingOrientation.set(rot[0], rot[1], rot[2]);
                    console.log('Loaded saved arrow shooting orientation:', rot);
                }
            }
        } catch (error) {
            console.error('Error loading saved arrow shooting orientation:', error);
        }

        // Create a visual helper for the shooting orientation when in editor mode
        this.shootingOrientationHelper = null;

        // Crosshair
        this.crosshair = null;

        // Load models
        this.loadModels();

        // Create crosshair
        this.createCrosshair();
    }

    loadSavedBowSettings() {
        // Default bow position and rotation if not saved - using the provided values
        this.bowPosition = new THREE.Vector3(0.500, -0.150, -0.860);
        this.bowRotation = new THREE.Euler(0.254, 4.611, 0.110);
        this.bowScale = 0.300; // Default scale

        try {
            // Load position if saved
            const savedPosition = localStorage.getItem('bowPosition');
            if (savedPosition) {
                const pos = JSON.parse(savedPosition);
                this.bowPosition = new THREE.Vector3(pos[0], pos[1], pos[2]);
                console.log('Loaded saved bow position:', this.bowPosition);
            }

            // Load rotation if saved
            const savedRotation = localStorage.getItem('bowRotation');
            if (savedRotation) {
                const rot = JSON.parse(savedRotation);
                this.bowRotation = new THREE.Euler(rot[0], rot[1], rot[2]);
                console.log('Loaded saved bow rotation:', this.bowRotation);
            }

            // Load scale if saved
            const savedScale = localStorage.getItem('bowScale');
            if (savedScale) {
                this.bowScale = parseFloat(savedScale);
                console.log('Loaded saved bow scale:', this.bowScale);
            }
        } catch (error) {
            console.error('Error loading saved bow settings:', error);
            // Use defaults if there's an error
        }
    }

    loadSavedArrowSettings() {
        try {
            // Load arrow position if saved
            const savedPosition = localStorage.getItem('arrowPosition');
            if (savedPosition) {
                const pos = JSON.parse(savedPosition);
                this.arrowOffsetX = pos[0];
                this.arrowOffsetY = pos[1];
                this.arrowOffsetZ = pos[2];
                console.log('Loaded saved arrow position:', pos);
            }

            // Load arrow rotation if saved
            const savedRotation = localStorage.getItem('arrowRotation');
            if (savedRotation) {
                const rot = JSON.parse(savedRotation);
                this.arrowRotationX = rot[0];
                this.arrowRotationY = rot[1];
                this.arrowRotationZ = rot[2];
                console.log('Loaded saved arrow rotation:', rot);
            }

            // Load arrow scale if saved
            const savedScale = localStorage.getItem('arrowScale');
            if (savedScale) {
                this.arrowScale = parseFloat(savedScale);
                console.log('Loaded saved arrow scale:', this.arrowScale);
            }
        } catch (error) {
            console.error('Error loading saved arrow settings:', error);
            // Use defaults if there's an error
        }
    }

    loadModels() {
        console.log('Starting to load bow and arrow models...');
        const loader = new GLTFLoader();

        // Load bow model
        console.log('Loading bow model from assets/models/bow.glb...');
        loader.load('assets/models/bow.glb',
            // onLoad callback
            (gltf) => {
                console.log('Bow model loaded, processing...');
                this.bowModel = gltf.scene;

                // Make the model cast shadows
                this.bowModel.traverse((node) => {
                    if (node.isMesh) {
                        node.castShadow = true;
                        node.receiveShadow = true;
                        console.log('Processed bow mesh:', node.name);
                    }
                });

                console.log('Bow model loaded successfully and ready to use');

                // If the bow is already supposed to be equipped, try again
                if (this.isBowEquipped && !this.bowMesh) {
                    console.log('Bow was supposed to be equipped, trying again...');
                    this.equipBow();
                }
            },
            // onProgress callback
            (xhr) => {
                console.log('Bow model loading progress:', (xhr.loaded / xhr.total * 100) + '% loaded');
            },
            // onError callback
            (error) => {
                console.error('Error loading bow model:', error);
            }
        );

        // Load arrow model
        console.log('Loading arrow model from assets/models/arrow.glb...');
        loader.load('assets/models/arrow.glb',
            // onLoad callback
            (gltf) => {
                console.log('Arrow model loaded, processing...');
                this.arrowModel = gltf.scene;

                // Make the model cast shadows
                this.arrowModel.traverse((node) => {
                    if (node.isMesh) {
                        node.castShadow = true;
                        node.receiveShadow = true;
                        console.log('Processed arrow mesh:', node.name);
                    }
                });

                console.log('Arrow model loaded successfully and ready to use');
            },
            // onProgress callback
            (xhr) => {
                console.log('Arrow model loading progress:', (xhr.loaded / xhr.total * 100) + '% loaded');
            },
            // onError callback
            (error) => {
                console.error('Error loading arrow model:', error);
            }
        );
    }

    createCrosshair() {
        // Create crosshair element
        this.crosshair = document.createElement('div');
        this.crosshair.id = 'crosshair';
        this.crosshair.style.position = 'fixed';
        this.crosshair.style.top = '50%';
        this.crosshair.style.left = '50%';
        this.crosshair.style.transform = 'translate(-50%, -50%)';
        this.crosshair.style.width = '20px';
        this.crosshair.style.height = '20px';
        this.crosshair.style.borderRadius = '50%';
        this.crosshair.style.border = '2px solid white';
        this.crosshair.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
        this.crosshair.style.zIndex = '100';
        this.crosshair.style.display = 'none'; // Hidden by default

        document.body.appendChild(this.crosshair);
    }

    createFallbackBowModel() {
        console.log('Creating fallback bow model');

        // Create a simple bow shape using basic geometries
        const bowGroup = new THREE.Group();

        // Create the bow arc
        const arcGeometry = new THREE.TorusGeometry(0.3, 0.03, 16, 32, Math.PI);
        const arcMaterial = new THREE.MeshStandardMaterial({
            color: 0x8B4513,
            roughness: 0.7,
            metalness: 0.1
        }); // Wood-like material
        const arc = new THREE.Mesh(arcGeometry, arcMaterial);

        // Create the bowstring
        const stringGeometry = new THREE.CylinderGeometry(0.005, 0.005, 0.6, 8);
        const stringMaterial = new THREE.MeshStandardMaterial({
            color: 0xFFFFFF,
            roughness: 0.5,
            metalness: 0.1
        }); // String-like material
        const string = new THREE.Mesh(stringGeometry, stringMaterial);

        // Position the parts
        arc.rotation.z = Math.PI / 2;
        string.position.x = 0.3;

        // Add parts to the group
        bowGroup.add(arc);
        bowGroup.add(string);

        return bowGroup;
    }

    equipBow() {
        if (this.isBowEquipped) return;

        console.log('Attempting to equip bow...');

        // Create bow mesh for first-person view
        if (!this.bowModel) {
            console.warn('Bow model not loaded, creating fallback model');
            this.bowMesh = this.createFallbackBowModel();
        } else {
            console.log('Using loaded bow model');
            this.bowMesh = this.bowModel.clone();

            // Keep original materials
        }

        console.log('Bow mesh created');

        // Apply saved or default scale
        const scale = this.bowScale || 10.0;
        this.bowMesh.scale.set(scale, scale, scale);
        console.log('Applied bow scale:', scale);

        console.log('Setting bow position and rotation...');

        // Position the bow in first-person view using saved/default values
        this.bowMesh.position.copy(this.bowPosition);

        // Apply saved/default rotation
        this.bowMesh.rotation.copy(this.bowRotation);

        console.log('Adding bow to camera...');

        // Add to camera
        this.camera.add(this.bowMesh);

        // Show crosshair
        this.crosshair.style.display = 'block';

        this.isBowEquipped = true;
        console.log('Bow equipped successfully');

        // Automatically nock an arrow if player has arrows
        this.nockArrow();

        // Debug - log the bow's world position
        const worldPos = new THREE.Vector3();
        this.bowMesh.getWorldPosition(worldPos);
        console.log('Bow world position:', worldPos);
    }

    unequipBow() {
        if (!this.isBowEquipped || !this.bowMesh) return;

        // Remove current arrow if nocked
        this.removeNockedArrow();

        // Remove bow from camera
        this.camera.remove(this.bowMesh);
        this.bowMesh = null;

        // Hide crosshair
        this.crosshair.style.display = 'none';

        this.isBowEquipped = false;
        console.log('Bow unequipped');
    }

    nockArrow() {
        // Check if player has arrows
        if (!this.inventory.hasItems(['arrow'])) {
            console.log('No arrows in inventory to nock');
            return false;
        }

        // Check if bow is equipped
        if (!this.isBowEquipped || !this.bowMesh) {
            console.log('Cannot nock arrow - bow is not equipped');
            return false;
        }

        // Remove any existing nocked arrow
        this.removeNockedArrow();

        // Create arrow mesh
        if (!this.arrowModel) {
            console.log('Using fallback arrow model');
            this.currentArrow = this.createFallbackArrowModel();
        } else {
            console.log('Using loaded arrow model');
            this.currentArrow = this.arrowModel.clone();
        }

        // Scale the arrow using saved or default scale
        this.currentArrow.scale.set(this.arrowScale, this.arrowScale, this.arrowScale);

        // Position the arrow on the bow using saved or default offsets
        this.currentArrow.position.set(this.arrowOffsetX, this.arrowOffsetY, this.arrowOffsetZ);

        // Rotate the arrow using saved or default rotation
        this.currentArrow.rotation.set(0, 0, 0); // Reset rotation
        this.currentArrow.rotateX(this.arrowRotationX);
        this.currentArrow.rotateY(this.arrowRotationY);
        this.currentArrow.rotateZ(this.arrowRotationZ);

        // Debug log the nocked arrow rotation
        console.log('Nocked arrow rotation after setting:',
            'X:', this.currentArrow.rotation.x,
            'Y:', this.currentArrow.rotation.y,
            'Z:', this.currentArrow.rotation.z);

        // Add the arrow to the bow
        this.bowMesh.add(this.currentArrow);

        this.isArrowNocked = true;
        console.log('Arrow nocked on bow');
        return true;
    }

    removeNockedArrow() {
        if (this.currentArrow && this.bowMesh) {
            this.bowMesh.remove(this.currentArrow);
            this.currentArrow = null;
            this.isArrowNocked = false;
            console.log('Removed nocked arrow');
        }
    }

    createFallbackArrowModel() {
        console.log('Creating fallback arrow model');

        // Create a simple arrow shape using basic geometries
        const arrowGroup = new THREE.Group();

        // Create the arrow shaft
        const shaftGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.8, 8);
        const shaftMaterial = new THREE.MeshStandardMaterial({
            color: 0x8B4513,
            roughness: 0.7,
            metalness: 0.1
        }); // Wood-like material
        const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);

        // Create the arrow head
        const headGeometry = new THREE.ConeGeometry(0.05, 0.2, 8);
        const headMaterial = new THREE.MeshStandardMaterial({
            color: 0x808080,
            roughness: 0.3,
            metalness: 0.8
        }); // Metal-like material
        const head = new THREE.Mesh(headGeometry, headMaterial);

        // Create the arrow fletching
        const fletchingGeometry = new THREE.BoxGeometry(0.1, 0.05, 0.01);
        const fletchingMaterial = new THREE.MeshStandardMaterial({
            color: 0xFF0000,
            roughness: 0.9,
            metalness: 0.0
        }); // Feather-like material
        const fletching1 = new THREE.Mesh(fletchingGeometry, fletchingMaterial);
        const fletching2 = new THREE.Mesh(fletchingGeometry, fletchingMaterial);

        // Position the parts
        shaft.rotation.x = Math.PI / 2;
        head.rotation.x = Math.PI / 2;
        head.position.z = 0.5; // At the front of the shaft
        fletching1.position.z = -0.35; // At the back of the shaft
        fletching1.rotation.y = Math.PI / 4;
        fletching2.position.z = -0.35; // At the back of the shaft
        fletching2.rotation.y = -Math.PI / 4;

        // Add parts to the group
        arrowGroup.add(shaft);
        arrowGroup.add(head);
        arrowGroup.add(fletching1);
        arrowGroup.add(fletching2);

        return arrowGroup;
    }

    shootArrow() {
        console.log('Attempting to shoot arrow...');

        if (!this.isBowEquipped) {
            console.log('Cannot shoot - bow is not equipped');
            return;
        }

        // Check if an arrow is nocked
        if (!this.isArrowNocked) {
            // Try to nock an arrow
            if (!this.nockArrow()) {
                console.log('No arrow nocked and cannot nock a new one');
                return;
            }
        }

        // Check cooldown
        const now = Date.now();
        if (now - this.lastShootTime < this.shootCooldown) {
            console.log('Cooldown active, cannot shoot yet');
            return;
        }
        this.lastShootTime = now;

        // Consume an arrow from inventory
        this.inventory.removeItem('arrow', 1);

        console.log('Shooting arrow');

        try {
            // Get the world position and rotation of the nocked arrow
            const arrowWorldPos = new THREE.Vector3();
            const arrowWorldQuat = new THREE.Quaternion();

            // Get the world position and rotation of the nocked arrow
            this.currentArrow.getWorldPosition(arrowWorldPos);
            this.currentArrow.getWorldQuaternion(arrowWorldQuat);

            // Create a new arrow for shooting (we'll keep the nocked one for visual purposes)
            let arrow;
            if (!this.arrowModel) {
                console.warn('Arrow model not loaded, creating fallback model');
                arrow = this.createFallbackArrowModel();
            } else {
                console.log('Using loaded arrow model');
                arrow = this.arrowModel.clone();
            }

            // Use the same scale as the nocked arrow
            arrow.scale.set(this.arrowScale, this.arrowScale, this.arrowScale);

            // Get the camera's world position
            const cameraWorldPos = new THREE.Vector3();
            this.camera.getWorldPosition(cameraWorldPos);

            // Position the arrow at the camera position
            arrow.position.copy(cameraWorldPos);

            // Get the camera's forward direction for shooting
            const arrowForward = new THREE.Vector3(0, 0, -1);
            arrowForward.applyQuaternion(this.camera.quaternion);
            arrowForward.normalize();

            // Move the arrow slightly forward in the shooting direction to avoid collisions
            const offsetDistance = 0.5; // Distance to move forward
            const forwardOffset = arrowForward.clone().multiplyScalar(offsetDistance);
            arrow.position.add(forwardOffset);

            console.log('Camera local position:', this.camera.position.x, this.camera.position.y, this.camera.position.z);
            console.log('Camera world position:', cameraWorldPos.x, cameraWorldPos.y, cameraWorldPos.z);
            console.log('Arrow start position:', arrow.position.x, arrow.position.y, arrow.position.z);
            console.log('Arrow forward direction:', arrowForward.x, arrowForward.y, arrowForward.z);

            // Store direction and other properties on the arrow
            arrow.userData.direction = arrowForward;
            arrow.userData.velocity = arrowForward.clone().multiplyScalar(this.arrowSpeed);
            arrow.userData.isArrow = true;
            arrow.userData.creationTime = Date.now();
            arrow.userData.lifetime = 10000; // 10 seconds lifetime
            arrow.userData.isStuck = false; // Not stuck to anything yet
            arrow.userData.stuckTo = null; // What the arrow is stuck to (ground, tree, etc.)
            arrow.userData.stuckToObject = null; // Reference to the object the arrow is stuck to

            // We need to make the arrow point in the direction it's traveling
            // First, apply the camera's rotation to get the base direction
            const baseQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
            baseQuaternion.multiply(this.camera.quaternion);

            // Then apply our custom shooting orientation
            const shootingQuaternion = new THREE.Quaternion().setFromEuler(this.shootingOrientation);
            baseQuaternion.multiply(shootingQuaternion);

            // Apply the combined rotation to the arrow
            arrow.quaternion.copy(baseQuaternion);

            // Store the final quaternion for reference
            arrow.userData.originalRotation = arrow.quaternion.clone();

            console.log('Applied shooting orientation:',
                'X:', this.shootingOrientation.x,
                'Y:', this.shootingOrientation.y,
                'Z:', this.shootingOrientation.z);

            console.log('Arrow alignment applied, forward direction:', arrowForward.x, arrowForward.y, arrowForward.z);

            // Debug log the rotation
            console.log('Nocked arrow rotation:',
                'X:', this.currentArrow ? this.currentArrow.rotation.x : 'N/A',
                'Y:', this.currentArrow ? this.currentArrow.rotation.y : 'N/A',
                'Z:', this.currentArrow ? this.currentArrow.rotation.z : 'N/A');
            console.log('Shot arrow rotation:',
                'X:', arrow.rotation.x,
                'Y:', arrow.rotation.y,
                'Z:', arrow.rotation.z);

            // Add to scene
            this.scene.add(arrow);
            this.arrows.push(arrow);

            // Remove the nocked arrow and nock a new one if available
            this.removeNockedArrow();
            this.nockArrow();

            console.log('Arrow successfully shot, current arrows in flight:', this.arrows.length);
        } catch (error) {
            console.error('Error shooting arrow:', error);
        }
    }

    // Create a visual helper for the shooting orientation
    createShootingOrientationHelper() {
        if (this.shootingOrientationHelper) {
            // Remove existing helper if it exists
            this.camera.remove(this.shootingOrientationHelper);
        }

        // Create a new helper
        this.shootingOrientationHelper = new THREE.Group();

        // Create an arrow to represent the shooting direction
        const arrowLength = 0.5;
        const arrowHeadLength = 0.1;
        const arrowHeadWidth = 0.05;

        // Arrow shaft
        const shaftGeometry = new THREE.CylinderGeometry(0.01, 0.01, arrowLength, 8);
        const shaftMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
        shaft.position.z = -arrowLength / 2;
        shaft.rotation.x = Math.PI / 2;

        // Arrow head
        const headGeometry = new THREE.ConeGeometry(arrowHeadWidth, arrowHeadLength, 8);
        const headMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.z = -(arrowLength + arrowHeadLength / 2);
        head.rotation.x = Math.PI / 2;

        // Add parts to the helper
        this.shootingOrientationHelper.add(shaft);
        this.shootingOrientationHelper.add(head);

        // Position the helper in front of the camera
        this.shootingOrientationHelper.position.set(0, 0, -1);

        // Apply the current shooting orientation
        this.shootingOrientationHelper.rotation.copy(this.shootingOrientation);

        // Add to camera
        this.camera.add(this.shootingOrientationHelper);

        console.log('Created shooting orientation helper');
        return this.shootingOrientationHelper;
    }

    // Remove the shooting orientation helper
    removeShootingOrientationHelper() {
        if (this.shootingOrientationHelper) {
            this.camera.remove(this.shootingOrientationHelper);
            this.shootingOrientationHelper = null;
            console.log('Removed shooting orientation helper');
        }
    }

    // Update the shooting orientation helper to match the current orientation
    updateShootingOrientationHelper() {
        if (this.shootingOrientationHelper) {
            this.shootingOrientationHelper.rotation.copy(this.shootingOrientation);
        }
    }

    update(deltaTime) {
        // Check if bow is equipped but no arrow is nocked
        if (this.isBowEquipped && !this.isArrowNocked && this.inventory.hasItems(['arrow'])) {
            // Try to nock an arrow
            this.nockArrow();
        }

        // Update arrow positions and check lifetimes
        for (let i = this.arrows.length - 1; i >= 0; i--) {
            const arrow = this.arrows[i];

            // For moving arrows, we need to update position and check collisions
            if (!arrow.userData.isStuck) {
                // Store the current position before moving
                const prevPosition = arrow.position.clone();

                // Move arrow in a perfectly straight line based on its initial direction
                arrow.position.add(arrow.userData.velocity.clone().multiplyScalar(deltaTime * 60));

                // No gravity for perfectly straight flight
                // arrow.userData.velocity.y -= 0.001 * deltaTime * 60;

                // Maintain the original rotation from when the arrow was shot
                if (arrow.userData.originalRotation) {
                    arrow.quaternion.copy(arrow.userData.originalRotation);

                    // Debug log the arrow rotation during flight (only log occasionally to avoid spam)
                    if (Math.random() < 0.01) { // Log approximately 1% of the time
                        console.log('Arrow in flight rotation:',
                            'X:', arrow.rotation.x,
                            'Y:', arrow.rotation.y,
                            'Z:', arrow.rotation.z);
                        console.log('Arrow position:',
                            'X:', arrow.position.x,
                            'Y:', arrow.position.y,
                            'Z:', arrow.position.z);
                        console.log('Arrow velocity:',
                            'X:', arrow.userData.velocity.x,
                            'Y:', arrow.userData.velocity.y,
                            'Z:', arrow.userData.velocity.z);
                    }
                }

                // Check for collisions with ground
                if (arrow.position.y < 0.1) {
                    // Arrow hit the ground, stop it
                    arrow.position.y = 0.1; // Slightly above ground
                    arrow.userData.velocity.set(0, 0, 0);
                    arrow.userData.isStuck = true;
                    arrow.userData.stuckTo = 'ground';

                    // Keep the original rotation when stuck in the ground
                    // This maintains the arrow's orientation from the bow

                    // Mark arrow as hit ground but maintain the original 10-second lifetime
                    if (!arrow.userData.hitGround) {
                        arrow.userData.hitGround = true;
                        // Keep the original 10-second lifetime
                    }
                }

                // Check for collisions with trees
                if (!arrow.userData.isStuck) {
                    // Create a raycaster from the previous position to the current position
                    const direction = arrow.position.clone().sub(prevPosition).normalize();
                    const raycaster = new THREE.Raycaster(prevPosition, direction);
                    const distance = prevPosition.distanceTo(arrow.position);

                    // Get all interactable objects (which include trees)
                    const interactableObjects = window.interactableObjects || [];

                    // Filter to only include trees
                    const trees = interactableObjects.filter(obj => obj.userData.type === 'tree');

                    // Check for intersections
                    const intersects = raycaster.intersectObjects(trees, true);

                    // If we hit a tree and the intersection is within our movement distance
                    if (intersects.length > 0 && intersects[0].distance <= distance) {
                        // Find the tree object - could be the object itself or a parent
                        let tree = null;
                        const hitObject = intersects[0].object;

                        // Check if the object itself is a tree
                        if (hitObject.userData.type === 'tree') {
                            tree = hitObject;
                        }
                        // Check if the parent is a tree
                        else if (hitObject.parent && hitObject.parent.userData.type === 'tree') {
                            tree = hitObject.parent;
                        }
                        // For the loaded model, we might need to go up multiple levels
                        else {
                            // Traverse up the parent chain to find a tree
                            let parent = hitObject.parent;
                            while (parent) {
                                if (parent.userData.type === 'tree') {
                                    tree = parent;
                                    break;
                                }
                                parent = parent.parent;
                            }
                        }

                        if (tree) {
                            // Position the arrow at the exact intersection point
                            arrow.position.copy(intersects[0].point);

                            // Stop the arrow
                            arrow.userData.velocity.set(0, 0, 0);
                            arrow.userData.isStuck = true;
                            arrow.userData.stuckTo = 'tree';
                            arrow.userData.stuckToObject = tree;

                            // Maintain the original 10-second lifetime for arrows stuck in trees
                            // No need to modify the lifetime here

                            console.log('Arrow hit a tree and is now stuck - will be removed after 10 seconds');
                        }
                    }
                }
            }

            // Check lifetime - always remove arrows after their lifetime expires
            // regardless of whether they're stuck in trees or not
            if (Date.now() - arrow.userData.creationTime > arrow.userData.lifetime) {
                // Remove old arrows
                this.scene.remove(arrow);
                this.arrows.splice(i, 1);
                console.log('Arrow removed due to lifetime expiration');
            }
        }
    }



    // Clean up resources
    dispose() {
        // Remove all arrows from scene
        for (const arrow of this.arrows) {
            this.scene.remove(arrow);
        }
        this.arrows = [];

        // Unequip bow
        this.unequipBow();

        // Remove crosshair
        if (this.crosshair && this.crosshair.parentNode) {
            this.crosshair.parentNode.removeChild(this.crosshair);
        }
    }
}
