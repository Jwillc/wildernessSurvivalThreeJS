import * as THREE from 'three';

export class DayNightCycle {
    constructor(scene, skyParams, updateSunPosition) {
        this.scene = scene;
        this.skyParams = skyParams;
        this.updateSunPosition = updateSunPosition;

        // Time settings
        this.dayDuration = 120000; // 2 minutes for a full day
        this.nightDuration = 120000; // 2 minutes for night
        this.transitionDuration = 30000; // 30 seconds for sunrise/sunset transitions

        // Cycle state
        this.isNight = false;
        this.isTransitioning = false;
        this.cycleStartTime = Date.now();
        this.pauseTime = 0;
        this.isPaused = false;

        // Callbacks
        this.onNightStart = null;
        this.onNightEnd = null;

        // Sky parameters for different times of day
        this.daySky = {
            elevation: 45,
            turbidity: 8,
            rayleigh: 1.5,
            mieCoefficient: 0.005,
            mieDirectionalG: 0.8
        };

        this.sunsetSky = {
            elevation: 5,
            turbidity: 10,
            rayleigh: 2,
            mieCoefficient: 0.005,
            mieDirectionalG: 0.8
        };

        this.nightSky = {
            elevation: -20,
            turbidity: 6,
            rayleigh: 1,
            mieCoefficient: 0.005,
            mieDirectionalG: 0.8
        };

        // Initialize with day settings
        this.setSkyParams(this.daySky);
    }

    // Set callbacks for night events
    setCallbacks(onNightStart, onNightEnd) {
        this.onNightStart = onNightStart;
        this.onNightEnd = onNightEnd;
    }

    // Set sky parameters
    setSkyParams(params) {
        this.skyParams.elevation = params.elevation;
        this.skyParams.turbidity = params.turbidity;
        this.skyParams.rayleigh = params.rayleigh;
        this.skyParams.mieCoefficient = params.mieCoefficient;
        this.skyParams.mieDirectionalG = params.mieDirectionalG;

        // Update the sun position
        this.updateSunPosition();
    }

    // Interpolate between two sets of sky parameters
    interpolateSkyParams(from, to, progress) {
        const result = {};

        for (const key in from) {
            if (from.hasOwnProperty(key) && to.hasOwnProperty(key)) {
                result[key] = from[key] + (to[key] - from[key]) * progress;
            }
        }

        return result;
    }

    // Start the day-night cycle
    start() {
        this.cycleStartTime = Date.now();
        this.isPaused = false;
    }

    // Pause the cycle
    pause() {
        if (!this.isPaused) {
            this.pauseTime = Date.now();
            this.isPaused = true;
        }
    }

    // Resume the cycle
    resume() {
        if (this.isPaused) {
            const pauseDuration = Date.now() - this.pauseTime;
            this.cycleStartTime += pauseDuration;
            this.isPaused = false;
        }
    }

    // Force a specific time of day
    setTimeOfDay(timeOfDay) {
        switch (timeOfDay) {
            case 'day':
                this.setSkyParams(this.daySky);
                this.isNight = false;
                break;
            case 'sunset':
                this.setSkyParams(this.sunsetSky);
                this.isNight = false;
                break;
            case 'night':
                this.setSkyParams(this.nightSky);
                this.isNight = true;
                if (this.onNightStart) this.onNightStart();
                break;
            default:
                console.warn(`Unknown time of day: ${timeOfDay}`);
        }
    }

    // Update the cycle
    update(deltaTime) {
        if (this.isPaused) return;

        const now = Date.now();
        const elapsed = now - this.cycleStartTime;
        const totalCycleDuration = this.dayDuration + this.nightDuration;

        // Calculate cycle progress (0 to 1)
        const cycleProgress = (elapsed % totalCycleDuration) / totalCycleDuration;

        // Calculate day/night phase
        const dayStart = 0;
        const sunsetStart = (this.dayDuration - this.transitionDuration) / totalCycleDuration;
        const nightStart = this.dayDuration / totalCycleDuration;
        const sunriseStart = (totalCycleDuration - this.transitionDuration) / totalCycleDuration;

        // Update sky based on current phase
        if (cycleProgress >= dayStart && cycleProgress < sunsetStart) {
            // Day time
            if (this.isNight) {
                this.isNight = false;
                if (this.onNightEnd) this.onNightEnd();
            }
            this.setSkyParams(this.daySky);
            this.isTransitioning = false;
        }
        else if (cycleProgress >= sunsetStart && cycleProgress < nightStart) {
            // Sunset transition
            const transitionProgress = (cycleProgress - sunsetStart) / (nightStart - sunsetStart);
            const params = this.interpolateSkyParams(this.daySky, this.nightSky, transitionProgress);
            this.setSkyParams(params);
            this.isTransitioning = true;

            // Trigger night start exactly at night start
            if (!this.isNight && transitionProgress >= 1) {
                this.isNight = true;
                if (this.onNightStart) this.onNightStart();
            }
        }
        else if (cycleProgress >= nightStart && cycleProgress < sunriseStart) {
            // Night time
            if (!this.isNight) {
                this.isNight = true;
                if (this.onNightStart) this.onNightStart();
            }
            this.setSkyParams(this.nightSky);
            this.isTransitioning = false;
        }
        else {
            // Sunrise transition
            const transitionProgress = (cycleProgress - sunriseStart) / (1 - sunriseStart);
            const params = this.interpolateSkyParams(this.nightSky, this.daySky, transitionProgress);
            this.setSkyParams(params);
            this.isTransitioning = true;

            // Trigger night end exactly at day start
            if (this.isNight && transitionProgress >= 1) {
                this.isNight = false;
                if (this.onNightEnd) this.onNightEnd();
            }
        }
    }
}
