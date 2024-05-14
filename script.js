// DOM
const gamespace = document.getElementById("game");

/** Get JSON - https://stackoverflow.com/a/22790025/11039898
 * @param {string} url JSON file URL
 * @param {boolean} parse Whether or not to convert into a JS object
 * @returns 
 */
function get(url, parse=true){
    var rq = new XMLHttpRequest(); // a new request
    rq.open("GET", url, false);
    rq.send(null);
    return parse ? JSON.parse(rq.responseText) : rq.responseText;          
}

/** Distance between two points
 * @param {object|Pixel} one Object one
 * @param {object|Pixel} two Object two
 * @returns {Array} Array [distance, distX, distY]
 */
function distance(one, two) {
    let distX = one.x - two.x;
    let distY = one.y - two.y;
    return [Math.hypot(distX, distY), distX, distY];
}

/** Interpolation function. Will return target value if values are within 1 of eachother */
function lerp(a, b, alpha) { return Math.abs(b-a)<1?b : a + alpha * (b - a); }

/** RGB color mix */
function colorMix(color1, color2, percent=0.5) {
    percent = Math.min(1, Math.max(0, percent)); // Keep within 0-1 range

    const r = Math.round(color1.r + (color2.r - color1.r) * percent);
    const g = Math.round(color1.g + (color2.g - color1.g) * percent);
    const b = Math.round(color1.b + (color2.b - color1.b) * percent);

    return { r, g, b };
}

function rgbToHex({ r, g, b }) {
    return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

/** If the value is an array it will return a random item from the array, otherwise returns value */
function parse(value) {
    return Array.isArray(value) ? value[Math.floor(Math.random() * value.length)] : value;
}

/** Returns a random item from an array
 * @returns {any}
 */
Array.prototype.random = function() {
    return this[Math.floor(Math.random() * this.length)];
}

/** Returns the string with the first character capitalized, the original string is unchanged
 * @returns {String}
 */
String.prototype.capitalize = function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
}


// Canvas size
const viewWidth = 1280, viewHeight = 800, UIHeight = 80;

// World Size. Width/height are pulled from URL parameters if available
let width = 128, height = 72;
let params = location.search.substring(1).split(',');
if(location.search !== '') [width, height] = [Number(params[0]), Number(params[1])];


/** Pixel scale */
let scale = viewWidth/width;


// PIXI.JS setup
const app = new PIXI.Application({
    width: viewWidth,
    height: viewHeight,
    antialias: false,
    useContextAlpha: false
});
PIXI.BaseTexture.defaultOptions.scaleMode = PIXI.SCALE_MODES.NEAREST;
app.renderer.background.color = 0x1A2839;
app.renderer.clearBeforeRender = false;
gamespace.appendChild(app.view);
let canvas = document.querySelector('canvas');

// Spritesheet
let atlas = get('./assets/sheet.json');
const spritesheet = new PIXI.Spritesheet(
	PIXI.BaseTexture.from(`./assets/${atlas.meta.image}`), atlas
);
spritesheet.parse();


/** PIXI Filters */
const filters = {
    'bloom': new PIXI.filters.AdvancedBloomFilter({
        threshold: 0.7,
        // threshold: 0,
        bloomScale: 1,
        brightness: 1,
        blur: 2,
        quality: 8,
        kernels: null,
        pixelSize: 0.5*scale
    }),
    'shadow': new PIXI.filters.DropShadowFilter({
        distance: 5,
        color: '000',
        alpha: 0.5,
        blur: 1,
        rotation: 90,
    })
}

// PIXI Sounds
const sounds = {
    "thunder1": {
        src: "./assets/sfx/thunder1.mp3",
        volume: 0.5
    },
    "thunder2": {
        src: "./assets/sfx/thunder2.mp3",
        volume: 0.5
    },
    "thunder3": {
        src: "./assets/sfx/thunder3.mp3",
        volume: 0.5
    },
    "explosion1": {
        src: "./assets/sfx/explosion1.mp3",
        volume: 0.2
    },
    // "fire": {
    //     src: "./assets/sfx/fire.mp3",
    //     volume: 0.7,
    //     loop: true,
    //     type: "fade"
    // },
}
// Register sounds
for(let [key, {src}] of Object.entries(sounds)) PIXI.sound.add(key, src);

