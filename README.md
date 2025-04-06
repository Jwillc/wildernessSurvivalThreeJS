# Testing

First craft an axe
- Walk up to a tree
- Press E to collect stick from tree
- Walk up to a rock
- Press E to pick it up
- Press C to craft axe

Open in game terminal
- Press ` to open terminal
- Type "Unlimited Logs" to enable unlimited logs

Build a structure
- Press B to enter building mode
- Press 1-5 to select building type (1: Wall, 2: Foundation, 3: Roof, 4: Window, 5: Door)
- Place foundations first (rooves are automatically added above foundations for now)
- Place walls on foundations
- Place windows on walls
- Place doors on walls
- Doors cannot be passed through at the moment

Craft a bonfire
- Press I to open the crafting menu
- Select bonfire from the list
- Make sure you have 5 logs and 5 rocks in inventory
- Press E to place bonfire
- Gather 2 rocks and a stick
- Press E to light the bonfire

Alien
- There's an ellusive alien that will stalk you
- It will hide behind trees and teleport to new hiding spots when you get too close

Tree regeneration
- Chop down a tree
- A new tree will grow somewhere else in the game ensuring you always have wood
- After chopping some trees look for little ones and watch them grow!

Thats it! That's all there is to do for now.

# Wilderness Survival

(This README is AI generated and not entirely accurate)

A first-person survival game built with Three.js where players must gather resources, craft items, and build structures to survive in a procedurally generated wilderness.

## Overview

Wilderness Survival is a browser-based 3D survival game that challenges players to survive in a procedurally generated environment. Players can gather resources, craft items, and build structures to help them survive.

## Technical Details

The game is built using the following technologies:

- **Three.js**: For 3D rendering and scene management
- **JavaScript**: Core game logic and mechanics
- **HTML/CSS**: UI elements and styling

The game features:
- First-person camera and controls
- Physics-based movement and collision detection
- Resource gathering and inventory system
- Crafting system
- Building system with snapping mechanics
- Day/night cycle

## Controls

- **W, A, S, D**: Move forward, left, backward, right
- **Mouse**: Look around
- **E**: Interact with objects/resources
- **C**: Open crafting menu
- **B**: Enter building mode
- **1, 2, 3, 4**: Select building type (in building mode)
  - 1: Wall
  - 2: Foundation
  - 3: Roof
  - 4: Window
- **R**: Rotate wall (when placing a wall in building mode)
- **Left Mouse Button**: Place building piece (in building mode)
- **Escape**: Exit current menu/mode

## Building System

The game features a robust building system that allows players to construct structures:

### Building Types
- **Foundations**: The base of any structure
- **Walls**: Vertical barriers that can be placed on foundations
- **Roofs**: Top covering for structures
- **Windows**: Openings in walls that you can see through

### Building Mechanics
- Building pieces snap together for easier construction
- Walls can be rotated by pressing R while placing
- Windows can be placed on existing walls
- Building requires resources (logs)

### Building Process
1. Press B to enter building mode
2. Select building type (1-4)
3. Position the building piece (it will appear as a transparent blueprint)
4. Press E to place the piece
5. For walls, press R to rotate before placing

## Installation

1. Clone the repository:
```
git clone https://github.com/Jwillc/wildernessSurvivalThreeJS
```

2. Navigate to the project directory:
```
cd wilderness-survival
```

3. Open the project in a local development server. You can use any of the following methods:

Using Python:
```
# Python 3
python -m http.server

# Python 2
python -m SimpleHTTPServer
```

Using Node.js (with http-server):
```
# Install http-server if you haven't already
npm install -g http-server

# Run the server
http-server
```

4. Open your browser and navigate to `http://localhost:8000` (or whatever port your server is using)

## Development

### Project Structure

```
wilderness-survival/
├── index.html          # Main HTML file
├── src/                # Source code
│   ├── main.js         # Entry point
│   ├── buildingSystem.js # Building mechanics
│   ├── inventory.js    # Inventory system
│   ├── crafting.js     # Crafting system
│   └── ...             # Other game modules
├── assets/             # Game assets
│   ├── models/         # 3D models
│   ├── textures/       # Textures
│   └── sounds/         # Sound effects and music
└── styles/             # CSS styles
```

### Adding New Features

To add new features to the game:

1. Create or modify the appropriate module in the `src` directory
2. Import the module in `main.js` if necessary
3. Initialize and update the feature in the game loop

### Building System Implementation

The building system is implemented in `src/buildingSystem.js` and includes:

- Blueprint visualization for placement preview
- Snapping logic for connecting building pieces
- Collision detection to prevent invalid placements
- Resource cost calculation and verification

## License

[MIT License](LICENSE)

## Credits

Created by AI

Three.js - https://threejs.org/
