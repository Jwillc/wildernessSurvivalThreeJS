import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

class CraftingSystem {
    constructor(scene, camera, inventory, buildingSystem) {
        this.scene = scene;
        this.camera = camera;
        this.inventory = inventory;
        this.buildingSystem = buildingSystem;

        this.isCrafting = false;
        this.selectedItem = null;
        this.currentBlueprint = null;
        this.modelsLoaded = false;
        this.modelLoadingPromises = [];

        // Blueprint material (semi-transparent blue)
        this.blueprintMaterial = new THREE.MeshStandardMaterial({
            color: 0x0088ff,
            transparent: true,
            opacity: 0.6,
            roughness: 0.3,
            metalness: 0.2
        });

        // Define craftable items
        this.craftableItems = [
            {
                name: 'Bonfire',
                modelPath: 'assets/models/bonfire.glb',
                requirements: {
                    log: 4,
                    rock: 4
                },
                // Scale options:
                // 0.5 = Small bonfire
                // 1.0 = Medium bonfire
                // 1.5 = Large bonfire
                // 2.0 = Extra large bonfire
                scale: 3.5, // Scale factor for the model (larger value = bigger bonfire)
                model: null
            },
            {
                name: 'Bow',
                modelPath: 'assets/models/bow.glb',
                requirements: {
                    string: 5,
                    stick: 1
                },
                scale: 0.5,
                model: null,
                isEquipment: true // Flag to indicate this is equipment, not a placeable item
            },
            {
                name: 'Arrow',
                modelPath: 'assets/models/arrow.glb',
                requirements: {}, // No requirements for now - arrows are free to craft
                scale: 0.5,
                model: null,
                isEquipment: true // Flag to indicate this is equipment, not a placeable item
            }
        ];

        // Load models
        this.loadModels();

        // Setup UI
        this.setupUI();
    }

    loadModels(retryCount = 0) {
        const loader = new GLTFLoader();
        const maxRetries = 3;

        // Clear previous promises if retrying
        if (retryCount > 0) {
            this.modelLoadingPromises = [];
            console.log(`Retrying model loading (attempt ${retryCount} of ${maxRetries})`);
        }

        // Create a promise for each model to load
        this.craftableItems.forEach(item => {
            const promise = new Promise((resolve, reject) => {
                loader.load(item.modelPath,
                    // onLoad callback
                    (gltf) => {
                        item.model = gltf.scene;

                        // Make the model cast shadows
                        item.model.traverse(function(node) {
                            if (node.isMesh) {
                                node.castShadow = true;
                                node.receiveShadow = true;
                            }
                        });

                        // Set appropriate scale for the model if specified
                        if (item.scale) {
                            item.model.scale.set(item.scale, item.scale, item.scale);
                            console.log(`Set ${item.name} scale to ${item.scale}`);
                        }

                        console.log(`Loaded model for ${item.name}`);
                        resolve(item);
                    },
                    // onProgress callback
                    (xhr) => {
                        if (xhr.total > 0) {
                            const percent = Math.round(xhr.loaded / xhr.total * 100);
                            console.log(`${item.name} model: ${percent}% loaded`);
                        }
                    },
                    // onError callback
                    (error) => {
                        console.error(`Error loading model for ${item.name}:`, error);
                        reject(error);
                    }
                );
            });

            this.modelLoadingPromises.push(promise);
        });

        // When all models are loaded, update the UI
        Promise.all(this.modelLoadingPromises)
            .then(() => {
                this.modelsLoaded = true;
                console.log('All crafting models loaded successfully');
                this.updateItemAvailability();
            })
            .catch(error => {
                console.error('Error loading crafting models:', error);

                // Retry loading if we haven't exceeded max retries
                if (retryCount < maxRetries) {
                    console.log(`Model loading failed, retrying (${retryCount + 1}/${maxRetries})`);
                    setTimeout(() => {
                        this.loadModels(retryCount + 1);
                    }, 1000); // Wait 1 second before retrying
                } else {
                    console.error('Max retries exceeded, could not load models');
                    alert('Failed to load crafting models after multiple attempts. Please refresh the page.');
                }
            });
    }

