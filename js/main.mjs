// Libraries
import * as PIXI from '../lib/pixi.mjs'
import '../lib/pixi-filters.js'
// import './lib/pixi-sound.js'
// import MersenneTwister from '../lib/mersenne-twister.js'

// Debug
globalThis.PIXI = PIXI;


// DOM
const gamespace = document.getElementById("game");

const config = {
    // Resolution
    viewWidth: 1280,
    viewHeight: 800,
    UIHeight: 80,

    // Pixel world
    width: 128,
    height: 72,
    scale: undefined
}

// World Size. Width/height are pulled from URL parameters if available
let params = location.search.substring(1).split(',');
if(location.search !== '') [config.width, config.height] = [Number(params[0]), Number(params[1])];

/** Pixel scale */
config.scale = config.viewWidth/config.width;


// PIXI.JS setup
const app = new PIXI.Application({
    width: config.viewWidth,
    height: config.viewHeight,
    antialias: false,
    useContextAlpha: false
});
PIXI.BaseTexture.defaultOptions.scaleMode = PIXI.SCALE_MODES.NEAREST;
app.renderer.background.color = 0x1A2839;
// app.renderer.preserveDrawingBuffer = true;
// app.renderer.clearBeforeRender = false;
gamespace.appendChild(app.view);
let canvas = document.querySelector('canvas');

// Spritesheet
let atlas = get('./assets/sheet.json');
const spritesheet = new PIXI.Spritesheet(
	PIXI.BaseTexture.from(`./assets/${atlas.meta.image}`), atlas
);
spritesheet.parse();


// Game
import { get, distance, lerp, colorMix, hexToRgb, parse, randomProceduralCeil, randomProceduralFloor, proceduralParse } from './util.mjs'
import sound from './sound.mjs'
import ui from './ui.mjs'


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
        pixelSize: 0.5*config.scale
    }),
    'shadow': new PIXI.filters.DropShadowFilter({
        distance: 5,
        color: '000',
        alpha: 0.5,
        blur: 1,
        rotation: 90,
    })
}
filters.bloom.padding = 100;


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

const containers = {}

/** World container */
containers.world = new Container({
    interactiveChildren: false,
    width: config.width,
    height: config.height,
    scale: config.scale,
    // filters: [ filters.bloom ]
}, undefined);

/** Bloom filter container */
containers.bloom = new Container({
    width: config.width,
    height: config.height,
    scale: config.scale,
    filters: [ filters.bloom ]
}, undefined);

containers.fg = new Container({
    interactiveChildren: false,
    width: config.width,
    height: config.height,
    scale: config.scale,
})

/** UI container */
containers.ui   = new Container({ y:config.viewHeight-config.UIHeight, eventMode:'static' });
containers.mats = new Container({ ix:0, scale:5 }, containers.ui); // Materials container
containers.opts = new Container({ scale:5 }, containers.ui); // Additional UI      
containers.more = new Container({ y:-90, scale:5, ix:50, visible:false, filters:[ filters.shadow ] }, containers.ui); // Toggle panel


