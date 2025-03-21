import * as PIXI from '../lib/pixi.mjs'

import { spritesheet, materials, controls } from "./main.mjs"
import ui from "./ui.mjs"
import { distance } from './util.mjs';

/** Brush */
const brush = {
    indicator: new PIXI.Graphics(),

    // Type
    type: 'sand',
    get material() { return materials[this.type]; },
    setType(type) {
        this.type=type;

        let element = ui.elements[`material_${type}`];
        
        if(ui.selection !== undefined) {
            ui.selection.texture = spritesheet.textures['tray.png'];
            ui.selection.children[1].style.fill = 'fff';
        }
        element.texture = spritesheet.textures['selection.png'];
        element.children[1].style.fill = '000';
        ui.selection = element;

        // Material brush size
        const matBrushSize = this.material.brush_size;
        if(matBrushSize) {
            this.setSize(matBrushSize);
            this.sizeWasSetByMaterial = true;
        }
        else if(this.sizeWasSetByMaterial) {
            this.setSize(3);
            this.sizeWasSetByMaterial = false;
        }
    },

    // Size
    size: 3,
    sizeWasSetByMaterial: false,
    setSize(value) {
        this.size = value;
        this.indicator.clear().lineStyle(1, 0x000000).drawRect(0, -1, brush.size+1, brush.size+1).endFill();
        // document.getElementById("size").value = value;

        // Update UI
        ui.fills.brush_size();
    },

    /** Draws using user's brush material (brush.type) */
    draw(x, y) {
        // Get pixel
        const pixel = world.getPixel(x, y);
        if(!pixel) return;

        // Check
        if(controls.mouse.drawing && brush.material.placement === 'once') return;
        controls.mouse.drawing = true;
        const {size, type} = brush;

        // Line drawing algorithm
        if(!brush.material.placement !== 'once') {
            const [dist, distX, distY] = distance(controls.lastMouse, controls.mouse);

            // Draw line between points
            const steps = Math.floor(dist);
            for(let i = 0; i < steps; i++) {
                const progress = i/steps;
                const pos = {
                    x: Math.ceil(pixel.x + distX * progress),
                    y: Math.ceil(pixel.y + distY * progress)
                }

                const between = world.getPixel(pos.x, pos.y);
                between?.forRegion(size, handleDraw)
            }
        }

        // Paint area
        pixel.forRegion(size, handleDraw);

        /** Draw handler function */
        function handleDraw(x, y) {
            // Material brush_replace property is false
            if(
                !world.brushReplace && brush.type !== 'air' ||
                materials[type].brush_replace === false
            ) {
                if(world.getPixel(x, y)?.type !== 'air') return;
            }
            world.run(x, y, 'set', type, undefined, undefined, true);
        }
    }
}

export default brush;