    setupUI() {
        const craftingItemsContainer = document.getElementById('crafting-items');

        // Clear existing items
        craftingItemsContainer.innerHTML = '';

        // Add each craftable item to the menu
        this.craftableItems.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.className = 'crafting-item';
            itemElement.dataset.name = item.name;

            const nameElement = document.createElement('div');
            nameElement.className = 'crafting-item-name';
            nameElement.textContent = item.name;

            const requirementsElement = document.createElement('div');
            requirementsElement.className = 'crafting-item-requirements';

            const reqText = Object.entries(item.requirements)
                .map(([resource, amount]) => `${resource}: ${amount}`)
                .join(', ');

            requirementsElement.textContent = `Requires: ${reqText}`;

            itemElement.appendChild(nameElement);
            itemElement.appendChild(requirementsElement);

            // Add click event
            itemElement.addEventListener('click', () => {
                this.selectItem(item.name);
            });

            craftingItemsContainer.appendChild(itemElement);
        });
    }

    toggleMenu() {
        const menu = document.getElementById('crafting-menu');

        if (menu.style.display === 'block') {
            // If we're already in crafting mode, don't clear the selection
            this.closeMenu(this.isCrafting);
        } else {
            // If we're in crafting mode, cancel it first
            if (this.isCrafting) {
                this.cancelPlacement();
            }
            this.openMenu();
        }
    }

    openMenu() {
        // Close building menu if open
        if (this.buildingSystem.isBuilding) {
            this.buildingSystem.cancelBuilding();
        }

        const menu = document.getElementById('crafting-menu');
        menu.style.display = 'block';

        // Update item availability based on inventory and model loading status
        this.updateItemAvailability();

        // If models are still loading, show a message
        if (!this.modelsLoaded) {
            console.log('Models are still loading, showing loading status in menu');
        }

        // Unlock pointer if locked
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
    }

    closeMenu(keepSelection = false) {
        const menu = document.getElementById('crafting-menu');
        menu.style.display = 'none';

        // Only clear selection if not starting placement
        if (!keepSelection) {
            console.log('Clearing selectedItem in closeMenu');
            this.selectedItem = null;

            // Update UI
            const items = document.querySelectorAll('.crafting-item');
            items.forEach(item => {
                item.classList.remove('crafting-item-selected');
            });
        } else {
            console.log('Keeping selectedItem in closeMenu:', this.selectedItem);
        }
    }

    craftEquipmentItem(item) {
        console.log(`Crafting equipment item: ${item.name}`);

        try {
            // Check if we have the required resources
            if (!this.canCraft(item)) {
                console.log(`Cannot craft ${item.name} - missing resources`);
                return;
            }

            // Consume resources
            for (const [resource, amount] of Object.entries(item.requirements)) {
                // Remove the required amount at once
                this.inventory.removeItem(resource, amount);
            }

            // Add to inventory
            const itemType = item.name.toLowerCase();

            // If crafting arrows, add 20 at a time
            if (itemType === 'arrow') {
                this.inventory.addItem(itemType, 20);
                console.log(`Added 20 ${item.name}s to inventory`);
            } else {
                this.inventory.addItem(itemType);
                console.log(`Added ${item.name} to inventory`);
            }

            // Close the crafting menu
            this.closeMenu();

            // Automatically equip bow when crafted
            if (itemType === 'bow' && window.equipWeapon) {
                window.equipWeapon('bow');
            }

            console.log(`Successfully crafted ${item.name}`);
        } catch (error) {
            console.error(`Error crafting ${item.name}:`, error);
        }
    }

    updateItemAvailability() {
        const items = document.querySelectorAll('.crafting-item');

        items.forEach(itemElement => {
            const itemName = itemElement.dataset.name;
            const item = this.craftableItems.find(i => i.name === itemName);

            // Check if models are loaded
            if (!this.modelsLoaded) {
                itemElement.style.opacity = '0.7';
                itemElement.style.cursor = 'wait';
                itemElement.querySelector('.crafting-item-requirements').textContent = 'Loading model...';
                return;
            }

            // Reset requirements text if it was showing loading
            if (itemElement.querySelector('.crafting-item-requirements').textContent === 'Loading model...') {
                const reqText = Object.entries(item.requirements)
                    .map(([resource, amount]) => `${resource}: ${amount}`)
                    .join(', ');
                itemElement.querySelector('.crafting-item-requirements').textContent = `Requires: ${reqText}`;
            }

            // Check if player has required resources
            if (this.canCraft(item)) {
                itemElement.style.opacity = '1';
                itemElement.style.cursor = 'pointer';
            } else {
                itemElement.style.opacity = '0.5';
                itemElement.style.cursor = 'not-allowed';
            }
        });
    }

    canCraft(item) {
        // First check if models are loaded
        if (!this.modelsLoaded) {
            return false;
        }

        // Check if player has required resources
        for (const [resource, amount] of Object.entries(item.requirements)) {
            if (this.inventory.getItemCount(resource) < amount) {
                return false;
            }
        }
        return true;
    }

    // Method to manually reload models if needed
    reloadModels() {
        console.log('Manually reloading crafting models');
        this.modelsLoaded = false;
        this.loadModels(0);
        this.updateItemAvailability();
        return 'Reloading models... Check console for progress.';
    }

    selectItem(itemName) {
        console.log(`Attempting to select item: ${itemName}`);

        // Check if models are loaded
        if (!this.modelsLoaded) {
            console.log(`Cannot craft ${itemName} - models still loading`);
            alert('Please wait for models to finish loading');
            return;
        }

        const item = this.craftableItems.find(i => i.name === itemName);
        console.log('Found item:', item);

        if (!item) {
            console.error(`Item ${itemName} not found in craftable items`);
            return;
        }

        // Check if model is available
        if (!item.model) {
            console.error(`Model for ${itemName} is not loaded properly`);
            alert(`Error: Model for ${itemName} failed to load. Please try refreshing the page.`);
            return;
        }

        console.log(`Model for ${itemName} is loaded:`, item.model);

        if (!this.canCraft(item)) {
            console.log(`Cannot craft ${itemName} - missing resources`);
            return;
        }

        // Update UI
        const items = document.querySelectorAll('.crafting-item');
        items.forEach(itemElement => {
            if (itemElement.dataset.name === itemName) {
                itemElement.classList.add('crafting-item-selected');
            } else {
                itemElement.classList.remove('crafting-item-selected');
            }
        });

        console.log(`Setting selectedItem to:`, item);
        this.selectedItem = item;

        // For equipment items (bow, arrow), craft immediately
        if (item.isEquipment) {
            console.log(`${item.name} is equipment, crafting immediately`);
            this.craftEquipmentItem(item); // Use special method for equipment
            return;
        }

        // For placeable items, continue with normal placement
        // Close menu but keep the selection
        this.closeMenu(true);
        this.startPlacement();
    }

    startPlacement() {
        console.log('Starting placement with selectedItem:', this.selectedItem);

        if (!this.selectedItem) {
            console.error('No item selected for placement');
            return;
        }

        if (!this.selectedItem.model) {
            console.error(`Model for ${this.selectedItem.name} is not loaded properly`, this.selectedItem);
            alert(`Error: Model for ${this.selectedItem.name} failed to load. Please try refreshing the page.`);
            return;
        }

        console.log(`Using model:`, this.selectedItem.model);
        this.isCrafting = true;

        // For equipment items (bow, arrow), skip blueprint and just craft immediately
        if (this.selectedItem.isEquipment) {
            console.log(`${this.selectedItem.name} is equipment, crafting immediately`);
            // Show crafting instructions
            const promptElement = document.getElementById('interaction-prompt');
            promptElement.textContent = 'Press E to craft, Escape to cancel';
            promptElement.style.display = 'block';
            return;
        }

        try {
            // Create blueprint for placeable items
            const blueprint = this.selectedItem.model.clone();
            console.log('Created blueprint:', blueprint);

            // Ensure the blueprint has the correct scale
            if (this.selectedItem.scale) {
                blueprint.scale.set(
                    this.selectedItem.scale,
                    this.selectedItem.scale,
                    this.selectedItem.scale
                );
                console.log(`Set blueprint scale to ${this.selectedItem.scale}`);
            }

            // Apply blueprint material to all meshes
            blueprint.traverse(node => {
                if (node.isMesh) {
                    node.material = this.blueprintMaterial.clone();
                }
            });

            this.currentBlueprint = blueprint;
            this.scene.add(blueprint);
            console.log('Added blueprint to scene');

            // Show placement instructions
            const promptElement = document.getElementById('interaction-prompt');
            promptElement.textContent = 'Press E to place, Escape to cancel';
            promptElement.style.display = 'block';
        } catch (error) {
            console.error('Error creating blueprint:', error);
            alert(`Error creating blueprint: ${error.message}. Please try again.`);
            this.isCrafting = false;
        }
    }

    updateBlueprintPosition(raycaster) {
        if (!this.isCrafting || !this.currentBlueprint) return;

        // Cast ray to find ground position
        raycaster.setFromCamera(new THREE.Vector2(), this.camera);

        const intersects = raycaster.intersectObjects(this.scene.children, true);

        for (let i = 0; i < intersects.length; i++) {
            const object = intersects[i].object;

            // Skip the blueprint itself and other non-ground objects
            if (this.currentBlueprint.getObjectById(object.id)) continue;
            if (object.userData.type === 'tree' || object.userData.type === 'rock' || object.userData.type === 'logs') continue;

            // Position the blueprint at the intersection point
            this.currentBlueprint.position.copy(intersects[i].point);

            // Rotate blueprint to face player (Y-axis only)
            const direction = new THREE.Vector3();
            direction.subVectors(this.camera.position, this.currentBlueprint.position);
            direction.y = 0; // Keep rotation only around Y axis

            if (direction.length() > 0) {
                this.currentBlueprint.lookAt(this.camera.position.x, this.currentBlueprint.position.y, this.camera.position.z);
            }

            break;
        }
    }

    place() {
        console.log('Attempting to place item');

        if (!this.isCrafting) {
            console.error('Not in crafting mode');
            return;
        }

        if (!this.selectedItem) {
            console.error('No item selected');
            return;
        }

        try {
            // Consume resources
            for (const [resource, amount] of Object.entries(this.selectedItem.requirements)) {
                // Remove the required amount at once
                this.inventory.removeItem(resource, amount);
            }

            // Check if this is equipment (bow or arrow)
            if (this.selectedItem.isEquipment) {
                // Add to inventory instead of placing in the world
                const itemType = this.selectedItem.name.toLowerCase();

                // If crafting arrows, add 20 at a time
                if (itemType === 'arrow') {
                    this.inventory.addItem(itemType, 20);
                    console.log(`Added 20 ${this.selectedItem.name}s to inventory`);
                } else {
                    this.inventory.addItem(itemType);
                    console.log(`Added ${this.selectedItem.name} to inventory`);
                }

                // Clean up blueprint if it exists
                if (this.currentBlueprint) {
                    this.scene.remove(this.currentBlueprint);
                    this.currentBlueprint = null;
                }

                this.isCrafting = false;
                const craftedItem = this.selectedItem.name.toLowerCase();
                this.selectedItem = null;

                // Hide prompt
                const promptElement = document.getElementById('interaction-prompt');
                promptElement.style.display = 'none';

                // Automatically equip bow when crafted
                if (craftedItem === 'bow' && window.equipWeapon) {
                    window.equipWeapon('bow');
                }

                return;
            }

            // For placeable items, continue with normal placement
            if (!this.currentBlueprint) {
                console.error('No blueprint to place');
                return;
            }

            // Create permanent object
            const placedObject = this.selectedItem.model.clone();
            placedObject.position.copy(this.currentBlueprint.position);
            placedObject.rotation.copy(this.currentBlueprint.rotation);

            // Ensure the scale is set correctly (in case it wasn't preserved in the clone)
            if (this.selectedItem.scale) {
                placedObject.scale.set(
                    this.selectedItem.scale,
                    this.selectedItem.scale,
                    this.selectedItem.scale
                );
                console.log(`Ensured placed ${this.selectedItem.name} has scale ${this.selectedItem.scale}`);
            }

            // Set user data for interaction
            placedObject.userData.type = this.selectedItem.name.toLowerCase();

            // Add additional properties for bonfire
            if (placedObject.userData.type === 'bonfire') {
                placedObject.userData.isLit = false; // Start as unlit
                placedObject.userData.fireParticles = null; // Will hold fire particles when lit
                console.log('Created unlit bonfire');
            }

            // Add to scene
            this.scene.add(placedObject);
            console.log('Added permanent object to scene');

            // Add to interactable objects if it's a bonfire
            if (placedObject.userData.type === 'bonfire') {
                if (window.interactableObjects) {
                    window.interactableObjects.push(placedObject);
                    console.log('Added bonfire to interactable objects');
                }
            }

            // Clean up blueprint
            this.scene.remove(this.currentBlueprint);
            this.currentBlueprint = null;
            this.isCrafting = false;
            this.selectedItem = null;

            // Hide prompt
            const promptElement = document.getElementById('interaction-prompt');
            promptElement.style.display = 'none';

            console.log(`Successfully placed ${placedObject.userData.type}`);
        } catch (error) {
            console.error('Error placing item:', error);
            alert(`Error placing item: ${error.message}. Please try again.`);
            // Don't clear crafting state so they can try again
        }
    }

    cancelPlacement() {
        console.log('Cancelling placement');
        if (!this.isCrafting) {
            console.log('Not in crafting mode, nothing to cancel');
            return;
        }

        // Remove blueprint
        if (this.currentBlueprint) {
            console.log('Removing blueprint from scene');
            this.scene.remove(this.currentBlueprint);
            this.currentBlueprint = null;
        } else {
            console.log('No blueprint to remove');
        }

        console.log('Resetting crafting state');
        this.isCrafting = false;
        this.selectedItem = null;

        // Hide prompt
        const promptElement = document.getElementById('interaction-prompt');
        promptElement.style.display = 'none';
    }
}

export { CraftingSystem };
