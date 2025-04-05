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

        // Material for when snapping is active
        this.snapMaterial = new THREE.MeshStandardMaterial({
            color: 0x00aaff,
            transparent: true,
            opacity: 0.5
        });

        // Building costs
        this.costs = {
            'wall': 3,
            'foundation': 4,
            'roof': 2,
            'window': 1
        };

        // Building meshes
        this.meshes = {
            'wall': new THREE.BoxGeometry(2, 3, 0.2),
            'foundation': new THREE.BoxGeometry(2, 0.2, 2),
            'roof': new THREE.BoxGeometry(2, 0.2, 2),
            'window': new THREE.BoxGeometry(0.8, 0.8, 0.1) // Window is a smaller square
        };

        // Add key bindings for building selection
        this.keyBindings = {
            '1': 'wall',
            '2': 'foundation',
            '3': 'roof',
            '4': 'window'
        };

        // Track walls that have windows
        this.wallsWithWindows = new Map();

        // Track all placed building pieces for snapping
        this.placedPieces = [];

        // Wall rotation (0, 90, 180, 270 degrees)
        this.wallRotationIndex = 0;
        this.wallRotations = [0, Math.PI/2, Math.PI, Math.PI*3/2];

        // Snapping settings
        this.snapDistance = 2.5; // Distance at which pieces will snap (increased for better detection)
        this.isSnapping = false; // Whether currently snapping to another piece

        // Debug flag
        this.debug = true;
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

        const options = ['wall', 'foundation', 'roof', 'window'];
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
            const blueprint = new THREE.Mesh(geometry, this.blueprintMaterial.clone());
            this.currentBlueprint = blueprint;
            this.scene.add(blueprint);

            if (this.debug) {
                console.log(`Created blueprint for ${type}. Placed pieces: ${this.placedPieces.length}`);
            }

            // Show building instructions
            this.showBuildingInstructions(type);
        } else {
            alert(`Need ${this.costs[type]} logs to build ${type}`);
        }
    }

    updateBlueprintPosition(raycaster) {
        if (!this.isBuilding || !this.currentBlueprint) return;

        // Get camera direction (forward vector)
        const cameraDir = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDir);

        // Set a distance in front of the player
        const PLACEMENT_DISTANCE = 3;

        // Calculate position in front of the player
        const targetPosition = new THREE.Vector3();
        targetPosition.copy(this.camera.position);
        targetPosition.addScaledVector(cameraDir, PLACEMENT_DISTANCE);

        // Cast ray down from the target position to find ground
        const down = new THREE.Vector3(0, -1, 0);
        raycaster.set(targetPosition, down);
        const intersects = raycaster.intersectObjects(this.scene.children);

        // Default position (on ground)
        let pos;
        if (intersects.length > 0) {
            pos = intersects[0].point.clone();
        } else {
            // Fallback if no ground found
            pos = targetPosition.clone();
            pos.y = 0;
        }

        // Set initial position and rotation
        this.currentBlueprint.position.copy(pos);

        // Adjust position based on building type
        if (this.buildingType === 'wall') {
            this.currentBlueprint.position.y += 1.5; // Half wall height

            // Apply the current wall rotation
            if (this.wallRotationIndex === 0 || this.wallRotationIndex === 2) {
                // Default rotation (perpendicular to camera) for 0 and 180 degrees
                cameraDir.y = 0;
                cameraDir.normalize();
                this.currentBlueprint.rotation.y = Math.atan2(cameraDir.x, cameraDir.z);
            } else {
                // 90 or 270 degrees rotation
                cameraDir.y = 0;
                cameraDir.normalize();
                this.currentBlueprint.rotation.y = Math.atan2(cameraDir.x, cameraDir.z) + Math.PI/2;
            }
        } else if (this.buildingType === 'roof') {
            this.currentBlueprint.position.y += 3; // Roof height
        } else if (this.buildingType === 'window') {
            // For windows, we need to find a wall to place it on
            // Cast a ray forward to find walls
            raycaster.set(this.camera.position, cameraDir);
            const wallIntersects = raycaster.intersectObjects(this.placedPieces);

            // Find the first wall hit
            let wallHit = null;
            for (const hit of wallIntersects) {
                if (hit.object.userData.buildingType === 'wall') {
                    wallHit = hit;
                    break;
                }
            }

            if (wallHit) {
                // Position the window exactly on the wall surface
                const wallNormal = wallHit.face.normal.clone();
                this.currentBlueprint.position.copy(wallHit.point);

                // Ensure the window is centered on the wall by aligning it to the wall's grid
                const wallSize = this.getPieceSize('wall');

                // Adjust height to be at a reasonable position on the wall
                // Default to center of the wall if hit point is not specific
                if (Math.abs(this.currentBlueprint.position.y - wallHit.object.position.y) > wallSize.y / 3) {
                    this.currentBlueprint.position.y = wallHit.object.position.y;
                }

                // Ensure the window is aligned with the wall's face
                // Project the window position onto the wall plane
                const wallPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
                    wallNormal, wallHit.object.position
                );

                // Adjust position to be exactly on the wall plane
                const projectedPos = new THREE.Vector3();
                wallPlane.projectPoint(this.currentBlueprint.position, projectedPos);
                this.currentBlueprint.position.copy(projectedPos);

                // Ensure the window is embedded in the wall, not sticking out
                // No offset needed as we want it flush with the wall

                // Match the wall's rotation
                this.currentBlueprint.rotation.copy(wallHit.object.rotation);

                // Store the wall we're placing the window on
                this.currentBlueprint.userData.targetWall = wallHit.object;

                // Change material to indicate valid placement
                if (this.currentBlueprint.material !== this.snapMaterial) {
                    this.currentBlueprint.material = this.snapMaterial.clone();
                }

                if (this.debug) {
                    console.log('Window positioned on wall at:', wallHit.point);
                    console.log('Wall normal:', wallNormal);
                    console.log('Target wall:', wallHit.object);
                }
            } else {
                // No wall found, position in front of player
                this.currentBlueprint.position.copy(targetPosition);
                this.currentBlueprint.position.y += 1.5; // Position at eye level

                // Face the window toward the player
                cameraDir.y = 0;
                cameraDir.normalize();
                this.currentBlueprint.rotation.y = Math.atan2(cameraDir.x, cameraDir.z);

                // Reset target wall
                this.currentBlueprint.userData.targetWall = null;

                // Use normal material to indicate invalid placement
                if (this.currentBlueprint.material !== this.blueprintMaterial) {
                    this.currentBlueprint.material = this.blueprintMaterial.clone();
                }

                if (this.debug) {
                    console.log('No wall found for window placement');
                }
            }
        }

        // Check for snapping to existing building pieces
        this.isSnapping = false;
        if (this.placedPieces.length > 0) {
            if (this.debug) {
                console.log(`Checking for snapping. Current type: ${this.buildingType}, Placed pieces: ${this.placedPieces.length}`);
            }

            // Find the closest piece to snap to
            let closestPiece = null;
            let closestDistance = this.snapDistance;
            let snapPosition = new THREE.Vector3();
            let snapRotation = new THREE.Euler();

            // Count compatible pieces for debugging
            let compatibleCount = 0;

            for (const piece of this.placedPieces) {
                // Skip if not compatible for snapping
                if (!this.canSnapTo(piece)) {
                    if (this.debug) {
                        console.log(`Piece ${piece.userData.buildingType} not compatible with ${this.buildingType}`);
                    }
                    continue;
                }

                compatibleCount++;

                // Calculate distance between pieces
                const distance = this.currentBlueprint.position.distanceTo(piece.position);

                if (this.debug) {
                    console.log(`Distance to ${piece.userData.buildingType}: ${distance.toFixed(2)} (threshold: ${this.snapDistance})`);
                }

                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestPiece = piece;

                    // Calculate snap position based on piece types
                    snapPosition = this.getSnapPosition(piece);
                    snapRotation = this.getSnapRotation(piece);

                    if (this.debug) {
                        console.log(`Found potential snap target: ${piece.userData.buildingType} at distance ${distance.toFixed(2)}`);
                    }
                }
            }

            if (this.debug) {
                console.log(`Found ${compatibleCount} compatible pieces for snapping`);
            }

            // Apply snapping if a close piece was found
            if (closestPiece) {
                this.currentBlueprint.position.copy(snapPosition);
                this.currentBlueprint.rotation.copy(snapRotation);
                this.isSnapping = true;

                // Change material to indicate snapping
                if (this.currentBlueprint.material !== this.snapMaterial) {
                    this.currentBlueprint.material = this.snapMaterial.clone();
                }

                if (this.debug) {
                    console.log(`Snapping to ${closestPiece.userData.buildingType} at position:`, snapPosition);
                }
            } else {
                // Reset to normal material if not snapping
                if (this.currentBlueprint.material !== this.blueprintMaterial) {
                    this.currentBlueprint.material = this.blueprintMaterial.clone();
                }

                if (this.debug) {
                    console.log('No suitable snap target found');
                }
            }
        }
    }

    build() {
        if (!this.isBuilding || !this.currentBlueprint) return;

        // Special handling for windows
        if (this.buildingType === 'window') {
            // Check if we have a target wall
            const targetWall = this.currentBlueprint.userData.targetWall;
            if (!targetWall) {
                if (this.debug) {
                    console.log('Cannot place window - no target wall');
                }
                return; // Can't place a window without a wall
            }

            // Create window opening in the wall first
            const updatedWall = this.createWindowOpening(targetWall, this.currentBlueprint.position.clone());

            // Create window frame
            const windowFrame = this.createWindowFrame();
            windowFrame.position.copy(this.currentBlueprint.position);
            windowFrame.rotation.copy(this.currentBlueprint.rotation);
            windowFrame.userData.buildingType = 'window';
            windowFrame.userData.isWindow = true;

            // Add window to scene
            this.scene.add(windowFrame);

            // Update the target wall reference
            targetWall = updatedWall;

            // Track this window with its wall
            if (!this.wallsWithWindows.has(targetWall)) {
                this.wallsWithWindows.set(targetWall, []);
            }
            this.wallsWithWindows.get(targetWall).push({
                window: windowFrame,
                position: this.currentBlueprint.position.clone()
            });

            if (this.debug) {
                console.log('Window placed on wall:', targetWall);
            }

            // Remove logs from inventory
            for (let i = 0; i < this.costs[this.buildingType]; i++) {
                this.inventory.removeItem('log');
            }
        } else {
            // Normal building piece (wall, foundation, roof)
            const geometry = this.meshes[this.buildingType];

            // Create appropriate material based on building type
            let material;
            if (this.buildingType === 'wall') {
                // For walls, we need to ensure the material works well with window holes
                material = new THREE.MeshStandardMaterial({
                    color: 0x8B4513,
                    roughness: 0.8,
                    metalness: 0.1,
                    side: THREE.DoubleSide  // Important for seeing through windows from both sides
                });
            } else {
                // Standard material for other building pieces
                material = new THREE.MeshStandardMaterial({
                    color: 0x8B4513,
                    roughness: 0.8,
                    metalness: 0.1
                });
            }
            const buildingPiece = new THREE.Mesh(geometry, material);

            // Copy position and rotation from blueprint
            buildingPiece.position.copy(this.currentBlueprint.position);
            buildingPiece.rotation.copy(this.currentBlueprint.rotation);

            // Store the building type in userData for snapping logic
            buildingPiece.userData.buildingType = this.buildingType;

            // Add to scene
            this.scene.add(buildingPiece);

            // Add to placed pieces for snapping
            this.placedPieces.push(buildingPiece);

            if (this.debug) {
                console.log(`Added ${this.buildingType} to placed pieces. Total pieces: ${this.placedPieces.length}`);
                console.log('Placed pieces:', this.placedPieces.map(p => p.userData.buildingType));
            }

            // Remove logs from inventory
            for (let i = 0; i < this.costs[this.buildingType]; i++) {
                this.inventory.removeItem('log');
            }
        }

        // Remove blueprint
        this.scene.remove(this.currentBlueprint);
        this.currentBlueprint = null;

        this.isBuilding = false;
        this.buildingType = null;
        this.wallRotationIndex = 0; // Reset wall rotation for next placement

        // Hide building instructions
        this.hideBuildingInstructions();
    }

    cancelBuilding() {
        if (this.currentBlueprint) {
            this.scene.remove(this.currentBlueprint);
            this.currentBlueprint = null;
        }
        this.isBuilding = false;
        this.buildingType = null;
        this.wallRotationIndex = 0; // Reset wall rotation

        // Hide building instructions
        this.hideBuildingInstructions();
    }

    // Show instructions for building
    showBuildingInstructions(type) {
        const instructionsElement = document.getElementById('interaction-prompt');
        if (!instructionsElement) return;

        let instructions = 'Press E to place';

        // Add rotation instructions for walls
        if (type === 'wall') {
            instructions += ', R to rotate';
        }

        // Add window placement instructions
        if (type === 'window') {
            instructions = 'Look at a wall and press E to place window';
        }

        instructionsElement.textContent = instructions;
        instructionsElement.style.display = 'block';
    }

    // Hide building instructions
    hideBuildingInstructions() {
        const instructionsElement = document.getElementById('interaction-prompt');
        if (instructionsElement) {
            instructionsElement.style.display = 'none';
        }
    }

    // Rotate wall blueprint when R key is pressed
    rotateWall() {
        if (!this.isBuilding || !this.currentBlueprint || this.buildingType !== 'wall') return;

        // Cycle through rotation indices
        this.wallRotationIndex = (this.wallRotationIndex + 1) % this.wallRotations.length;

        // Get camera direction for base orientation
        const cameraDir = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDir);
        cameraDir.y = 0;
        cameraDir.normalize();

        // Apply rotation based on index
        if (this.wallRotationIndex === 0 || this.wallRotationIndex === 2) {
            // 0 or 180 degrees (aligned with camera direction)
            this.currentBlueprint.rotation.y = Math.atan2(cameraDir.x, cameraDir.z);
        } else {
            // 90 or 270 degrees (perpendicular to camera direction)
            this.currentBlueprint.rotation.y = Math.atan2(cameraDir.x, cameraDir.z) + Math.PI/2;
        }
    }

    // Check if current blueprint can snap to the given piece
    canSnapTo(piece) {
        if (!piece.userData.buildingType) return false;

        const blueprintType = this.buildingType;
        const pieceType = piece.userData.buildingType;

        // Define valid snapping combinations
        if (blueprintType === 'wall' && pieceType === 'foundation') return true;
        if (blueprintType === 'wall' && pieceType === 'wall') return true;
        if (blueprintType === 'roof' && pieceType === 'wall') return true;
        if (blueprintType === 'foundation' && pieceType === 'foundation') return true;

        return false;
    }

    // Calculate the position to snap to based on piece type
    getSnapPosition(piece) {
        const snapPos = new THREE.Vector3();
        const blueprintType = this.buildingType;
        const pieceType = piece.userData.buildingType;

        // Get piece dimensions
        const pieceSize = this.getPieceSize(pieceType);
        const blueprintSize = this.getPieceSize(blueprintType);

        // Start with the piece position
        snapPos.copy(piece.position);

        // Wall snapping to foundation
        if (blueprintType === 'wall' && pieceType === 'foundation') {
            // Place wall on edge of foundation based on closest edge
            const localPos = this.currentBlueprint.position.clone().sub(piece.position);
            localPos.applyEuler(new THREE.Euler(0, -piece.rotation.y, 0)); // Transform to local space

            // Determine which edge is closest
            const absX = Math.abs(localPos.x);
            const absZ = Math.abs(localPos.z);

            if (absX > absZ) {
                // Snap to X edge
                snapPos.x += (localPos.x > 0 ? 1 : -1) * pieceSize.x/2;
                this.wallRotationIndex = 1; // Set to 90 degrees
            } else {
                // Snap to Z edge
                snapPos.z += (localPos.z > 0 ? 1 : -1) * pieceSize.z/2;
                this.wallRotationIndex = 0; // Set to 0 degrees
            }

            // Adjust height
            snapPos.y = piece.position.y + pieceSize.y/2 + blueprintSize.y/2 - 0.1; // Slight offset to prevent floating

            if (this.debug) {
                console.log('Wall snapping to foundation edge');
            }
        }

        // Wall snapping to wall
        else if (blueprintType === 'wall' && pieceType === 'wall') {
            // Determine if we're snapping to the end or side of the wall
            const pieceDir = new THREE.Vector3(0, 0, 1).applyEuler(piece.rotation);
            const pieceRight = new THREE.Vector3(1, 0, 0).applyEuler(piece.rotation);

            // Calculate the four corners of the wall for better snapping
            const halfWidth = pieceSize.x / 2;
            const halfDepth = pieceSize.z / 2;

            const corner1 = piece.position.clone().add(pieceRight.clone().multiplyScalar(halfWidth)).add(pieceDir.clone().multiplyScalar(halfDepth));
            const corner2 = piece.position.clone().add(pieceRight.clone().multiplyScalar(-halfWidth)).add(pieceDir.clone().multiplyScalar(halfDepth));
            const corner3 = piece.position.clone().add(pieceRight.clone().multiplyScalar(halfWidth)).add(pieceDir.clone().multiplyScalar(-halfDepth));
            const corner4 = piece.position.clone().add(pieceRight.clone().multiplyScalar(-halfWidth)).add(pieceDir.clone().multiplyScalar(-halfDepth));

            // Find closest corner
            const corners = [corner1, corner2, corner3, corner4];
            let closestCorner = null;
            let minDist = Infinity;

            for (let i = 0; i < corners.length; i++) {
                const dist = this.currentBlueprint.position.distanceTo(corners[i]);
                if (dist < minDist) {
                    minDist = dist;
                    closestCorner = corners[i];
                }
            }

            // Snap to the closest corner
            snapPos.copy(closestCorner);

            // Set rotation perpendicular to the existing wall
            this.wallRotationIndex = (Math.round(piece.rotation.y / (Math.PI/2)) + 1) % 4;

            if (this.debug) {
                console.log('Wall snapping to wall corner');
            }
        }

        // Roof snapping to wall
        else if (blueprintType === 'roof' && pieceType === 'wall') {
            // Place roof on top of wall
            snapPos.y = piece.position.y + pieceSize.y/2 + blueprintSize.y/2 - 0.1; // Slight offset to prevent floating

            if (this.debug) {
                console.log('Roof snapping to top of wall');
            }
        }

        // Foundation snapping to foundation
        else if (blueprintType === 'foundation' && pieceType === 'foundation') {
            // Determine which edge to snap to
            const localPos = this.currentBlueprint.position.clone().sub(piece.position);
            localPos.applyEuler(new THREE.Euler(0, -piece.rotation.y, 0)); // Transform to local space

            // Snap to the closest edge
            const absX = Math.abs(localPos.x);
            const absZ = Math.abs(localPos.z);

            if (absX > absZ) {
                // Snap to X edge
                snapPos.x += (localPos.x > 0 ? 1 : -1) * pieceSize.x;
            } else {
                // Snap to Z edge
                snapPos.z += (localPos.z > 0 ? 1 : -1) * pieceSize.z;
            }

            // Keep same Y position
            snapPos.y = piece.position.y;

            if (this.debug) {
                console.log('Foundation snapping to foundation edge');
            }
        }

        return snapPos;
    }

    // Calculate the rotation to snap to based on piece type
    getSnapRotation(piece) {
        const snapRot = new THREE.Euler();
        const blueprintType = this.buildingType;
        const pieceType = piece.userData.buildingType;

        // Start with the piece rotation
        snapRot.copy(piece.rotation);

        // Wall snapping to foundation
        if (blueprintType === 'wall' && pieceType === 'foundation') {
            // Determine which edge we're snapping to
            const localPos = this.currentBlueprint.position.clone().sub(piece.position);
            localPos.applyEuler(new THREE.Euler(0, -piece.rotation.y, 0)); // Transform to local space

            const absX = Math.abs(localPos.x);
            const absZ = Math.abs(localPos.z);

            if (absX > absZ) {
                // Snapping to X edge - rotate 90 degrees
                snapRot.y = piece.rotation.y + Math.PI/2;
            } else {
                // Snapping to Z edge - same rotation as foundation
                snapRot.y = piece.rotation.y;
            }
        }

        // Wall snapping to wall
        else if (blueprintType === 'wall' && pieceType === 'wall') {
            // Set rotation perpendicular to the existing wall
            snapRot.y = piece.rotation.y + Math.PI/2;
        }

        // For other combinations, use the same rotation as the piece

        return snapRot;
    }

    // Helper to get the dimensions of a piece based on type
    getPieceSize(type) {
        switch(type) {
            case 'wall':
                return { x: 2, y: 3, z: 0.2 };
            case 'foundation':
                return { x: 2, y: 0.2, z: 2 };
            case 'roof':
                return { x: 2, y: 0.2, z: 2 };
            case 'window':
                return { x: 0.8, y: 0.8, z: 0.1 };
            default:
                return { x: 0, y: 0, z: 0 };
        }
    }

    // Create a window frame that's embedded in the wall
    createWindowFrame() {
        // Create a frame using edges instead of a solid box
        const frameGroup = new THREE.Group();

        // Get wall dimensions
        const wallSize = this.getPieceSize('wall');

        // Window dimensions
        const width = 0.8;
        const height = 0.8;
        const depth = wallSize.z; // Exactly match wall thickness
        const frameThickness = 0.05; // Thinner frame

        // Frame material
        const frameMaterial = new THREE.MeshStandardMaterial({
            color: 0x8B4513,
            roughness: 0.8,
            metalness: 0.1
        });

        // Create frame pieces that go through the entire wall thickness
        const topGeometry = new THREE.BoxGeometry(width, frameThickness, depth);
        const bottomGeometry = new THREE.BoxGeometry(width, frameThickness, depth);
        const leftGeometry = new THREE.BoxGeometry(frameThickness, height - frameThickness * 2, depth);
        const rightGeometry = new THREE.BoxGeometry(frameThickness, height - frameThickness * 2, depth);

        const top = new THREE.Mesh(topGeometry, frameMaterial);
        const bottom = new THREE.Mesh(bottomGeometry, frameMaterial);
        const left = new THREE.Mesh(leftGeometry, frameMaterial);
        const right = new THREE.Mesh(rightGeometry, frameMaterial);

        // Position the frame pieces to be embedded in the wall
        top.position.y = height / 2 - frameThickness / 2;
        bottom.position.y = -height / 2 + frameThickness / 2;
        left.position.x = -width / 2 + frameThickness / 2;
        right.position.x = width / 2 - frameThickness / 2;

        // Add to group
        frameGroup.add(top);
        frameGroup.add(bottom);
        frameGroup.add(left);
        frameGroup.add(right);

        // Add a very subtle glass material
        const innerWidth = width - frameThickness * 2;
        const innerHeight = height - frameThickness * 2;
        const glassGeometry = new THREE.PlaneGeometry(innerWidth, innerHeight);
        const glassMaterial = new THREE.MeshBasicMaterial({
            color: 0xadd8e6,
            transparent: true,
            opacity: 0.1,  // Very transparent
            side: THREE.DoubleSide,
            depthWrite: false  // This is important for seeing through the glass
        });

        // Create glass pane in the middle of the frame
        const glass = new THREE.Mesh(glassGeometry, glassMaterial);
        glass.position.z = 0;
        frameGroup.add(glass);

        // Mark this as a window frame for special handling
        frameGroup.userData.isWindowFrame = true;

        return frameGroup;
    }

    // Create a window opening in a wall using a safer approach
    createWindowOpening(wall, windowPosition) {
        if (!wall || wall.userData.buildingType !== 'wall') return;

        if (this.debug) {
            console.log('Creating window opening in wall:', wall);
        }

        // Get window dimensions
        const windowSize = this.getPieceSize('window');
        const wallSize = this.getPieceSize('wall');

        // We'll use a safer approach that doesn't risk making the wall disappear
        // Instead of using CSG, we'll create a composite wall with a transparent section

        // First, store the original wall properties
        const originalPosition = wall.position.clone();
        const originalRotation = wall.rotation.clone();
        const originalUserData = { ...wall.userData };

        // Remove the original wall from the scene
        this.scene.remove(wall);

        // Create a group to hold our composite wall parts
        const wallGroup = new THREE.Group();
        wallGroup.position.copy(originalPosition);
        wallGroup.rotation.copy(originalRotation);
        wallGroup.userData = originalUserData;

        // Calculate the local position of the window on the wall
        const localWindowPos = windowPosition.clone().sub(originalPosition);
        localWindowPos.applyEuler(new THREE.Euler(-originalRotation.x, -originalRotation.y, -originalRotation.z, 'XYZ'));

        // Create wall material
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0x8B4513,
            roughness: 0.8,
            metalness: 0.1,
            side: THREE.DoubleSide  // Important for seeing through the window
        });

        // Create wall segments around the window
        // We'll create 4 segments: top, bottom, left, right

        // Top segment
        if (localWindowPos.y + windowSize.y/2 < wallSize.y/2) {
            const topHeight = wallSize.y/2 - (localWindowPos.y + windowSize.y/2);
            const topGeometry = new THREE.BoxGeometry(wallSize.x, topHeight, wallSize.z);
            const topWall = new THREE.Mesh(topGeometry, wallMaterial);
            topWall.position.set(0, wallSize.y/2 - topHeight/2, 0);
            wallGroup.add(topWall);
        }

        // Bottom segment
        if (localWindowPos.y - windowSize.y/2 > -wallSize.y/2) {
            const bottomHeight = localWindowPos.y - windowSize.y/2 - (-wallSize.y/2);
            const bottomGeometry = new THREE.BoxGeometry(wallSize.x, bottomHeight, wallSize.z);
            const bottomWall = new THREE.Mesh(bottomGeometry, wallMaterial);
            bottomWall.position.set(0, -wallSize.y/2 + bottomHeight/2, 0);
            wallGroup.add(bottomWall);
        }

        // Left segment
        if (localWindowPos.x - windowSize.x/2 > -wallSize.x/2) {
            const leftWidth = localWindowPos.x - windowSize.x/2 - (-wallSize.x/2);
            const leftGeometry = new THREE.BoxGeometry(leftWidth, wallSize.y, wallSize.z);
            const leftWall = new THREE.Mesh(leftGeometry, wallMaterial);
            leftWall.position.set(-wallSize.x/2 + leftWidth/2, 0, 0);
            wallGroup.add(leftWall);
        }

        // Right segment
        if (localWindowPos.x + windowSize.x/2 < wallSize.x/2) {
            const rightWidth = wallSize.x/2 - (localWindowPos.x + windowSize.x/2);
            const rightGeometry = new THREE.BoxGeometry(rightWidth, wallSize.y, wallSize.z);
            const rightWall = new THREE.Mesh(rightGeometry, wallMaterial);
            rightWall.position.set(wallSize.x/2 - rightWidth/2, 0, 0);
            wallGroup.add(rightWall);
        }

        // Add the wall group to the scene
        this.scene.add(wallGroup);

        // Update references
        const wallIndex = this.placedPieces.indexOf(wall);
        if (wallIndex !== -1) {
            this.placedPieces[wallIndex] = wallGroup;
        }

        if (this.debug) {
            console.log('Created composite wall with window opening');
        }

        return wallGroup;
    }
}