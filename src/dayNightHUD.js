export class DayNightHUD {
    constructor(dayNightCycle) {
        this.dayNightCycle = dayNightCycle;
        this.element = null;
        this.sunElement = null;
        this.moonElement = null;
        this.isInitialized = false;
    }

    initialize() {
        if (this.isInitialized) return;

        // Create the main HUD container
        this.element = document.createElement('div');
        this.element.id = 'day-night-hud';
        this.element.style.position = 'fixed';
        this.element.style.bottom = '30px';
        this.element.style.right = '30px';
        this.element.style.width = '100px';
        this.element.style.height = '100px';
        this.element.style.borderRadius = '50%';
        this.element.style.border = '2px solid white';
        this.element.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        this.element.style.zIndex = '100';
        this.element.style.overflow = 'hidden';

        // Create the day/night divider line
        const divider = document.createElement('div');
        divider.style.position = 'absolute';
        divider.style.top = '50%';
        divider.style.left = '0';
        divider.style.width = '100%';
        divider.style.height = '1px';
        divider.style.backgroundColor = 'rgba(255, 255, 255, 0.5)';
        this.element.appendChild(divider);

        // Create day label
        const dayLabel = document.createElement('div');
        dayLabel.textContent = 'DAY';
        dayLabel.style.position = 'absolute';
        dayLabel.style.top = '10px';
        dayLabel.style.left = '50%';
        dayLabel.style.transform = 'translateX(-50%)';
        dayLabel.style.color = 'rgba(255, 255, 255, 0.7)';
        dayLabel.style.fontSize = '10px';
        dayLabel.style.fontFamily = 'Arial, sans-serif';
        this.element.appendChild(dayLabel);

        // Create night label
        const nightLabel = document.createElement('div');
        nightLabel.textContent = 'NIGHT';
        nightLabel.style.position = 'absolute';
        nightLabel.style.bottom = '10px';
        nightLabel.style.left = '50%';
        nightLabel.style.transform = 'translateX(-50%)';
        nightLabel.style.color = 'rgba(255, 255, 255, 0.7)';
        nightLabel.style.fontSize = '10px';
        nightLabel.style.fontFamily = 'Arial, sans-serif';
        this.element.appendChild(nightLabel);

        // Create the sun element
        this.sunElement = document.createElement('div');
        this.sunElement.style.position = 'absolute';
        this.sunElement.style.width = '20px';
        this.sunElement.style.height = '20px';
        this.sunElement.style.borderRadius = '50%';
        this.sunElement.style.backgroundColor = '#ffcc00';
        this.sunElement.style.boxShadow = '0 0 10px #ffcc00';
        this.element.appendChild(this.sunElement);

        // Create the moon element
        this.moonElement = document.createElement('div');
        this.moonElement.style.position = 'absolute';
        this.moonElement.style.width = '18px';
        this.moonElement.style.height = '18px';
        this.moonElement.style.borderRadius = '50%';
        this.moonElement.style.backgroundColor = '#ccccff';
        this.moonElement.style.boxShadow = '0 0 10px #ccccff';
        this.moonElement.style.display = 'none'; // Initially hidden
        this.element.appendChild(this.moonElement);

        // Add to the document
        document.body.appendChild(this.element);

        this.isInitialized = true;
    }

    update() {
        if (!this.isInitialized || !this.dayNightCycle) return;

        // Get the current time from the day/night cycle
        const now = Date.now();
        const elapsed = now - this.dayNightCycle.cycleStartTime;
        const totalCycleDuration = this.dayNightCycle.dayDuration + this.dayNightCycle.nightDuration;

        // Calculate cycle progress (0 to 1)
        const cycleProgress = (elapsed % totalCycleDuration) / totalCycleDuration;

        // Calculate day/night phase
        const dayStart = 0;
        const nightStart = this.dayNightCycle.dayDuration / totalCycleDuration;

        // Determine if it's day or night
        const isDay = cycleProgress >= dayStart && cycleProgress < nightStart;

        // Update the HUD based on the current phase
        if (isDay) {
            // Day time - show sun, hide moon
            this.sunElement.style.display = 'block';
            this.moonElement.style.display = 'none';

            // Calculate sun position (moves across the top half in a semicircle clockwise)
            const dayProgress = cycleProgress / nightStart; // 0 to 1 during day
            const angle = Math.PI - Math.PI * dayProgress; // PI to 0 (clockwise)

            // Calculate position on the circle (top half)
            const radius = 40; // Slightly smaller than the HUD radius
            const x = 50 + radius * Math.cos(angle); // 50 is center x
            const y = 50 - radius * Math.sin(angle); // 50 is center y, negative to go up

            // Update sun position
            this.sunElement.style.left = `${x - 10}px`; // Adjust for sun element size (20px/2)
            this.sunElement.style.top = `${y - 10}px`;
        } else {
            // Night time - show moon, hide sun
            this.sunElement.style.display = 'none';
            this.moonElement.style.display = 'block';

            // Calculate moon position (moves across the bottom half in a semicircle clockwise)
            const nightProgress = (cycleProgress - nightStart) / (1 - nightStart); // 0 to 1 during night
            const angle = 2 * Math.PI - Math.PI * nightProgress; // 2*PI to PI (clockwise)

            // Calculate position on the circle (bottom half)
            const radius = 40; // Slightly smaller than the HUD radius
            const x = 50 + radius * Math.cos(angle); // 50 is center x
            const y = 50 - radius * Math.sin(angle); // 50 is center y, negative to go up

            // Update moon position
            this.moonElement.style.left = `${x - 9}px`; // Adjust for moon element size (18px/2)
            this.moonElement.style.top = `${y - 9}px`;
        }
    }

    // Clean up resources
    dispose() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.isInitialized = false;
    }
}
