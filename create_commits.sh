#!/bin/bash

echo "Creating nozzle feature commits..."

# 1. Add TWEEN.js dependency
git add package.json
git commit -m "Add @tweenjs/tween.js dependency for nozzle animation

🎯 Added TWEEN.js library to enable smooth motion tweening for nozzle visualization based on G-code feedrates.

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"

# 2. Core nozzle class
git add src/Renderables/nozzle.ts
git commit -m "Implement comprehensive nozzle visualization system

✨ Features:
- 3D nozzle geometry (tip, body, hot end)
- Toggle visibility functionality  
- Motion tweening with feedrate calculations
- G-code integration methods
- Configurable diameter and colors
- Isolated TWEEN Group for proper animation management

🎯 Provides realistic nozzle visualization for G-code simulation with TWEEN.js animation support.

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"

# 3. Processor integration
git add src/processor.ts
git commit -m "Integrate nozzle system with G-code processor

✨ Features:
- Position tracking system for nozzle animation
- Nozzle initialization and management
- File position synchronization
- Animation state management
- Position data capture during file processing
- Animation control methods (start/stop/skip)

🎯 Enables nozzle positioning and animation based on G-code coordinates and file position.

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"

# 4. Viewer integration
git add src/viewer.ts
git commit -m "Integrate nozzle with viewer render loop

✨ Features:
- Nozzle initialization in engine setup
- TWEEN.update() integration in render loop
- Proper 3D scene integration

🎯 Ensures nozzle animations update smoothly in the render loop.

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"

# 5. Worker and proxy
git add src/viewer.worker.ts src/viewer-proxy.ts
git commit -m "Add nozzle control methods to worker and proxy

✨ Features:
- toggleNozzle() proxy method
- startNozzleAnimation() / stopNozzleAnimation() controls
- Worker message handling for nozzle commands
- Animation state synchronization

🎯 Enables UI control of nozzle visibility and animation through the worker architecture.

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"

# 6. UI controls
git add vue_test/src/App.vue
git commit -m "Add nozzle controls to Vue test application

✨ Features:
- Show/Hide nozzle checkbox
- Synchronized animation playback controls
- Animation state management
- UI position updates during nozzle animation
- Smart position change detection for skipping

🎯 Provides user interface controls for nozzle visualization and animation.

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"

echo "All nozzle feature commits created successfully! 🎉"
echo "Use 'git log --oneline' to see the commit history."