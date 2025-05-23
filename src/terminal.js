/**
 * Terminal system for the game
 * Provides a command-line interface for developer commands
 */
export class Terminal {
    constructor(game) {
        this.game = game;
        this.controls = game.controls;
        this.inventory = game.inventory;
        this.buildingSystem = game.buildingSystem;
        this.craftingSystem = game.craftingSystem;
        this.isOpen = false;
        this.commandHistory = [];
        this.historyIndex = -1;
        this.commands = {
            'help': this.showHelp.bind(this),
            'unlimited logs': this.unlimitedLogs.bind(this),
            'clear': this.clear.bind(this),
            'reload models': this.reloadModels.bind(this),
            'make night': this.makeNight.bind(this),
            'debug trees': this.debugTrees.bind(this)
        };

        // Get DOM elements
        this.terminalElement = document.getElementById('terminal');
        this.outputElement = document.getElementById('terminal-output');
        this.inputElement = document.getElementById('terminal-input');

        // Set up event listeners
        this.inputElement.addEventListener('keydown', this.handleInput.bind(this));

        // Initialize with welcome message
        this.print('Welcome to the Wilderness Survival Terminal');
        this.print('Type "help" for a list of commands');
    }

    toggle() {
        this.isOpen = !this.isOpen;
        this.terminalElement.style.display = this.isOpen ? 'block' : 'none';

        if (this.isOpen) {
            // Focus the input when terminal is opened
            this.inputElement.focus();

            // Disable normal game controls
            if (this.game.controls) {
                this.game.controls.unlock();
            }
        } else {
            // Re-enable game controls when terminal is closed
            if (this.game.controls && document.pointerLockElement === null) {
                this.game.controls.lock();
            }
        }

        return this.isOpen;
    }

    print(message) {
        const line = document.createElement('div');
        line.textContent = message;
        this.outputElement.appendChild(line);

        // Scroll to bottom
        this.outputElement.scrollTop = this.outputElement.scrollHeight;
    }

    handleInput(event) {
        if (event.key === 'Enter') {
            const command = this.inputElement.value.trim();

            if (command) {
                // Add to output
                this.print(`> ${command}`);

                // Add to history
                this.commandHistory.push(command);
                this.historyIndex = this.commandHistory.length;

                // Process command
                this.processCommand(command);

                // Clear input
                this.inputElement.value = '';
            }
        } else if (event.key === 'ArrowUp') {
            // Navigate command history (up)
            if (this.historyIndex > 0) {
                this.historyIndex--;
                this.inputElement.value = this.commandHistory[this.historyIndex];

                // Move cursor to end of input
                setTimeout(() => {
                    this.inputElement.selectionStart = this.inputElement.value.length;
                    this.inputElement.selectionEnd = this.inputElement.value.length;
                }, 0);
            }
            event.preventDefault();
        } else if (event.key === 'ArrowDown') {
            // Navigate command history (down)
            if (this.historyIndex < this.commandHistory.length - 1) {
                this.historyIndex++;
                this.inputElement.value = this.commandHistory[this.historyIndex];
            } else {
                this.historyIndex = this.commandHistory.length;
                this.inputElement.value = '';
            }
            event.preventDefault();
        } else if (event.key === 'Tab') {
            // Prevent tab from changing focus
            event.preventDefault();

            // Simple command completion
            const input = this.inputElement.value.trim();
            if (input) {
                const matches = Object.keys(this.commands).filter(cmd => cmd.startsWith(input));
                if (matches.length === 1) {
                    this.inputElement.value = matches[0];
                } else if (matches.length > 1) {
                    this.print(`Matching commands: ${matches.join(', ')}`);
                }
            }
        } else if (event.key === 'Escape') {
            // Close terminal on Escape
            this.toggle();
            event.preventDefault();
        }
    }

    processCommand(command) {
        const commandLower = command.toLowerCase();

        // Check if command exists
        if (this.commands[commandLower]) {
            try {
                this.commands[commandLower](command);
            } catch (error) {
                this.print(`Error executing command: ${error.message}`);
            }
        } else {
            this.print(`Unknown command: ${command}`);
            this.print('Type "help" for a list of commands');
        }
    }

    // Command implementations
    showHelp() {
        this.print('Available commands:');
        this.print('  help - Show this help message');
        this.print('  unlimited logs - Toggle unlimited logs for testing');
        this.print('  clear - Clear the terminal');
        this.print('  reload models - Reload crafting models if they failed to load');
        this.print('  make night - Force night time for testing the UFO');
        this.print('  debug trees - Toggle tree and arrow collision boxes');
    }

