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
        this.isOpen = false;
        this.commandHistory = [];
        this.historyIndex = -1;
        this.commands = {
            'help': this.showHelp.bind(this),
            'unlimited logs': this.unlimitedLogs.bind(this),
            'clear': this.clear.bind(this)
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
}