// Click-and-drag to scroll through materials list
let dragStart = 0;
containers.ui.on('pointerdown', () => {
    pressed['ui_dragging'] = true;
    dragStart = mouse.x;
});


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

    get width() { return this.grid[0].length; },
    get height() { return this.grid.length; },

    paused: false,

    // Configuration
    seed: Math.floor(Math.random() * 1000),
    brushReplace: true,
    waterShading: false,
    
    make(data=Array(config.width).fill(null).map(()=>Array(config.height).fill('q'))) {
        this.grid = [];

        // Populate world with air pixels
        for(let yi = 0; yi < config.height; yi++) {
            world.grid.push([]);
            for(let xi = 0; xi < config.width; xi++) {
                let pixel = new Pixel(xi, yi);
                world.grid[yi][xi] = pixel;
            }
        }
    },

    /** Generate procedural world */
    procedural(seed=world.seed??1, easetype='ease') {
        this.clear();

        // b - beginning position
        // e - ending position
        // a - your current value (0-0.9)
        function getTween(b, e, a) {
            return b + ((a/0.9) * (e-b));
        }

        function ease(b, e, a=0, factor=1.5) {
            // Calculate the eased value
            return b + (e - b) * Math.pow(a/0.9, factor);
        }
        function easeReverse(b, e, a=0, factor=1.5) {
            // Calculate the eased value
            return e + (b - e) * Math.pow((1-a)/0.9, factor);
        }


        // Generate
        // doLayer({
        //     type: 'steam', seed: seed*3,
        //     minY: this.height+10, maxY: this.height,
        //     minStopLength: 8, maxStopLength: 14
        // });

        // Layers
        doLayer({
            type: 'mud', seed: seed,
            minY: 26, maxY: randomProceduralCeil(45, seed+9, 40),
            minStopLength: 6, maxStopLength: 9
        });
        doLayer({
            type: 'dirt', seed: seed+10,
            minY: 22, maxY: 30,
            minStopLength: 4, maxStopLength: 8
        });
        doLayer({
            type: 'gravel', seed: seed*2,
            minY: 14, maxY: 17,
            minStopLength: 4, maxStopLength: 9
        });
        doLayer({
            type: 'stone', seed: seed*2,
            minY: 12, maxY: randomProceduralCeil(42, seed+11, 15),
            minStopLength: 10, maxStopLength: 16,
            scatter: 2
        });
        doLayer({
            type: 'lava', seed: seed*3,
            minY: 4, maxY: 8,
            minStopLength: 6, maxStopLength: 10
        });

        function doLayer({
            type='glass', seed,
            minY=0, maxY=10,
            minStopLength, maxStopLength,
            scatter=0
        }) {
            const stopLength = randomProceduralCeil(maxStopLength, seed*7, minStopLength);

            let stops = new Array(Math.ceil(world.width/stopLength)+1).fill(0);
            stops = stops.map((value, index) => (randomProceduralCeil(maxY, seed*index, minY)));
            // console.log(stops);
    
            // Loop columns
            for(let x = 0; x < world.width; x++) {
    
                const lastStopIndex = Math.floor(x/stopLength);
                const lastStop = stops[lastStopIndex]; // Last stop
                const nextStop = stops[lastStopIndex+1]; // Next stop
                const nextNextStop = stops?.[lastStopIndex+2]??0; // Next stop
                const progress = (x % stopLength) / stopLength; // Percent between stops

                // let easeType = procCeil(2, seed+2);
                
                let height = world.height - Math.round(
                    lastStop < nextStop && nextStop > nextNextStop ?
                    // easeType === 1 ?
                    ease(lastStop, nextStop, progress) :
                    easeReverse(lastStop, nextStop, progress)
                );
    
                // Set pixels
                for(let y = 0; y < world.height; y++) {
                    let p = world.grid[y][x];
                    // const colors = materials[type].colors;
                    // let preColor = colors[procCeil(colors.length, seed*p.x*p.y) - 1];
                    let state = height;
                    if(scatter !== 0) state = randomProceduralFloor(height, seed*p.x*p.y, height-scatter)
                    if(p.y > state) p.set(type);
                }
            }
        }


        // Paint
        const biomes = [
            {
                name: 'desert',
                convert: {
                    "mud": "sand",
                    "dirt": "sand",
                    "grass": "air",
                    "gravel": "sand",
                    "stone": "sandstone"
                },
                maxSize: 50,
                minSize: 24
            },
            {
                name: 'snow',
                convert: {
                    "mud": "snow",
                    "dirt": "snow",
                    "gravel": "ice",
                    "stone": "ice",
                    "lava": "gravel"
                },
                maxSize: 60,
                minSize: 40
            },
            {
                name: 'nolava',
                convert: {
                    "lava": "stone"
                }
            },
        ];

        // Determine biomes/locations
        let blobs = new Array(randomProceduralFloor(4, seed+101, 0)).fill(null);
        blobs = blobs.map((value, index) => {
            let biome = proceduralParse(biomes, seed*index*3);
            return {
                biome,
                x:      randomProceduralCeil(world.width,       seed*102+index                      ),
                y:      randomProceduralCeil(world.height/2,    seed*103*index, world.height        ),
                size:   randomProceduralCeil(biome.maxSize??50, seed*104*index, biome.minSize??24   ),
                skew: 0
            }
        });

        console.log(blobs);

        // Paint biomes onto world
        for(let blob of blobs) {
            world.forAll(p => {
                if(distance(p, blob)[0] < randomProceduralFloor(blob.size, seed*p.x*p.y, blob.size-6)) {
                    let to = blob.biome.convert?.[p?.type];

                    if(to !== undefined) p.set(to);
                }
            })
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
        for(let col of world.grid) for(let p of col) callback(p);
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
        containers.world.addChild(this);
    }

    // Unique behavior
    actions = {
        /** Streaks in glass */
        glassColoration: p => p.setColor(p.mat.colors[
            (p.x + p.y) % 16 <= 2 ||
            (p.x + p.y) % 16 === 5
            ?
            1:0
        ]),
        // sandstoneColoration: p => {
        //     const layer =
        //         (p.y + Math.round(( p.x+ (Math.floor(Math.random()*5)) )/10)) % 8 <= 2
        //         ?
        //         1 : 0;

        //     let color = parse(this.mat.layers[layer]);
        //     p.setColor(color);
        // }
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
        if(this.mat?.onset !== undefined && preColor === undefined) this.actions[this.mat.onset](this);


        // Glows
        if(this.mat?.glows === true && this.parent === containers.world) {
            this.parent.removeChild(this);
            containers.bloom.addChild(this);
        }
        else if(!this.mat?.glows && this.parent === containers.bloom) {
            this.parent.removeChild(this);
            containers.world.addChild(this);
        }

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
        if(mouse.drawing && brush.material.placement === 'once') return;
        mouse.drawing = true;
        let {size, type} = brush;

        // Inbetween
        const [dist, distX, distY] = distance(lastMouse, mouse);

        // Draw line between points
        const steps = Math.floor(dist);
        for(let i = 0; i < steps; i++) {
            const progress = i/steps;
            const pos = {
                x: Math.ceil(this.x + distX * progress),
                y: Math.ceil(this.y + distY * progress)
            }

            const between = getPixel(pos.x, pos.y);
            between?.forRegion(size, (x, y) => {
                run(x, y, 'set', type);
            })
        }

        // Paint area
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
                // Move
                let notAcid = p => p?.type !== 'acid' && !p?.mat?.acid_proof;
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
                            dest?.type === 'lightning plasma' ||
                            dest?.mat?.lightning_pass
                        )
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
                            dest?.type === 'laser glow'
                        )
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
        if(dest === undefined || dest_y > config.height || dest_x > config.width || dest_x < 0 || dest_y < 0) return 0;

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
containers.fg.addChild(indicator);