    reloadModels() {
        if (this.craftingSystem) {
            const result = this.craftingSystem.reloadModels();
            this.print(result);
        } else {
            this.print('Crafting system not initialized');
        }
    }

    unlimitedLogs() {
        if (this.inventory) {
            // Toggle unlimited logs mode
            this.inventory.unlimitedLogs = !this.inventory.unlimitedLogs;

            if (this.inventory.unlimitedLogs) {
                this.print('Unlimited logs mode enabled');
                // Add a bunch of logs to demonstrate
                this.inventory.addItem('log', 10);
            } else {
                this.print('Unlimited logs mode disabled');
            }
        } else {
            this.print('Inventory system not available');
        }
    }

    clear() {
        this.outputElement.innerHTML = '';
        this.print('Terminal cleared');
    }

    makeNight() {
        // Access the day-night cycle from the game object
        if (this.game.dayNightCycle) {
            const dayNightCycle = this.game.dayNightCycle;

            // Set the time to night
            dayNightCycle.setTimeOfDay('night');

            // Adjust the cycle timing to be at the start of night
            // Calculate the time that would correspond to the start of night
            const now = Date.now();
            const totalCycleDuration = dayNightCycle.dayDuration + dayNightCycle.nightDuration;
            const nightStartOffset = dayNightCycle.dayDuration;

            // Set the cycle start time to make current time be at night start
            dayNightCycle.cycleStartTime = now - nightStartOffset;

            // Make sure the cycle is not paused
            dayNightCycle.isPaused = false;

            this.print('Night time activated. The UFO will appear shortly.');
            this.print('Remember to stay under a roof to avoid abduction!');
            this.print('Night will last for approximately 2 minutes.');
        } else {
            this.print('Day-night cycle system not available');
        }
    }

    debugTrees() {
        // Toggle debug mode for trees and arrows
        if (window.debugTreesEnabled === undefined) {
            window.debugTreesEnabled = false;
        }

        window.debugTreesEnabled = !window.debugTreesEnabled;

        if (window.debugTreesEnabled) {
            this.print('Tree and arrow debug mode enabled');
            this.print('Showing collision boxes for trees and arrows');

            // Create helpers for all trees
            const THREE = window.THREE; // Get THREE from window
            if (!THREE) {
                this.print('THREE.js not available, cannot create debug helpers');
                return;
            }

            // Get all trees from interactable objects
            const trees = window.interactableObjects.filter(obj => obj.userData.type === 'tree');
            this.print(`Found ${trees.length} trees to debug`);

            // Create a helper for each tree
            window.debugHelpers = window.debugHelpers || [];

            // Remove any existing helpers
            if (window.debugHelpers.length > 0) {
                for (const helper of window.debugHelpers) {
                    if (helper.parent) {
                        helper.parent.remove(helper);
                    }
                }
                window.debugHelpers = [];
            }

            // Create new helpers
            for (const tree of trees) {
                // Create a box helper
                const helper = new THREE.BoxHelper(tree, 0xff0000);
                helper.userData.isDebugHelper = true;
                this.game.scene.add(helper);
                window.debugHelpers.push(helper);
            }

            // Also add helpers for any arrows in flight
            if (this.game.bowAndArrowSystem) {
                const arrows = this.game.bowAndArrowSystem.arrows;
                this.print(`Found ${arrows.length} arrows to debug`);

                for (const arrow of arrows) {
                    const helper = new THREE.BoxHelper(arrow, 0x00ff00);
                    helper.userData.isDebugHelper = true;
                    this.game.scene.add(helper);
                    window.debugHelpers.push(helper);
                }
            }

            // Set up an update function to keep the helpers in sync with the objects
            if (!window.updateDebugHelpers) {
                window.updateDebugHelpers = () => {
                    if (!window.debugTreesEnabled) return;

                    // Update all helpers
                    for (const helper of window.debugHelpers) {
                        if (helper.object) {
                            helper.update();
                        }
                    }

                    // Request the next frame
                    requestAnimationFrame(window.updateDebugHelpers);
                };

                // Start the update loop
                window.updateDebugHelpers();
            }
        } else {
            this.print('Tree and arrow debug mode disabled');

            // Remove all helpers
            if (window.debugHelpers && window.debugHelpers.length > 0) {
                for (const helper of window.debugHelpers) {
                    if (helper.parent) {
                        helper.parent.remove(helper);
                    }
                }
                window.debugHelpers = [];
            }
        }
    }
}
