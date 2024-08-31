import * as PIXI from '../lib/pixi.mjs'

import { spritesheet, materials } from "./main.mjs"
import ui from "./ui.mjs"

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
    },

    // Size
    size: 3,
    setSize(value) {
        this.size = value;
        this.indicator.clear().lineStyle(1, 0x000000).drawRect(0, -1, brush.size+1, brush.size+1).endFill();
        // document.getElementById("size").value = value;

        // Update UI
        ui.fills.brush_size();
    }
}

export default brush;
