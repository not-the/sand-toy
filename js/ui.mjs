import * as PIXI from '../lib/pixi.mjs'
import { get } from "./util.mjs"
import { world, containers, spritesheet, brush, materials, filters, player } from "./main.mjs"

/** UI */
const ui = {
    data: get('./ui.json'),

    elements: {},
    x: 0,
    selection: undefined,

    get optionsVisible() { return containers.more?.visible; },

    // Element onclicks
    actions: {
        none: null,

        // World
        pause: () => world.playPause(),
        clear: () => world.clear(),

        // Brush
        brush_up: () => brush.setSize(brush.size+1),
        brush_down: () => { if(brush.size > 1) brush.setSize(brush.size-1) },
        brush_cancel_input: () => brush.cancelInput(),

        // UI
        options: (overlay=true) => {
            // Make options panel visible
            containers.more.visible = !containers.more.visible;
            containers.more.ix = containers.more.visible ? -6 : 50;

            // Update options button
            ui.elements.options.texture = ui.optionsVisible ?
                spritesheet.textures['options_pressed.png'] :
                spritesheet.textures['options.png'];

            // HTML overlay
            if(overlay) ui.actions.openOverlay();
        },
        openOverlay: () => {
            document.body.classList.toggle('show_overlay')
        },

        ticktime_up: () => world.setTicktime(1),
        ticktime_down: () => world.setTicktime(-1),

        mat_scroll_left: () => containers.mats.ix += 200,
        mat_scroll_right: () => containers.mats.ix -= 200,
    },

    // Element specific code, like filling out text
    fills: {
        brush_size: (e=ui.elements.brush_size) => e.text = brush.size,
        ticktime: (e=ui.elements.ticktime) => {
            const value = world.ticktime;
            e.text =
                value < 0 ? `${Math.abs(value)}/frame` :
                value === 0 ? 'Max' : (2 / value).toFixed(1) + 'x';
        }
    },

    build(name='options', container=containers.opts) {
        // Menu data
        const menu = this.data[name];

        // Loop elements
        for(const props of menu) {
            const element = !props.text ?
                // Sprite
                new PIXI.Sprite(
                    spritesheet.textures?.[props.src] ??
                    PIXI.Texture.from(`./artwork/${props.src}`)
                ) :
                // Text
                new PIXI.Text(props.text, {
                    fontFamily: props.fontFamily ?? 'Arial',
                    fontSize:   props.font_size ?? 3,
                    fontWeight: 700,
                    align:      props.align ?? 'center',
                    fill:       'fff',
                    lineHeight:  props.lineHeight ?? 3.5
                })

            // Text elements have increased resolution
            if(props.text) element.resolution = 24;

            // Position
            element.x = props.x ?? 0;
            element.y = props.y ?? 0;
            element.visible = props.visible ?? true;
            container.addChild(element);

            this.elements[props.id] = element;

            // Action
            if(props.action !== undefined) {
                element.eventMode = 'static';
                element.buttonMode = true;
                const handler = this.actions[props.action];
                if(handler !== null) {
                    element.cursor = 'pointer';

                    // Normal click
                    if(!props.repeats) element.on('pointerdown', handler);
                    
                    // Repeats
                    else {
                        element.on('pointerdown', () => {
                            handler();
                            element.timeout = setTimeout(() => {
                                element.interval = setInterval(() => {
                                    handler();
                                }, 50);
                            }, 300);
                        });
                        element.on('pointerup', endRepeat);
                        element.on('pointerout', endRepeat);
                        function endRepeat() {
                            clearTimeout(element.timeout);
                            clearInterval(element.interval);
                        }
                    }
                }
            }
            // Not interactive
            else {
                element.eventMode = "none";
            }

            // Fill
            const fill = ui.fills[props.id]
            if(fill !== undefined) fill(element);
        }
    },

    buildMaterials() {
        this.x = 0;
        for(const [key, value] of Object.entries(materials)) {
            // Title
            if(key.startsWith('#')) {
                this.x += 3;
                continue;
            }
        
            // Hidden
            if(value.hidden && location.hash !== "#dev") continue;
        
            // Button
            const button = new PIXI.Sprite(spritesheet.textures['tray.png']);
            button.brush = key;
            button.x = this.x;
            this.x += 16;
        
            // Icon texture
            let matTexture = spritesheet.textures[`materials/${key}.png`];
            // Fallback
            if(matTexture === undefined) {
                try {
                    matTexture = PIXI.Texture.from(`./artwork/materials/${key}.png`);
                } catch (error) {
                    console.warn(error);
                    matTexture = spritesheet.textures['materials/question.png'];
                }
            }
        
            // Material icon
            const icon = new PIXI.Sprite(matTexture);
            icon.scale.x = 0.8, icon.scale.y = 0.8, icon.x = 1;
            icon.filters = [ filters.shadow ];
            button.addChild(icon);
        
            // Label
            const label = new PIXI.Text(key.capitalize(), {
                fontFamily: 'Arial',
                fontSize: 3,
                fontWeight: 700,
                align: 'center',
                fill: 'fff'
            });
            label.anchor.x = 0.5;
            label.x = 8;
            label.y = 13;
            label.resolution = 16;

            // Small label
            if(label.width > 24) {
                label.anchor.y = -0.2;
                label.scale.set(0.6);
            }
            else if(label.width > 16) {
                label.anchor.y = -0.15;
                label.scale.set(0.8);
            }
            button.addChild(label);

            // Register
            this.elements[`material_${key}`] = button;


            // Player
            // if(!player.materials.has(key) && location.hash !== "#dev") button.visible = false;
        
        
            // Events
            button.eventMode = 'static';
            button.buttonMode = true;
            button.cursor = 'pointer';
            button.on('pointerdown', selectHandler);
            function selectHandler(event, element=this) {
                brush.setType(element.brush);
            }
            if(button.brush === brush.type) selectHandler(undefined, button);
        
            containers.mats.addChild(button);
        }
    },

    /** Destroys all UI sprites and re-builds them */
    refresh() {
        this.destroy();
        this.build('options', containers.opts);
        this.build('overlay', containers.more);
        this.build('choose_target', containers.chooseTarget);
        this.buildMaterials();
    },

    /** Destroys all UI sprites */
    destroy() {
        for(const [id, element] of Object.entries(this.elements)) {
            element.parent.removeChild(element);
        }
    }
}

export default ui;
