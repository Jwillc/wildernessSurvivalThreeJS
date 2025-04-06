import * as THREE from 'three';

export class TreeRegenerationSystem {
    constructor(scene, interactableObjects, worldSize = 80) {
        this.scene = scene;
        this.interactableObjects = interactableObjects;
        this.worldSize = worldSize;
        this.worldHalfSize = worldSize / 2;
        this.minTreeDistance = 2.5; // Same as in main.js
        this.growingTrees = []; // Trees that are currently growing
        this.treePositions = []; // All tree positions for collision detection
        this.treeModel = null; // Will be set from main.js
        this.maxGrowthTime = 120000; // 2 minutes to fully grow
        this.regrowthDelay = 30000; // 30 seconds before a new tree starts growing
        this.pendingRegrowth = []; // Queue of timestamps for pending tree regrowth

        // Growth stages
        this.growthStages = [
            { scale: 0.5, time: 0 },           // Sapling
            { scale: 1.0, time: 0.2 },         // Small tree
            { scale: 2.0, time: 0.4 },         // Medium tree
            { scale: 3.0, time: 0.6 },         // Large tree
            { scale: 4.0, time: 0.8 },         // Full-sized tree
            { scale: 5.0, time: 1.0 }          // Mature tree
        ];
    }

    // Set the tree model reference from main.js
    setTreeModel(model) {
        this.treeModel = model;
    }

    // Update tree positions from main.js
    updateTreePositions(positions) {
        this.treePositions = positions;
    }

    // Called when a tree is chopped down
    onTreeChopped(position) {
        // Schedule a new tree to grow after the delay
        this.pendingRegrowth.push({
            timestamp: Date.now() + this.regrowthDelay,
            originalPosition: position.clone() // Store the original position for reference
        });

        console.log(`Tree chopped at ${position.x.toFixed(2)}, ${position.z.toFixed(2)}. Scheduled regrowth in ${this.regrowthDelay/1000} seconds.`);
    }

    // Find a valid position for a new tree
    findValidTreePosition() {
        // Try up to 50 random positions
        for (let attempts = 0; attempts < 50; attempts++) {
            // Generate a random position within the world bounds
            const position = new THREE.Vector2(
                (Math.random() * this.worldSize) - this.worldHalfSize,
                (Math.random() * this.worldSize) - this.worldHalfSize
            );

            // Check if the position is valid (not too close to other trees)
            if (!this.isTooCloseToTrees(position)) {
                return position;
            }
        }

        // If we couldn't find a valid position after 50 attempts, try a different approach
        // Try to find a position in a less dense area
        return this.findPositionInLessDenseArea();
    }

    // Check if a position is too close to existing trees
    isTooCloseToTrees(position) {
        for (const existingPos of this.treePositions) {
            // Quick check on x and y separately before doing the more expensive distance calculation
            if (Math.abs(position.x - existingPos.x) < this.minTreeDistance &&
                Math.abs(position.y - existingPos.y) < this.minTreeDistance) {

                const distance = position.distanceTo(existingPos);
                if (distance < this.minTreeDistance) {
                    return true;
                }
            }
        }

        // Also check growing trees
        for (const growingTree of this.growingTrees) {
            const treePos = new THREE.Vector2(growingTree.position.x, growingTree.position.z);

            if (Math.abs(position.x - treePos.x) < this.minTreeDistance &&
                Math.abs(position.y - treePos.y) < this.minTreeDistance) {

                const distance = position.distanceTo(treePos);
                if (distance < this.minTreeDistance) {
                    return true;
                }
            }
        }

        return false;
    }

    // Find a position in a less dense area of the forest
    findPositionInLessDenseArea() {
        // Create a grid of the world and count trees in each cell
        const gridSize = 10; // 10x10 grid
        const cellSize = this.worldSize / gridSize;
        const grid = Array(gridSize).fill().map(() => Array(gridSize).fill(0));

        // Count trees in each grid cell
        for (const pos of this.treePositions) {
            // Convert world position to grid cell
            const gridX = Math.floor((pos.x + this.worldHalfSize) / cellSize);
            const gridY = Math.floor((pos.y + this.worldHalfSize) / cellSize);

            // Ensure we're within grid bounds
            if (gridX >= 0 && gridX < gridSize && gridY >= 0 && gridY < gridSize) {
                grid[gridX][gridY]++;
            }
        }

        // Find the cell with the fewest trees
        let minCount = Infinity;
        let bestCell = { x: 0, y: 0 };

        for (let x = 0; x < gridSize; x++) {
            for (let y = 0; y < gridSize; y++) {
                if (grid[x][y] < minCount) {
                    minCount = grid[x][y];
                    bestCell = { x, y };
                }
            }
        }

        // Generate a random position within that cell
        const worldX = (bestCell.x * cellSize) - this.worldHalfSize + (Math.random() * cellSize);
        const worldY = (bestCell.y * cellSize) - this.worldHalfSize + (Math.random() * cellSize);

        return new THREE.Vector2(worldX, worldY);
    }