/** Audio methods */
const sound = {
    recents: {},
    play(name, volume) {
        if(this.recents[name] > Date.now()-100) return; // Already played sound within last 100ms

        let options = {
            volume: volume ?? sounds[name].volume,
            loop: sounds[name].loop,
            complete: () => console.log(name + ' complete')
        }

        let s;

        // if(options.stereo_x !== undefined) {
        //     let stereo = (options.stereo_x - (containerGame.x*-1))/1200;
        //     options.filters = [
        //         new PIXI.sound.filters.StereoFilter(stereo)
        //     ];
        // }
        try { s = PIXI.sound.play(name, options); }
        catch (error) { console.error(error); }

        this.recents[name] = Date.now();
        return s;
    }
}

// let SFXFire;
// sound.play('fire').then(res => SFXFire = res);

/** PIXI.Container shorthand */
class Container extends PIXI.Container {
    constructor(properties={}, parent=app.stage) {
        super();

        // Assign properties
        for(let [key, value] of Object.entries(properties)) {
            if(key === 'scale') {
                this.scale.x = value;
                this.scale.y = value;
            }
            else this[key] = value;
        }

        parent.addChild(this); // Add to parent
    }
}

/** World container */
const worldContainer = new Container({
    interactiveChildren: false,
    width, height, scale,
    filters: [ filters.bloom ]
}, undefined);

const fgContainer = new Container({
    interactiveChildren: false,
    width, height, scale
})

/** Bloom filter container */
// const bloomContainer = new PIXI.Container();
// bloomContainer.width = width;
// bloomContainer.height = height;
// worldContainer.addChild(bloomContainer);

/** UI container */
const UIContainer   = new Container({ y:viewHeight-UIHeight, eventMode:'static' });
const matsContainer = new Container({ ix:0, scale:5 }, UIContainer); // Materials container
const optsContainer = new Container({ scale:5 }, UIContainer); // Additional UI      
const moreContainer = new Container({ y:-90, scale:5, ix:50, visible:false, filters:[ filters.shadow ] }, UIContainer); // Toggle panel

// Click-and-drag to scroll through materials list
let dragOrigin = 0
UIContainer.on('pointerdown', () => {
    pressed['ui_dragging'] = true;
    dragOrigin = mouse.x;
});


let uiX = 0;
let uiSelection;

