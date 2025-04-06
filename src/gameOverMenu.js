export class GameOverMenu {
    constructor() {
        this.menuElement = null;
        this.isVisible = false;
        this.onRestartCallback = null;
    }

    initialize(onRestartCallback) {
        this.onRestartCallback = onRestartCallback;

        // Create the menu element if it doesn't exist
        if (!this.menuElement) {
            this.createMenuElement();
        }
    }

    createMenuElement() {
        // Create the menu container
        this.menuElement = document.createElement('div');
        this.menuElement.id = 'game-over-menu';
        this.menuElement.style.position = 'fixed';
        this.menuElement.style.top = '0';
        this.menuElement.style.left = '0';
        this.menuElement.style.width = '100%';
        this.menuElement.style.height = '100%';
        this.menuElement.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        this.menuElement.style.display = 'flex';
        this.menuElement.style.flexDirection = 'column';
        this.menuElement.style.justifyContent = 'center';
        this.menuElement.style.alignItems = 'center';
        this.menuElement.style.zIndex = '1000';
        this.menuElement.style.fontFamily = 'Arial, sans-serif';
        this.menuElement.style.color = 'white';
        this.menuElement.style.display = 'none'; // Hidden by default

        // Create the title
        const title = document.createElement('h1');
        title.textContent = 'GAME OVER';
        title.style.fontSize = '4rem';
        title.style.marginBottom = '2rem';
        title.style.color = '#ff0000';
        title.style.textShadow = '0 0 10px rgba(255, 0, 0, 0.7), 0 0 20px rgba(255, 0, 0, 0.5)';

        // Add blood drip animation
        title.style.position = 'relative';
        title.style.animation = 'drip 2s ease-in-out infinite';

        // Create a style element for the blood drip animation
        const styleElement = document.createElement('style');
        styleElement.textContent = `
            @keyframes drip {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(5px); }
            }
        `;
        document.head.appendChild(styleElement);

        // Create the message
        const message = document.createElement('p');
        message.textContent = 'You have been abducted and brutally dismembered by aliens!';
        message.style.fontSize = '1.5rem';
        message.style.marginBottom = '3rem';
        message.style.color = '#ff9999';
        message.style.maxWidth = '80%';
        message.style.textAlign = 'center';

        // Add a gory subtitle
        const subtitle = document.createElement('p');
        subtitle.textContent = 'Your remains have been scattered across the wilderness...';
        subtitle.style.fontSize = '1.2rem';
        subtitle.style.marginBottom = '3rem';
        subtitle.style.color = '#aa0000';
        subtitle.style.fontStyle = 'italic';

        // Create the restart button
        const restartButton = document.createElement('button');
        restartButton.textContent = 'Restart Game';
        restartButton.style.padding = '1rem 2rem';
        restartButton.style.fontSize = '1.2rem';
        restartButton.style.backgroundColor = '#4CAF50';
        restartButton.style.color = 'white';
        restartButton.style.border = 'none';
        restartButton.style.borderRadius = '5px';
        restartButton.style.cursor = 'pointer';
        restartButton.style.transition = 'background-color 0.3s';

        // Add hover effect
        restartButton.addEventListener('mouseover', () => {
            restartButton.style.backgroundColor = '#45a049';
        });

        restartButton.addEventListener('mouseout', () => {
            restartButton.style.backgroundColor = '#4CAF50';
        });

        // Add click event
        restartButton.addEventListener('click', () => {
            if (this.onRestartCallback) {
                this.onRestartCallback();
            }
        });

        // Add elements to the menu
        this.menuElement.appendChild(title);
        this.menuElement.appendChild(message);
        this.menuElement.appendChild(subtitle);
        this.menuElement.appendChild(restartButton);

        // Add the menu to the document
        document.body.appendChild(this.menuElement);
    }

    show() {
        if (this.menuElement) {
            this.menuElement.style.display = 'flex';
            this.isVisible = true;
        }
    }

    hide() {
        if (this.menuElement) {
            this.menuElement.style.display = 'none';
            this.isVisible = false;
        }
    }

    // Clean up resources
    dispose() {
        if (this.menuElement && this.menuElement.parentNode) {
            this.menuElement.parentNode.removeChild(this.menuElement);
        }
        this.menuElement = null;
    }
}