    // Create a new growing tree
    createGrowingTree() {
        if (!this.treeModel) {
            console.warn('Tree model not set, cannot create growing tree');
            return null;
        }

        // Find a valid position for the new tree
        const position = this.findValidTreePosition();

        // Clone the tree model
        const tree = this.treeModel.clone();

        // Start with a tiny scale (sapling)
        const initialScale = this.growthStages[0].scale;
        tree.scale.set(initialScale, initialScale, initialScale);

        // Position the tree
        tree.position.set(
            position.x,
            0, // Position at ground level
            position.y // Vector2 uses y for the z-coordinate
        );

        // Set tree data
        tree.userData.type = 'tree';
        tree.userData.isGrowing = true;
        tree.userData.growthStartTime = Date.now();
        tree.userData.originalScale = this.getRandomMatureScale();

        // Add to scene and tracking arrays
        this.scene.add(tree);
        this.interactableObjects.push(tree);
        this.growingTrees.push(tree);
        this.treePositions.push(position);

        console.log(`New tree sapling created at ${position.x.toFixed(2)}, ${position.y.toFixed(2)}`);

        return tree;
    }

    // Get a random scale for a mature tree (similar to the distribution in main.js)
    getRandomMatureScale() {
        const randVal = Math.random();
        if (randVal < 0.2) {
            // 20% chance of smaller trees (2.0-3.0)
            return 2.0 + Math.random() * 1.0;
        } else if (randVal < 0.9) {
            // 70% chance of medium trees (3.0-5.0)
            return 3.0 + Math.random() * 2.0;
        } else {
            // 10% chance of larger trees (5.0-7.0)
            return 5.0 + Math.random() * 2.0;
        }
    }

    // Update the growth of all growing trees
    update(deltaTime) {
        const now = Date.now();

        // Check if any pending trees should start growing
        if (this.pendingRegrowth.length > 0) {
            const readyTrees = this.pendingRegrowth.filter(item => now >= item.timestamp);

            for (const readyTree of readyTrees) {
                this.createGrowingTree();

                // Remove from pending list
                const index = this.pendingRegrowth.indexOf(readyTree);
                if (index !== -1) {
                    this.pendingRegrowth.splice(index, 1);
                }
            }
        }

        // Update growing trees
        for (let i = this.growingTrees.length - 1; i >= 0; i--) {
            const tree = this.growingTrees[i];
            const growthTime = now - tree.userData.growthStartTime;
            const growthProgress = Math.min(growthTime / this.maxGrowthTime, 1);

            // Calculate current scale based on growth stages
            const targetScale = this.calculateCurrentScale(growthProgress, tree.userData.originalScale);

            // Apply the scale
            tree.scale.set(targetScale, targetScale, targetScale);

            // If fully grown, remove from growing trees list
            if (growthProgress >= 1) {
                tree.userData.isGrowing = false;
                this.growingTrees.splice(i, 1);
                console.log(`Tree fully grown at ${tree.position.x.toFixed(2)}, ${tree.position.z.toFixed(2)}`);
            }
        }
    }

    // Calculate the current scale based on growth progress and growth stages
    calculateCurrentScale(progress, targetScale) {
        // Find the appropriate growth stage
        for (let i = 1; i < this.growthStages.length; i++) {
            const prevStage = this.growthStages[i - 1];
            const currStage = this.growthStages[i];

            if (progress <= currStage.time) {
                // Calculate scale between these two stages
                const stageProgress = (progress - prevStage.time) / (currStage.time - prevStage.time);
                const baseScale = prevStage.scale + (currStage.scale - prevStage.scale) * stageProgress;

                // Scale relative to the target final scale
                const scaleFactor = targetScale / this.growthStages[this.growthStages.length - 1].scale;
                return baseScale * scaleFactor;
            }
        }

        // If we're past all stages, return the target scale
        return targetScale;
    }
}