/** Brush */
const brush = {
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
// world.procedural(12);



// Ticker
let elapsed = 0; // Time elapsed since page load
let last_tick = 0; // Time since last world update
app.ticker.add(delta => {
    // Draw
    if(pressed['click'] && !pressed['ui_dragging']) run(mouse.x, mouse.y, 'draw');
    else mouse.drawing = false;


    // UI
    containers.mats.x = lerp(containers.mats.x, containers.mats.ix, 0.3*delta);
    containers.more.x = lerp(containers.more.x, containers.more.ix, 0.3*delta);

    let max = ( containers.mats.width - app.view.width + ( (ui.elements?.bg.width ?? 0)*5 ) ) * -1;
    if(containers.mats.x > 0) {
        containers.mats.ix /= 1.5;
        if(containers.mats.ix < 0) containers.mats.ix = 0;
    }
    else if(containers.mats.x < max) {
        containers.mats.ix = max;
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
    event.preventDefault();
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
X: ${targetPixel.x}   Y: ${targetPixel.y}
Moving: ${targetPixel.moving}
Fresh:  ${targetPixel.fresh}
        `);

        brush.setType(targetPixel.type);

        // Pan camera
        // panStart.x = mouse.x, panStart.y = mouse.y;
    }
}

// Wheel
canvas.addEventListener('wheel', event => {
    event.preventDefault();
    containers.mats.ix -= event.deltaY;
})

// Context menu
canvas.addEventListener('contextmenu', event => {
    event.preventDefault();
})

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
    mouse.x = Math.floor(mouseX * canvas.width / canvas.clientWidth / config.scale);
    mouse.y = Math.floor(mouseY * canvas.height / canvas.clientHeight / config.scale);

    // Indicator
    indicator.x = mouse.x - Math.floor(brush.size/2)-0.5;
    indicator.y = mouse.y+1 - Math.floor(brush.size/2)-0.5;
    indicator.visible = true;


    // UI touch scroll
    if(!pressed['ui_dragging'] || event.type !== 'pointermove') return;

    // Scroll
    containers.mats.ix += (dragStart - mouse.x)*-0.5;
    // const x = mouse.x + containers.mats.x;
    // const scroll = x - dragStart;
    // containers.mats.ix = startXcontainers.mats + scroll;

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
            // Listener
            listener = "change";
            handler = event => event.target.checked;

            // Fill
            element.checked = world[element.dataset.option];
            break;

        case "number":
            // Listener
            listener = "change";
            handler = event => Number(event.target.value);

            // Fill
            element.value = world[element.dataset.option];
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
    document.querySelector(`[data-world-size="${config.width},${config.height}"`).classList.add('active');
} catch (error) {
    document.querySelector("[data-world-size]").classList.add('active');
}


// Export
export {
    spritesheet,
    world, brush,
    containers,
    materials, filters,
    config, app
};
