import config from "./config.mjs"
import Pixel from "./Pixel.mjs"
import ui from "./ui.mjs"

import { distance, randomProceduralCeil, randomProceduralFloor, proceduralParse } from "./util.mjs";

/** World state/methods */
const world = {
    /** 2D array where all pixels are stored */
    grid: [],
    // ticks: {}, // Pixels that need updating (unused)

    get width() { return this.grid[0].length; },
    get height() { return this.grid.length; },

    paused: false,

    // Configuration
    get seed() { return document.getElementById("seed")?.value ?? 1; },
    brushReplace: true,
    waterShading: false,
    
    /** Shorthand for running a method on the pixel at the given coordinates
     * @param {number} x Pixel X coordinate
     * @param {number} y Pixel Y coordinate
     * @param {string} method Method name (string)
     * @param  {...any} params Method parameters
     * @returns 
     */
    run(x, y, method='set', ...params) {
        return this.grid?.[y]?.[x]?.[method]?.(...params);
    },
    /** Returns the pixel at the provided coordinates
     * @param {number} x Pixel X coordinate
     * @param {number} y Pixel Y coordinate
     * @returns {Pixel|undefined} Pixel or undefined
     */
    getPixel(x, y) { return this.grid?.[y]?.[x]; },



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
    procedural(seed=this.seed, easetype='ease') {
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

    /** Runs a callback function on every pixel
     * @param {Function} callback 
     */
    forAll(callback) {
        for(let col of world.grid) for(let p of col) callback(p);
    }
}

export default world;
