import * as THREE from 'three';

export class BuildingSystem {
    constructor(scene, camera, inventory) {
        this.scene = scene;
        this.camera = camera;
        this.inventory = inventory;
        this.isBuilding = false;
        this.currentBlueprint = null;
        this.buildingType = null;
        this.blueprintMaterial = new THREE.MeshStandardMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.5
        });

        // Building costs
        this.costs = {
            'wall': 3,
            'foundation': 4,
            'roof': 2
        };

        // Building meshes
        this.meshes = {
            'wall': new THREE.BoxGeometry(2, 3, 0.2),
            'foundation': new THREE.BoxGeometry(2, 0.2, 2),
            'roof': new THREE.BoxGeometry(2, 0.2, 2)
        };

        // Add key bindings for building selection
        this.keyBindings = {
            '1': 'wall',
            '2': 'foundation',
            '3': 'roof'
        };
    }

    showBuildingMenu() {
        const menu = document.createElement('div');
        menu.id = 'building-menu';
        menu.style.position = 'fixed';
        menu.style.top = '50%';
        menu.style.left = '50%';
        menu.style.transform = 'translate(-50%, -50%)';
        menu.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        menu.style.padding = '20px';
        menu.style.borderRadius = '5px';
        menu.style.color = 'white';
        menu.style.pointerEvents = 'none'; // Prevent mouse interaction

        const options = ['wall', 'foundation', 'roof'];
        options.forEach((type, index) => {
            const option = document.createElement('div');
            option.textContent = `${index + 1}: ${type.charAt(0).toUpperCase() + type.slice(1)}`;
            option.style.margin = '10px';
            option.style.padding = '10px';
            menu.appendChild(option);
        });

        document.body.appendChild(menu);

        // Add temporary key listener
        this.keyListener = (event) => {
            const type = this.keyBindings[event.key];
            if (type) {
                this.startBuilding(type);
            }
        };
        document.addEventListener('keydown', this.keyListener);
    }

    hideBuildingMenu() {
        const menu = document.getElementById('building-menu');
        if (menu) {
            menu.remove();
        }
        // Remove temporary key listener
        if (this.keyListener) {
            document.removeEventListener('keydown', this.keyListener);
            this.keyListener = null;
        }
    }

    startBuilding(type) {
        if (this.inventory.getItemCount('log') >= this.costs[type]) {
            this.buildingType = type;
            this.isBuilding = true;
            this.hideBuildingMenu();

            // Create blueprint
            const geometry = this.meshes[type];
            const blueprint = new THREE.Mesh(geometry, this.blueprintMaterial);
            this.currentBlueprint = blueprint;
            this.scene.add(blueprint);
        } else {
            alert(`Need ${this.costs[type]} logs to build ${type}`);
        }
    }

    updateBlueprintPosition(raycaster) {
        if (!this.isBuilding || !this.currentBlueprint) return;

        // Cast ray down to find ground position
        const down = new THREE.Vector3(0, -1, 0);
        raycaster.set(this.camera.position, down);
        const intersects = raycaster.intersectObjects(this.scene.children);

        if (intersects.length > 0) {
            const pos = intersects[0].point;
            this.currentBlueprint.position.set(pos.x, pos.y, pos.z);

            // Adjust position based on building type
            if (this.buildingType === 'wall') {
                this.currentBlueprint.position.y += 1.5; // Half wall height
                // Face the wall perpendicular to camera
                const cameraDir = new THREE.Vector3();
                this.camera.getWorldDirection(cameraDir);
                cameraDir.y = 0;
                cameraDir.normalize();
                this.currentBlueprint.rotation.y = Math.atan2(cameraDir.x, cameraDir.z);
            } else if (this.buildingType === 'roof') {
                this.currentBlueprint.position.y += 3; // Roof height
            }
        }
    }

    build() {
        if (!this.isBuilding || !this.currentBlueprint) return;

        // Create final building piece
        const geometry = this.meshes[this.buildingType];
        const material = new THREE.MeshStandardMaterial({
            color: 0x8B4513,
            roughness: 0.8,
            metalness: 0.1
        });
        const buildingPiece = new THREE.Mesh(geometry, material);

        // Copy position and rotation from blueprint
        buildingPiece.position.copy(this.currentBlueprint.position);
        buildingPiece.rotation.copy(this.currentBlueprint.rotation);

        // Add to scene
        this.scene.add(buildingPiece);

        // Remove blueprint
        this.scene.remove(this.currentBlueprint);
        this.currentBlueprint = null;

        // Remove logs from inventory
        for (let i = 0; i < this.costs[this.buildingType]; i++) {
            this.inventory.removeItem('log');
        }

        this.isBuilding = false;
        this.buildingType = null;
    }

    cancelBuilding() {
        if (this.currentBlueprint) {
            this.scene.remove(this.currentBlueprint);
            this.currentBlueprint = null;
        }
        this.isBuilding = false;
        this.buildingType = null;
    }
}