/** UI */
const ui = {
    data: get('./ui.json'),

    elements: {},

    get optionsVisible() { return moreContainer?.visible; },

    // Element onclicks
    actions: {
        none: null,
        pause: () => world.playPause(),
        clear: () => world.clear(),
        brush_up: () => brush.setSize(brush.size+1),
        brush_down: () => { if(brush.size > 1) brush.setSize(brush.size-1) },

        options: (overlay=true) => {
            // Make options panel visible
            moreContainer.visible = !moreContainer.visible;
            moreContainer.ix = moreContainer.visible ? -6 : 50;

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
    },

    // Element specific code, like filling out text
    fills: {
        brush_size: (e=ui.elements.brush_size) => e.text = brush.size,
        ticktime: (e=ui.elements.ticktime) => {
            let value = world.ticktime;
            e.text =
                value < 0 ? `${Math.abs(value)}/frame` :
                value === 0 ? 'Max' : (2 / value).toFixed(1) + 'x';
        }
    },

    build(name='options', container=optsContainer) {
        const menu = this.data[name];
        for(let props of menu) {
            let element = !props.text ?
                new PIXI.Sprite(spritesheet.textures[props.src]) :
                new PIXI.Text(props.text, {
                    fontFamily: 'Arial',
                    fontSize: props.font_size ?? 3,
                    fontWeight: 700,
                    align: 'center',
                    fill: 'fff'
                })

            if(props.text) element.resolution = 24;

            element.x = props.x ?? 0;
            element.y = props.y ?? 0;
            container.addChild(element);

            this.elements[props.id] = element;

            // Action
            if(props.action !== undefined) {
                element.eventMode = 'static';
                element.buttonMode = true;
                let handler = this.actions[props.action];
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

            // Fill
            let fill = ui.fills[props.id]
            if(fill !== undefined) fill(element);
        }
    },

    buildMaterials() {
        uiX = 0;
        for(let [key, value] of Object.entries(materials)) {
            // Title
            if(key.startsWith('#')) {
                uiX += 3;
                continue;
            }
        
            // Hidden
            if(value.hidden && location.hash !== "#dev") continue;
        
            // Button
            let button = new PIXI.Sprite(spritesheet.textures['tray.png']);
            button.brush = key;
            button.x = uiX;
            uiX += 16;
        
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
            let icon = new PIXI.Sprite(matTexture);
            icon.scale.x = 0.8, icon.scale.y = 0.8, icon.x = 1;
            icon.filters = [ filters.shadow ];
            button.addChild(icon);
        
            // Label
            let label = new PIXI.Text(key.capitalize(), {
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
            button.addChild(label);

            // Register
            this.elements[`material_${key}`] = button;


            // Player
            // if(!player.materials[key] && location.hash !== "#dev") button.visible = false;
        
        
            // Events
            button.eventMode = 'static';
            button.buttonMode = true;
            button.cursor = 'pointer';
            button.on('pointerdown', selectHandler);
            function selectHandler(event, element=this) {
                brush.setType(element.brush);
            }
            if(button.brush === brush.type) selectHandler(undefined, button);
        
            matsContainer.addChild(button);
        }
    },

    refresh() {
        ui.destroy();
        ui.build('options', optsContainer);
        ui.build('overlay', moreContainer);
        ui.buildMaterials();
    },

    destroy() {
        for(let [id, element] of Object.entries(this.elements)) {
            element.parent.removeChild(element);
        }
    }
}


/** Material data (colors, properties, interaction/movement rules, etc.) */
const materials = get('./materials.json');

// Controls
let mouse = {x:0,y:0};
let lastMouse = {x:0,y:0};
let panStart = {x:0,y:0};
/** Pressed keys */
let pressed = {};


/** World state/methods */
const world = {
    /** 2D array where all pixels are stored */
    grid: [],
    // ticks: {}, // Pixels that need updating (unused)

    paused: false,

    // Configuration
    brushReplace: true,
    waterShading: false,
    
    make(data=Array(width).fill(null).map(()=>Array(height).fill('q'))) {
        this.grid = [];

        // Populate world with air pixels
        for(let yi = 0; yi < height; yi++) {
            world.grid.push([]);
            for(let xi = 0; xi < width; xi++) {
                let pixel = new Pixel(xi, yi);
                world.grid[yi][xi] = pixel;
            }
        }
    },

    import(data) {
        // Populate world with air pixels
        for(let yi in data) {
            let col = data[yi];
            for(let xi in col) {
                let pixelType = col[xi];
                run(xi, yi, 'set', pixelType);
            }
        }
    },

    export() {
        let output = [];
        for(let col of world.grid) {
            output.push([]);
            for(let p of col) {
                output.push(p.type);
            }
        }

        console.log(output);
    },

    // Tick time
    tt_options: [12, 4, 3, 2, 1.25, 1, 0], // Game speed options
    // tt_options: [12, 4, 3, 2, 1.25, 1, 0, -2, -4, -5, -8, -12],
    tt_index: 3, // Game speed preference index (for array above)
    ticktime: 2, // Number of frames each tick takes to happen
    setTicktime(dir) {
        this.tt_index -= dir;
        let value = this.tt_options[this.tt_index];
        if(value === undefined) return this.tt_index += dir;

        // Set
        this.ticktime = value;

        // Update UI
        ui.fills.ticktime();
        if(!ui.optionsVisible && dir !== 0) ui.actions.options(false);
    },

    /** Toggle pause */
    playPause() {
        this.paused = !this.paused;
        ui.elements.pause.texture = this.paused ?
            spritesheet.textures['play.png'] :
            spritesheet.textures['pause.png'];
    },

    /** Sets entire screen to air */
    clear() {
        this.forAll(p => p.set('air'));
    },

    forAll(callback) {
        for(let yi in world.grid) for(let p of world.grid[yi]) callback(p);
    }
}


/** Shorthand for running a method on the pixel at the given coordinates
 * @param {number} x Pixel X coordinate
 * @param {number} y Pixel Y coordinate
 * @param {string} method Method name (string)
 * @param  {...any} params Method parameters
 * @returns 
 */
function run(x, y, method='set', ...params) {
    return world.grid?.[y]?.[x]?.[method]?.(...params);
}
/** Returns the pixel at the provided coordinates
 * @param {number} x Pixel X coordinate
 * @param {number} y Pixel Y coordinate
 * @returns {Pixel|undefined} Pixel or undefined
 */
function getPixel(x, y) { return world.grid?.[y]?.[x]; }


/** Pixel class */
class Pixel extends PIXI.Sprite {
    constructor(x, y, type='air') {
        super(PIXI.Texture.WHITE);
        
        this.type = type;
        this.mat = materials[type];
        this.height = 1; this.width = 1;
        this.x = x;
        this.y = y;
        this.data = {
            age:0
        }; // Data that gets passed around as pixels move

        this.set(type);
        worldContainer.addChild(this);
    }

    // Unique behavior
    actions = {
        /** Streaks in glass */
        glassColoration: p => p.setColor(p.mat.colors[
            (p.x + p.y) % 16 <= 2 ||
            (p.x + p.y) % 16 === 5
            ?
            1:0
        ])
    }

    /** Set a pixel to a material
     * @param {string} type Material name
     * @param {string} preColor If defined this will be used as the color value instead of a random value
     */
    set(type, preColor, fresh) {
        // let this = grid?.[this.y]?.[this.x];
        if(this === undefined || (this?.type === type && this?.type !== 'air')) return;

        // Material data
        this.mat = materials[type];

        // Color
        const color = preColor ?? this.mat.colors[Math.floor(Math.random() * this.mat.colors.length)];
        this.alpha = this.mat?.alpha ?? 1;
        this.setColor(color);
    
        // State
        this.type = type;
        if(this.mat?.gas === true || fresh !== undefined) this.fresh = fresh??1;

        // Brand new pixel
        if(preColor === undefined) this.data.age = 0;

        // SFX
        if(this.mat?.sfx !== undefined) {
            let place = this.mat?.sfx?.place;
            if(place && preColor === undefined) sound.play(parse(place));
        }


        // Event
        if(this.mat?.onset !== undefined) this.actions[this.mat.onset](this);

        // if(this.mat?.glows === true && this.parent === worldContainer) {
        //     this.parent.removeChild(this);
        //     bloomContainer.addChild(this);
        // }
        // else if(!this.mat?.glows && this.parent === bloomContainer) {
        //     this.parent.removeChild(this);
        //     worldContainer.addChild(this);
        // }

        // Register pixel
        // let key = `${this.x},${this.y}`;
        // if('moves' in this.mat || 'despawn_chance' in this.mat || 'reacts' in this.mat) world.ticks[key] = this;
        // else delete world.ticks[key];


        // Player unlock
        // if(player.materials[type] !== true) player.unlock(type);
    }

    setColor(color=0x000000) {
        this.tint = color;
    }

    /** Performs a function over a region
     * @param {number} size Size of the area
     * @param {function} callback Function to run on each pixel
     * @param {boolean} centered If falsy the current pixel will be the region's top left instead of center
     */
    forRegion(size=3, callback, centered=true) {
        if(callback === undefined) return console.warn(new Error('No callback specified'));
        size -= 1; // Size needs to have 1 subtracted

        let {x, y} = this;
        // Center on given pixel
        if(centered) {
            x-=Math.ceil(size/2);
            y-=Math.ceil(size/2);
        }

        // Loop region
        loopX: for(let mx = size; mx >= 0; mx--)
            loopY: for(let my = size; my >= 0; my--)
                if(callback(x+mx, y+my, x, y) === true) break loopX;
    }

    /** Draws using user's brush material */
    draw() {
        mouse.drawing = true;
        let {size, type} = brush;

        // Inbetween
        // let [dist, distX, distY] = distance(mouse, lastMouse);
        // console.log(dist);

        // Draw line between points
        // for(let i = 0; i < Math.ceil(dist); i++) {
        //     let progress = 0.1;
        //     var p = {
        //         x: Math.ceil(this.x + distX * progress),
        //         y: Math.ceil(this.y + distY * progress)
        //     }

        //     let between = getPixel(p.x, p.y);
        //     between?.forRegion(size, (x, y) => {
        //         run(x, y, 'set', 'ice');
        //     })
        // }

        this.forRegion(size, (x, y) => {
            if(!world.brushReplace && brush.type !== 'air' || materials[type].brush_replace === false) if(getPixel(x, y)?.type !== 'air') return;
            run(x, y, 'set', type);
        })
    }

    /** Despawn */
    despawn() {
        // if(this.mat?.min_despawn_age > this.data.age) return;
        this.set(parse(this.mat?.despawn_conversion) ?? 'air')
    }

    /** Updates a pixel by acting out its movement and interaction rules */
    tick() {
        if(this.fresh) {
            if(this.fresh > 1) this.fresh--;
            else delete this.fresh;
            return;
        }

        this.moving = false;

        // Track pixel's age
        if(this.mat?.despawn_timer) this.data.age += 1;

        // Despawn chance
        if(this.mat?.despawn_chance !== undefined) {
            if(Math.random() <= this.mat.despawn_chance) return this.despawn();
        }

        // Despawn timer
        if(this.mat?.despawn_timer !== undefined) {
            if(this.data.age >= this.mat.despawn_timer) return this.despawn();
        }


        // Reacts
        if(/*this.mat?.reacts !== undefined*/ this.type !== 'air') {
            // console.log('#####');

            let radius = this.mat?.reaction_radius ?? 3;
            this.forRegion(radius, (x, y) => {
                // Don't test current pixel
                if(this.x === x && this.y === y) return;

                // Testing pixel
                let dest = getPixel(x, y);
                // console.log(dest?.type);
                if(dest === undefined) return;

                // Convert
                let conversion = dest.mat?.reacts?.[this?.type];
                if(conversion === undefined) return;

                // Roll chance
                if(conversion.chance === undefined || Math.random() <= conversion.chance ) {
                    dest.set(parse(conversion.to));
                }
            }, true);
            // console.log('#####');
        }


        // Movement
        if(this.mat?.moves !== undefined) {
            let cx = 0;
            let cy = 0;

            // Move chance
            if(this.mat?.move_chance === undefined || Math.random() < this.mat.move_chance) {
                // Move checks
                for(let m of this.mat.moves) {
                    let moveX = parse(m.x), moveY = parse(m.y);

                    // Test if destination is valid
                    let dest = getPixel(this.x+moveX, this.y+moveY);
                    if(dest === undefined || (dest.mat?.float < this.mat.float || dest.mat?.float === undefined || dest?.type === this.type)) continue;
                    cx = moveX,
                    cy = moveY;
                    break;
                }

                // Move
                this.move(cx, cy);
            }
        }




        // MATERIAL SPECIFIC
        // Acid
        if(this.type === 'acid') {
            // Dissolve below
            if(Math.random() < this.mat.acid_chance) {
                // Despawn
                if(Math.random() < 0.3) this.set('air');

                // Move
                let notAcid = p => p?.type !== 'acid';
                if(this.move(0, 1, notAcid) !== 0) {
                    this.set('air');
                }
            }
        }


        // Wire/electricity
        else if(this.type === 'electricity') {
            this.forRegion(3, (x, y, ox, oy) => {
                const dest = getPixel(x, y);
                if(
                    dest !== undefined &&
                    // dest?.type === 'wire' &&
                    x !== this.x || y !== this.y
                ) {
                    if(dest?.type === 'wire') {
                        dest.set('electricity', undefined);
                        this.set('wire', undefined);
                        return true;
                    }
                }
            })
        }

        // Explosion
        else if(this.type === 'explosion') {
            this.forRegion(9, (x, y) => {
                let type = ['fire', 'smoke']
                // this.set(type.random());
                run(x, y, 'set', type.random());
            })
        }

        // Lightning
        else if(this.type === 'lightning') {
            let seed = this;

            while (seed?.type === 'lightning') {
                const spread = (dest) => {
                    if(
                        dest !== undefined &&
                        (
                            dest?.type === 'air' ||
                            dest?.type === 'lightning' ||
                            dest?.type === 'lightning plasma')
                        ) {
                        seed.set('lightning plasma');
                        dest.set('lightning', seed.tint);
                    }
                    else seed.set('lightning plasma');
    
                    seed = dest;
                }
    
                let pos = parse(seed.mat.behavior);
                let dest = getPixel(seed.x+pos.x, seed.y+pos.y);
                spread(dest);

                // Despawn chance
                if(Math.random() <= this.mat.despawn_chance) this.despawn();
            }
        }

        else if(this.type === 'lightning plasma' || this.type === 'laser plasma') {
            this.alpha = (1 - this.data.age/15) ** 2.2;
        }

        else if(this.type === 'laser') {
            let seed = this;

            while (seed?.type === 'laser') {
                const spread = (dest) => {
                    if(
                        dest !== undefined &&
                        (
                            dest?.type === 'air' ||
                            dest?.type === 'laser' ||
                            dest?.type === 'laser plasma' ||
                            dest?.type === 'laser glow')
                        ) {
                        seed.set('laser plasma');
                        dest.set('laser');
                    }
                    else seed.set('laser plasma');
    
                    seed = dest;
                }
    
                let dir = this.data.direction ?? "down";
                
                // const adj = this.getRelative();
                // if(adj.down?.type === 'glass' && adj.left?.type === 'glass') {
                //     if(dir === 'down') dir = 'right'; // Right
                //     else if(dir === 'left') dir = 'up'; // Up
                // }
                // if(adj.down?.type === 'glass' && adj.right?.type === 'glass') pos = seed.mat.behavior = 'left'; // Left
                // if(adj.down?.type === 'glass' && adj.right?.type === 'glass') pos = seed.mat.behavior = 'left'; // Up

                
                this.data.direction = dir;

                let pos = seed.mat.behavior[dir];
                let dest = getPixel(seed.x+pos.x, seed.y+pos.y);
                spread(dest);

                // Despawn chance
                if(Math.random() <= this.mat.despawn_chance) this.despawn();
            }
        }

        // Mud grows grass
        else if(this.mat.grows_grass) {
            // Random chance
            if(Math.random() >= 0.995) {

                let above = getPixel(this.x, this.y-1);
                let below = getPixel(this.x, this.y+1);

                if(above !== undefined && above?.mat?.air /* && !this.moving*/) this.set('grass seeds');
            }
        }

        // Grass seeds
        else if(this.type === 'grass seeds') {
            let above = getPixel(this.x, this.y-1);
            let below = getPixel(this.x, this.y+1);
            if(above === undefined || !above?.mat?.air && below?.type !== 'mud' && below?.type !== 'grass') return;

            // Grow
            if(Math.random() >= 0.7) {
                this.move(0, -1);
            }
            // Replace
            this.set('grass');

            // Grow downward
            if(Math.random() >= 0.6) run(this.x, this.y+1, "set", "grass")
        }

        // Grass
        else if(this.type === 'grass') {
            if(Math.random() >= 0.9) {
                let above = getPixel(this.x, this.y-1);

                if(!above?.mat?.air && above?.type !== 'grass') this.set('mud');
            }
        }

        // Water waves
        else if(this.type === 'water' && world.waterShading) {
            // const colors = this.mat.colors;
            // let phase = ( (Math.sin(Math.sqrt(elapsed)+elapsed/200 + this.y+(this.x % 8)) ) / 2 + 0.5 ) * Math.abs(Math.cos(elapsed/150 + this.y) * 45);
            // let phase = Math.sin(elapsed*50 + ((this.y/0.5) / this.x*100));

            // Circles
            // let phase = distance(this, world.grid[30][Math.round(elapsed/5%10+25)])[0] / 10 % (elapsed/100 % 1);

            // let phase =
            //     this.x % 5 === 0 &&
            //     this.y === Math.round(elapsed/3) % world.grid.length - this.x%9
            //     ? 1 : 0

            // let phase =
            //     Math.sign(Math.sin(elapsed*5 / this.y)) === 1 &&
            //     Math.sign(Math.sin(elapsed*5 / this.x)) === 1
            //     ? 1 : 0;

            let period = 70;
            // let phase = Math.cos( (-elapsed/period) + this.x + Math.sqrt(this.y*100)*elapsed/100);

            // Godrays
            // let godrays = Math.sin(elapsed/period + this.x/5) + Math.cos(elapsed/period + this.y/5-(this.x));

            // Horizontal movement
            let offset = (this.y);
            offset = offset % 4 !== 0 ? offset + 2 : offset;
            let h_movement;

            // Normal horizontal
            if(!world.grid?.[this.y+1]?.[this.x]?.mat?.air) {
                h_movement = Math.sin(elapsed/period + this.y/0.45) + Math.cos(elapsed/period + this.x/6-offset);
            }
            // Falling
            else {
                h_movement = Math.sin(-elapsed/20 + this.x/0.45) + Math.cos(-elapsed/period + this.y/6-this.x);
            }

            // let phase = (h_movement+h_movement+h_movement+godrays) / 3; // Average
            let phase = h_movement;
            if(phase < 0.3) phase = 0; // Min Threshold

            // let phase = Math.cos(elapsed/period + this.x/5) + Math.cos(elapsed/period + Math.pow(this.y, this.x/50)/5-(this.x));

            // let phase = Math.sin((elapsed/period) + this.x/this.y*20);

            // let color = colorMix({r: 51, g: 136, b: 221}, {r: 68, g: 144, b: 225}, phase);
            let color = colorMix(
                {r: 51, g: 136, b: 221},
                {r: 90, g: 170, b: 225},
                phase
            );
            this.setColor(color);
        }
    }

    getRelative() {
        return {
            "down":     getPixel(this.x+0, this.y+1),
            "right":    getPixel(this.x+1, this.y+1),
            "up":       getPixel(this.x+0, this.y-1),
            "left":     getPixel(this.x-1, this.y+1),
        }
    }

    /** Swaps two pixels' positions
     * @param {number} cx Destination X coordinate
     * @param {number} cy Destination Y coordinate
     */
    move(cx=0, cy=0, condition) {
        // Get destination pixel
        let dest_x = this.x+cx;
        let dest_y = this.y+cy;
        let dest = world.grid?.[dest_y]?.[dest_x];

        // Invalid move
        if(condition !== undefined) if(!condition(dest)) return 0;
        if(dest === undefined || dest_y > height || dest_x > width || dest_x < 0 || dest_y < 0) return 0;

        // Swap
        let replacing = dest.type;
        [dest.data, this.data] = [this.data, dest.data];
        dest.set(this.type, this.tint);
        this.set(replacing);

        // State
        this.moving = true;
    }
}


/** Brush indicator */
let indicator = new PIXI.Graphics();
indicator.x = -100; indicator.y = -100
fgContainer.addChild(indicator);


/** Brush */
const brush = {
    // Type
    type: 'sand',
    setType(type) {
        this.type=type;

        let element = ui.elements[`material_${type}`];
        
        if(uiSelection !== undefined) {
            uiSelection.texture = spritesheet.textures['tray.png'];
            uiSelection.children[1].style.fill = 'fff';
        }
        element.texture = spritesheet.textures['selection.png'];
        element.children[1].style.fill = '000';
        uiSelection = element;
    },

    // Size
    size: 3,
    setSize(value) {
        this.size = value;
        indicator.clear().lineStyle(1, 0x000000).drawRect(0, -1, brush.size+1, brush.size+1).endFill();
        // document.getElementById("size").value = value;

        // Update UI
        ui.fills.brush_size();
    }
}


// Player
// let player = {
//     materials: {
//         "air": true,
//         "stone": true,
//         "water": true,
//         "dirt": true,
//         "fire": true
//     },

//     unlock(type) {
//         this.materials[type] = true;
//         ui.elements[`material_${type}`].visible = true;
//         // ui.refresh();
//     }
// }

// Setup
ui.refresh();

brush.setSize(3);
// brush.setSize(1);

// Create world
// world.setTicktime(0);
world.make();



// Ticker
let elapsed = 0; // Time elapsed since page load
let last_tick = 0; // Time since last world update
app.ticker.add(delta => {
    // Draw
    if(pressed['click'] && !pressed['ui_dragging']) run(mouse.x, mouse.y, 'draw');
    else mouse.drawing = false;


    // UI
    matsContainer.x = lerp(matsContainer.x, matsContainer.ix, 0.3*delta);
    moreContainer.x = lerp(moreContainer.x, moreContainer.ix, 0.3*delta);

    let max = ( matsContainer.width - app.view.width + ( (ui.elements?.bg.width ?? 0)*5 ) ) * -1;
    if(matsContainer.x > 0) {
        matsContainer.ix /= 1.5;
        if(matsContainer.ix < 0) matsContainer.ix = 0;
    }
    else if(matsContainer.x < max) {
        matsContainer.ix = max;
    }

    // Indicator
    indicator.alpha = (Math.abs(Math.sin(elapsed/20)+1)/20)+0.2;

    // Elapsed
    elapsed += delta;
    if(world.paused) return;

    // Tick
    if(elapsed >= last_tick+world.ticktime) {

        // Multiple ticks
        // for(let mti = 0; mti < (world.ticktime < 0 ? Math.abs(world.ticktime) : 1); mti++) {
            // Loop all
            for(let xi = world.grid.length-1; xi >= 0; xi--) {
                for(let yi = world.grid[xi].length-1; yi >= 0; yi--) {
                    run(Number(yi), Number(xi), 'tick');
                }
            }
        // }


        // Loop world.ticks registry
        // for(let p of Object.values(world.ticks)) p.tick();

        last_tick = elapsed;
    }
})


// ----- Event Listeners ----- //
canvas.addEventListener('pointerdown', pointerHandler);
document.addEventListener('pointerup', pointerHandler);

function pointerHandler(event) {
    moveHandler(event);

    const clickIDs = ['click', 'middle_click', 'right_click'];
    const id = clickIDs[event.button];

    event.type === "pointerdown" ?
        pressed[id] = true :
        delete pressed[id];

    if(id === 'middle_click' && event.type === "pointerdown") {
        let targetPixel = getPixel(mouse.x, mouse.y);
        // Get type
        console.log(`
${targetPixel.type}
Moving: ${targetPixel.moving}
Fresh:  ${targetPixel.fresh}
        `);

        brush.setType(targetPixel.type);

        // Pan camera
        // panStart.x = mouse.x, panStart.y = mouse.y;
    }
}

canvas.addEventListener('wheel', event => {
    event.preventDefault();
    matsContainer.ix -= event.deltaY;
})

// canvas.addEventListener('contextmenu', event => {
//     event.preventDefault();
// })

// Leave page
document.addEventListener("mouseleave", () => {
    indicator.visible = false;
})

// Events
canvas.addEventListener('pointermove', moveHandler);
document.addEventListener('touchend', () => delete pressed['ui_dragging']);
function moveHandler(event) {
    const marginLeft = (document.body.scrollWidth-canvas.scrollWidth)/2;

    const mouseX = event.clientX - canvas.offsetLeft - marginLeft;
    const mouseY = event.clientY - canvas.offsetTop + window.scrollY;

    // Last position
    lastMouse.x = mouse.x, lastMouse.y = mouse.y, lastMouse.drawing = mouse.drawing;
    
    // scale mouse coordinates to canvas coordinates
    mouse.x = Math.floor(mouseX * canvas.width / canvas.clientWidth / scale);
    mouse.y = Math.floor(mouseY * canvas.height / canvas.clientHeight / scale);

    // Indicator
    indicator.x = mouse.x - Math.floor(brush.size/2)-0.5;
    indicator.y = mouse.y+1 - Math.floor(brush.size/2)-0.5;
    indicator.visible = true;


    // UI touch scroll
    if(!pressed['ui_dragging'] || event.type !== 'pointermove') return;

    // Scroll
    matsContainer.ix += (dragOrigin - mouse.x)*-0.5;

    // End drag
    if(!pressed['click']) delete pressed['ui_dragging'];
}

document.addEventListener('keydown', event => {
    if(event.key === " ") world.playPause();

    // Tickrate
    else if(event.key === 'ArrowLeft') world.setTicktime(1);
    else if(event.key === 'ArrowRight') world.setTicktime(-1);

    // Brush size
    else if(event.key === 'ArrowDown') ui.actions.brush_down();
    else if(event.key === 'ArrowUp') ui.actions.brush_up();
})

// Options
document.querySelectorAll("[data-option]").forEach(element => {
    // Create listener
    let listener;
    let handler;

    switch (element.type) {
        case "checkbox":
            listener = "change";
            handler = event => event.target.checked;

            element.checked = world[element.dataset.option];
            break;
    
        default:
            break;
    }

    function applyOption(name, value) { world[name] = value; }

    element.addEventListener(listener, event => applyOption(event.target.dataset.option, handler(event)));
})


// HTML
// let html = '';
// for(let [key, value] of Object.entries(materials)) {
//     if(key.startsWith('#')) {
//         // html += `<h3>${key.substring(1)}</h3>`;
//         html += '<div class="spacer"></div>'
//         continue;
//     }

//     html += `
//     <div
//         class="item material ${key === brush.type ? ' active' : ''}"
//         role="button" tabindex="0"
//         onclick="brush.setType('${key}')"
//         data-brush="${key}"
//     >
//         <img src="./assets/materials/${key}.png" alt="${key}" onerror="if(this.src !== './assets/materials/question.png') this.src = './assets/materials/question.png';">
//         <span>${key}</span>
//     </div>
//     `;
// }
// document.getElementById('materials').innerHTML += html;


// Highlight world size button
try {
    document.querySelector(`[data-world-size="${width},${height}"`).classList.add('active');
} catch (error) {
    document.querySelector("[data-world-size]").classList.add('active');
}
