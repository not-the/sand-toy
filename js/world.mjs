import * as PIXI from '../lib/pixi.mjs'

import config from "./config.mjs"
import Pixel from "./Pixel.mjs"
import ui from "./ui.mjs"

import { app, containers, spritesheet } from "./main.mjs";
import { distance, randomProceduralCeil, randomProceduralFloor, proceduralParse } from "./util.mjs";

/** World state/methods */
const world = {
    /** 2D array where all pixels are stored */
    grid: [],

    /** Grid data the previous tick */
    previousGrid: [],

    // ticks: {}, // Pixels that need updating (unused)

    get width() { return this.grid[0].length; },
    get height() { return this.grid.length; },

    paused: false,

    // Configuration
    get seed() { return document.getElementById("seed")?.value ?? 1; },
    brushReplace: true,
    waterShading: false,

    /** Ticks all pixels in the world once */
    tick() {
        this.previousGrid = this.grid.map(row => row.map(p => ({ type:p.type, x:p.x, y:p.y })));

        // Multiple ticks
        // for(let mti = 0; mti < (world.ticktime < 0 ? Math.abs(world.ticktime) : 1); mti++) {
            // Loop all
            for(let xi = world.grid.length-1; xi >= 0; xi--) {
                for(let yi = world.grid[xi].length-1; yi >= 0; yi--) {
                    world.run(Number(yi), Number(xi), 'tick');
                }
            }
        // }


        // Loop world.ticks registry
        // for(let p of Object.values(world.ticks)) p.tick();
    },
    
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


    /** Makes an empty world */
    make(data=Array(config.width).fill(null).map(()=>Array(config.height).fill(null))) {
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

    /** Generate procedural world
     * @param {Number} seed World seed
     * @param {*} easetype 
     */
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
                name: 'copper',
                convert: {
                    "gravel": "copper",
                    "stone": "copper",
                    "lava": "lava"
                },
                maxSize: 15,
                minSize: 5
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

        // console.log(blobs);

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

    /** Takes in a world data Object and loads it
     * @param {Object} data 
     */
    import(data) {
        if(!data) return console.error("No world data parameter provided");

        const { grid, colors } = data;

        // Populate world with air pixels
        for(let yi in grid) {
            let col = grid[yi];
            for(let xi = 0; xi < col.length; xi++) {
                const [type, colorIndex] = col[xi];
                const color = colors[colorIndex] ?? undefined;
                if(type === null) continue;

                this.run(xi, yi, 'set', type, color, false);
            }
        }
    },

    /** Exports current world as an object
     * @returns {Array} World data
     */
    export(thumb, saveID=0, whenDone) {
        // If no thumbnail is ready, wait for one
        if(!thumb) return this.screenshot(function(res) { return world.export(res, saveID, whenDone) });

        // Output
        const output = {
            thumb: thumb,
            timestamp: Date.now(),

            height: world.height,
            width: world.width,
            grid: [],
            colors: []
        };
        for(let xi in world.grid) {
            output.grid.push([]);
            const col = world.grid[xi];
            for(let yi in col) {
                // Get color
                let colorIndex = output.colors.indexOf(col[yi].tint);
                if(colorIndex === -1) {
                    output.colors.push(col[yi].tint);
                    colorIndex = output.colors.length - 1;
                }

                // Push
                output.grid[xi].push(
                    [col[yi].type, colorIndex]
                );
            }
        }

        if(saveID !== undefined) {
            const worldStr = JSON.stringify(output);
            localStorage.setItem(`sandtoy_world_${saveID}`, worldStr);
        }

        // whenDone function
        if(whenDone) whenDone();

        return output;
    },

    save(whenDone) {
        let id = 1;
        while(localStorage[`sandtoy_world_${id}`] !== undefined) {
            id++;
            console.log(id);
        }

        this.export(undefined, id, whenDone);
    },

    /** Returns a base64 string made from a screenshot of the canvas */
    screenshot(callback=(res) => console.log(res), jpeg=true) {
        containers.ui.visible = false;
        containers.fg.visible = false;

        let target = app.stage, format='image/png', quality=undefined;
        if(jpeg) format = 'image/jpeg', quality = 0.1;

        // Extract image
        app.renderer.extract.base64(
            target, format, quality,
            new PIXI.Rectangle(
                0, 0,
                app.view.width,
                app.view.height - config.UIHeight
            )
        ).then(callback);

        containers.ui.visible = true;
        containers.fg.visible = true;
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
