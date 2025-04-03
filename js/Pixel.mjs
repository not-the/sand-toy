import * as PIXI from '../lib/pixi.mjs'

import world from './world.mjs'
import config from './config.mjs'
import sound from './sound.mjs'

import { elapsed, materials, containers, brush } from './main.mjs'
import { randomInt, colorMix, parse, clamp, hexToRgb } from './util.mjs'
import ui from './ui.mjs'

/** Pixel class */
class Pixel extends PIXI.Sprite {
    constructor(x, y, type='air') {
        super(PIXI.Texture.WHITE);

        this.height = 1; this.width = 1;
        this.x = x;
        this.y = y;
        this.data = {
            age:0
        }; // Data that gets passed around as pixels move

        this.set(type);
        containers.world.addChild(this);
    }

    /** Unique behaviors. Functions specified as strings within materials.json must be added here */
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
        setupWireless: p => {
            // UI
            containers.chooseTarget.visible = true;

            // Setup
            brush.awaitInput(callback, cancel);

            /** Callback */
            function callback(clickedPixel) {
                p.data.target = [clickedPixel.x, clickedPixel.y];
                containers.chooseTarget.visible = false;
            }

            /** On cancel */
            function cancel() {
                containers.chooseTarget.visible = false;
                p.set("smoke");
            }
        },

        artSand: p => {
            const timeframe = elapsed/50;
            const elapsedFloor  = Math.floor(timeframe);
            const elapsedCeil   = Math.ceil(timeframe);
            const percent       = 1 - (elapsedCeil - timeframe);
            const low           = hexToRgb(p.mat.colors[clamp(elapsedFloor, p.mat.colors.length)]);
            const high          = hexToRgb(p.mat.colors[clamp(elapsedCeil, p.mat.colors.length)]);

            // Set tint
            p.tint = colorMix(
                colorMix(low, high, percent), // (1) Main color
                { r:randomInt(0, 4), g:randomInt(0, 6), b:randomInt(0, 10) }, // (1) Color variation
                randomInt(0, 2)/10 // Percent
            );
        }
    }

    /** Set a pixel to a material
     * @param {String} typeArg Material name
     * @param {String} preColor If defined this will be used as the color value instead of a random value
     * @param {String} preMat If a custom material object was defined by the pixel's predecessor it will be inherited
     * @param {Boolean} fresh Used to prevent gases from teleporting to the top of the screen
     * @param {Boolean} clearBackground Only used when clearing the screen. Otherwise disabled hatches will remain in the background.
     */
    set(typeArg, preColor, preMat, fresh, clearBackground=false) {
        if(this === undefined || this?.type === typeArg) return;

        // Background
        let type = typeArg;
        if(type === "air" && this.background && !clearBackground) {
            type = this.background;
            delete this.background;
            preColor = undefined;
        }
        if(clearBackground) delete this.background;

        // Remember previous state
        // this.previous = {
        //     type: this.type,
        //     mat: materials[this.type]
        // };

        // Material reference
        this.mat = preMat ?? materials[type];
        
        // Brand new pixel
        if(preColor === undefined) this.data = { age:0, rotation:parse(this.mat.rotation), timestamp:elapsed };

        // Color
        const color = preColor ?? this.mat.colors[Math.floor(Math.random() * this.mat.colors.length)];
        this.alpha = this.mat?.alpha ?? 1;
        this.setColor(color);
    
        // State
        this.type = type;
        if(this.mat?.gas === true || fresh !== undefined) this.fresh = fresh??1;
        if(this.mat?.background === true) this.background = this.type;

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
        // if(!player.materials.has(type)) player.unlock(type);
    }

    /** Sets the pixel's color
     * @param {Number} color Hex number or RGB object
     */
    setColor(color=0x000000) {
        this.tint = color;
    }

    /** Performs a function over a region
     * @param {Number} size Size of the area
     * @param {Function} callback Function to run on each pixel. Example: (x, y) => { }. Returning true from the callback will break the loop early.
     * @param {Boolean} centered If falsy the current pixel will be the region's top left instead of center
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

        // this.moving = false;

        // Track pixel's age
        if(this?.mat?.track_age || this.mat?.despawn_timer) this.data.age += 1;

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
            let radius = this.mat?.reaction_radius ?? 3;
            this.forRegion(radius, (x, y) => {
                // Don't test current pixel
                if(this.x === x && this.y === y) return;

                // Testing pixel
                let dest = world.getPixel(x, y);
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
        }


        // MATERIAL SPECIFIC
        const matTickString = `tick_${this.type.replace(' ', '_')}`;
        if(this?.[matTickString] !== undefined) this?.[matTickString]();

        // Plasma
        if(this.type === 'lightning plasma' || this.type === 'laser plasma' || this.type === 'firework plasma') {
            this.alpha = (1 - this.data.age / (this.mat.despawn_timer + 5)) ** 2.2;
        }

        // Mud grows grass
        else if(this.mat.grows_grass) {
            // Random chance
            if(Math.random() >= 0.995) {

                let above = world.getPixel(this.x, this.y-1);
                // let below = world.getPixel(this.x, this.y+1);

                if(above !== undefined && above?.mat?.air /* && !this.moving*/) this.set('grass seeds');
            }
        }


        // Movement
        if(this.mat?.moves !== undefined) {
            // Move chance
            if(this.mat?.move_chance === undefined || Math.random() < this.mat.move_chance) {
                // Move checks
                for(const m of this.mat.moves) {
                    const moveX = parse(m.x);
                    const moveY = parse(m.y);

                    // Test if destination is valid
                    const dest = world.getPixel(this.x+moveX, this.y+moveY);
                    if(
                        dest === undefined || // Out of bounds
                        (dest.mat?.float < this.mat.float || dest.mat?.float === undefined || dest?.type === this.type) && // Bouyancy check
                        !dest?.mat?.non_solid // Non solids can be passed through anyway
                    ) continue;

                    // Move and end loop
                    this.move(moveX, moveY);
                    break;
                }
            }
        }

        // Power
        if(this.mat?.powerable !== undefined) {
            const powered = this.isPowered();

            // State
            const wasPowered = this.data.powered;
            this.data.powered = powered;
    
            // Power
            if(!wasPowered && powered) {
                this.power();
                this.data.powered = powered;
            }
        }
    }

    // getRelative() {
    //     return {
    //         "down":     world.getPixel(this.x+0, this.y+1),
    //         "right":    world.getPixel(this.x+1, this.y+1),
    //         "up":       world.getPixel(this.x+0, this.y-1),
    //         "left":     world.getPixel(this.x-1, this.y+1),
    //     }
    // }

    /** Returns a Pixel relative to this
     * @param {Number} rx Relative x position
     * @param {Number} ry Relative y position
     * @returns {Pixel}
     */
    getRelativePixel(rx=0, ry=0) {
        return world.getPixel(this.x+rx, this.y+ry);
    }

    /** Returns an array of contigious pixels (touching within von Neumann neighborhood and of the same type) */
    getContiguous(contiguous=[], origin=this) {
        const neighbors = this.getVonNeumannNeighborArray();

        // Add self
        neighbors.push(this);

        // Iterate over neighbors
        for(const p of neighbors) {
            if(contiguous.includes(p)) continue; // Ignore if already in list
            if(
                p?.type === origin.type || // Same type
                (origin.background !== undefined && p?.background !== undefined && p?.background === origin.background)
            ) {
                contiguous.push(p);
                p.getContiguous(contiguous, origin);
            }
        }

        return contiguous;
    }

    /** Moves the pixel, swapping with the pixel at the target position
     * @param {number} cx Relative destination X change
     * @param {number} cy Relative destination Y change
     */
    move(cx=0, cy=0, condition) {
        // Get destination pixel
        const dest_x = this.x+cx;
        const dest_y = this.y+cy;

        /** @type {Pixel} */
        const dest = world.grid?.[dest_y]?.[dest_x];

        // Invalid move
        if(condition !== undefined) if(!condition(dest)) return 0;
        if(dest === undefined || dest_y > config.height || dest_x > config.width || dest_x < 0 || dest_y < 0) return 0;

        // Swap
        [dest.mat, this.mat] = [this.mat, dest.mat];
        [dest.data, this.data] = [this.data, dest.data];

        // Set
        const { type, tint } = dest;
        dest.set(this.type, this.tint);
        const preserveDest = !this?.mat?.non_solid;
        this.set(
            preserveDest ? type : "air",
            preserveDest ? tint : undefined
        );

        // State
        // this.moving = true;
    }



    // MATERIAL BEHAVIOR

    /** Acid */
    tick_acid() {
        // Dissolve below
        if(Math.random() < this.mat.acid_chance) {
            // Move
            let notAcid = p => p?.type !== 'acid' && !p?.mat?.acid_proof;
            if(this.move(0, 1, notAcid) !== 0) {
                this.set('air');
            }
        }
    }

    /** Copper/electricity */
    tick_electricity() {
        // Already ticked this frame
        if(this.data.timestamp === elapsed) return;

        // Remove self
        this.set("wire");

        // Checks whole neighborhood with potential for multiplying (doesnt work as intended rn)
        const neighbors = this.getMooreNeighborArray();
        for(const p of neighbors) {
            if(p === undefined) continue;
            if(
                !p.mat?.conductive || // Must be wire
                p.lastLastTick().type === "electricity" // Must not have been electricity last tick
            ) continue; 

            // const type = p.type;
            p.set("electricity");
            // p.background = type;
        }


        // Duplicate at diagonals
        // const diagonals = this.getDiagonalNeighborArray();
        // for(const dest of diagonals) {
        //     if(dest !== undefined && dest?.type === 'wire') {
        //         dest.set('electricity', undefined);
        //         dest.fresh = 1;
        //         break;
        //     }
        // }



        // Can't move
        // let rotations = 0;
        // const rotateOrder = {
        //     0: 0,
        //     1: 1, // Try going right
        //     2: -2, // Try going left
        //     3: -1 // Try going backward
        // }
        // do {
        //     // Rotate if needed
        //     this.rotate(rotateOrder[rotations]);

        //     // Get destination
        //     const forward = this.getForward();
        //     const dest = this.getRelativePixel(...forward);
        //     rotations++;

        //     if(dest !== undefined && dest?.type === 'wire') {
        //         const rotation = this.data.rotation;
        //         dest.set('electricity', undefined);
        //         this.set('wire', undefined);
        //         dest.data.rotation = rotation;
        //         break;
        //     }
        // }
        // while (rotations < 3);
    }

    /** Toggle light */
    power_light() {
        this.set("light off");
    }

    power_light_off() {
        this.set("light");
    }

    power_hatch() {
        this.set("hatch off");
    }

    power_hatch_off() {
        this.set("hatch");
    }

    power_wireless_transmitter() {
        if(!this.data?.target) return console.warn("Wireless transmitter has no destination specified");

        // Get target
        const target = world.getPixel(...this.data.target);

        // Power target
        if(target.type === "wire") target.set("electricity");
        else target.power();
    }

    tick_light_sensor() {
        const neighbors = this.getVonNeumannNeighborArray();
        const active = neighbors.some(p => p?.mat?.sensor_type === "light");

        // State
        const wasActive = this.data.power_source;
        this.data.power_source = active;

        // Power
        if(!wasActive && active) {
            this.tint = this.mat.color_active;
            for(const n of neighbors) if(n?.type === "wire") n?.set?.("electricity");
        }
        // Unpower
        else if(wasActive && !active) {
            this.tint = this.mat.colors[0];
        }
    }

    /** copy of light sensor with water instead of laser */
    tick_fluid_sensor() {
        const neighbors = this.getVonNeumannNeighborArray();
        const active = neighbors.some(p => p?.type === "water");

        // State
        const wasActive = this.data.power_source;
        this.data.power_source = active;

        // Power
        if(!wasActive && active) {
            this.tint = this.mat.color_active;
            for(const n of neighbors) if(n?.type === "wire") n?.set?.("electricity");
        }
        // Unpower
        else if(wasActive && !active) {
            this.tint = this.mat.colors[0];
        }
    }

    /** Explosion */
    tick_explosion() {
        this.forRegion(9, (x, y) => {
            const type = ['fire', 'smoke']
            world.run(x, y, 'set', type.random());
        })
    }

    /** Lightning */
    tick_lightning() {
        let seed = this;

        // Loop until lightning bolt is complete
        while (seed?.type === 'lightning') {
            const spread = (dest) => {
                if(
                    dest !== undefined &&
                    (
                        dest?.type === 'air' ||
                        dest?.type === 'lightning' ||
                        dest?.type === 'lightning plasma' ||
                        dest?.mat?.lightning_pass ||
                        dest?.mat?.non_solid
                    )
                ) {
                    seed.set('lightning plasma');
                    dest.set('lightning', seed.tint);
                }
                else seed.set('lightning plasma');

                seed = dest;
            }

            let pos = parse(seed.mat.behavior);
            let dest = world.getPixel(seed.x+pos.x, seed.y+pos.y);
            spread(dest);

            // Despawn chance
            if(Math.random() <= this.mat.despawn_chance) this.despawn();
        }
    }

    /** Laser - Create laser beam */
    tick_laser() {
        let seed = this;

        let strength = 2000;

        // Loop until beam is complete
        while (seed?.type === 'laser' || seed?.mat?.laser_pass && strength > 0) {
            strength--;

            const spread = (dest) => {
                // Valid move
                if(
                    dest !== undefined &&
                    strength > 0 &&
                    (
                        dest?.type === 'air' ||
                        dest?.type === 'laser' ||
                        dest?.type === 'laser plasma' ||
                        dest?.mat?.laser_pass ||
                        dest?.mat?.non_solid
                    )
                ) {
                    // Swap
                    const rotation = seed.data.rotation;
                    if(!seed?.mat?.laser_pass) {
                        seed.set('laser plasma');
                        if(strength < 20) seed.alpha = (strength/20) + 0.3;
                    }
                    if(!dest?.mat?.laser_pass) dest.set('laser');

                    // Data
                    dest.data.rotation = rotation ?? 2;
                }

                // End of the laser
                else {
                    seed.set('laser plasma');
                    if(strength < 20) seed.alpha = (strength/20) + 0.3;
                    return;
                }

                seed = dest;
            }

            // Get forward pixel
            let dest;

            // Change direction if glass is in the way
            let rotations = 0;
            do {
                seed.rotate(rotations === 0 ? 0 : rotations === 2 ? 2 : 1);
                let forward = seed.getForward();
                dest = seed.getRelativePixel(...forward);
                rotations++;
            }
            while (dest?.type === "glass" && rotations < 3)

            // Iterate beam forward
            spread(dest);

            // Despawn chance
            // if(Math.random() <= this.mat.despawn_chance) this.despawn();
        }
    }

    /** Grass seeds - Grow into grass */
    tick_grass_seeds() {
        let above = world.getPixel(this.x, this.y-1);
        let below = world.getPixel(this.x, this.y+1);
        if(above === undefined || !above?.mat?.air && below?.type !== 'mud' && below?.type !== 'grass') return;

        // Grow
        if(Math.random() >= 0.7) {
            this.move(0, -1);
        }
        // Replace
        this.set('grass');

        // Grow downward
        if(Math.random() >= 0.6) world.run(this.x, this.y+1, "set", "grass")
    }

    tick_grass() {
        if(Math.random() >= 0.9) {
            let above = world.getPixel(this.x, this.y-1);

            if(!above?.mat?.air && above?.type !== 'grass') this.set('mud');
        }
    }

    tick_firework() {
        let below = world.getPixel(this.x, this.y+1);

        if(below !== undefined && below?.mat?.air && (Math.random() < 0.3)) below.set('exhaust');
    }

    tick_firework_explosion() {
        const colors = parse(materials['firework plasma'].all_colors);

        this.forRegion(5, (x, y, ox, oy) => {
            const p = world.getPixel(x, y);
            if(p === undefined) return;

            // Must be air
            if(!p.mat.air && p.type !== "firework explosion") return;

            // Set
            p.set('firework plasma');
            p.setColor(parse(colors));

            // Random momentum
            p.mat = {
                ...structuredClone(materials["firework plasma"]),
                moves: [
                    { "x": x-ox-1, "y": y-oy-1 }
                ],
                move_chance: randomInt(1, 3) / 10
            }
        })
    }


    /* Continuously clones the first material it touches. Ignores materials with the { "clone_proof": true } property */
    tick_cloner() {
        // Needs to copy a material
        if(this.data.clone_material === undefined) {
            const neighbors = this.getMooreNeighborArray();
            for(const p of neighbors) {
                if(p !== undefined && !p?.mat?.clone_proof && p?.type !== "air") {
                    // Copy material
                    this.data.clone_material = p?.mat?.clone_type ?? p.type;

                    // If the material has a clone behavior array, use that. Otherwise use the default order.
                    this.data.clone_behavior = materials[this.data.clone_material]?.clone_behavior ?? this.mat.clone_behavior;

                    // Take on color
                    this.setColor(colorMix(hexToRgb(this.tint), hexToRgb(p.tint), 0.3));
                    break;
                }
            }
        }

        // Clone
        else {
            // Slow cloning when placement is "once"
            // if(materials[this.data.clone_material]?.placement === "once") {
            //     if(this.data.timestamp > elapsed - 15) return;
            // }

            for(const step of this.data.clone_behavior) {
                const rx = parse(step.x), ry = parse(step.y);
    
                // Test if destination is valid
                const dest = world.getPixel(this.x+rx, this.y+ry);
                if(dest === undefined || (!dest?.mat?.air && !dest?.mat?.non_solid)) continue;
    
                // Spawn
                dest.set(this.data.clone_material);

                this.data.timestamp = elapsed;
    
                break;
            }
        }
    }

    /** Deleter */
    tick_deleter() {
        const neighbors = this.getMooreNeighborArray();
        for(const p of neighbors) {
            if(p !== undefined && !p?.mat?.delete_proof && p?.type !== "air" && p?.type !== this.type) {
                p.set("air");
            }
        }
    }

    /** Grey Goo */
    tick_gray_goo() {
        const neighbors = this.getVonNeumannNeighborArray();
        for(const p of neighbors) {
            if(p !== undefined && p?.type !== "air" && !p?.mat?.non_solid && !p?.mat?.clone_proof && p?.type !== this.type) {
                // Spread
                if(Math.random() < this?.mat?.goo_chance) {
                    const copiedMat = structuredClone(p?.mat);
                    p.set("gray goo");

                    p.mat = {
                        ...structuredClone(materials["gray goo"]),
                        moves: copiedMat.moves,
                        gas: copiedMat.gas,
                        float: copiedMat.float
                    }
                }
            }
        }

        // Ditch inhertied physics and switch to normal goo movement
        if(this.data.age > 60 && this.mat !== materials["gray goo"]) {
            this.mat = materials["gray goo"];
        }
    }


    /*
    cell is on:   turn right -> move forward -> toggle previous cell
    cell is off:  turn left -> walk forward -> toggle previous cell
    */
    tick_langton_ant() {
        const name = "langton ant";

        // Rotate left
        this.data.on ? this.rotate(-1) : this.rotate(1);

        // Get relative forward coordinate
        const forward = this.getForward();

        // Get destination
        const dest = this.getRelativePixel(...forward);
        const destIsOn = dest?.type === "air";
        const hereIsOn = this.data.on;

        // Destination
        if(dest) {
            dest.set(name);

            // Remember whether destination was on or off
            dest.data.on = destIsOn;

            // Preserve ant data
            dest.data.rotation = this.data.rotation
        }

        // Here
        this.set(hereIsOn ? "paper" : "air");
        // this.tint = "0f0f2f";
    }

    /** Conway's game of life */
    tick_conway_cell() {
        const name = "conway cell";

        const neighbors = this.getMooreNeighborArray(); // Neighbors
        const aliveNeighbors = getAliveCount(neighbors); // Alive neighbor count

        // Rules
        if(aliveNeighbors < 2 || aliveNeighbors > 3) {
            this.set("air");
        }

        // Resurrect nearby air cells if applicable
        neighbors.forEach(p => {
            if(p === undefined || (p?.type !== "air" && !p?.mat?.non_solid)) return;

            // Number of alive neighbors
            const aliveNeighbors = getAliveCount(p.getMooreNeighborArray());
    
            // If there are 3 alive neighboring cells, convert air into an alive cell
            if(aliveNeighbors === 3) p.set(name);
        });

        // Returns the number of alive cells in an array
        function getAliveCount(neighbors) {
            return neighbors.reduce((accumulator, current) => {
                const alive = current?.lastTick?.()?.type === name;
                return accumulator + (alive ? 1 : 0);
            }, 0);
        }
    }

    /** Returns an object containing the pixel's type from the previous tick */
    lastTick() {
        return world.previousGrid?.[this.y]?.[this.x];
    }

    /** Returns an object containing the pixel's type from the previous tick */
    lastLastTick() {
        return world.previousPreviousGrid?.[this.y]?.[this.x];
    }

    /** Returns a boolean depending on if the pixel is touching a power source
     * @returns {Boolean} Based on whether the pixel is touching a power source
     */
    isPowered() {
        const neighbors = this.getVonNeumannNeighborArray();
        return neighbors.some(p => p?.type === "electricity" || p?.data?.power_source);
    }

    /** Powers the pixel */
    power() {
        const matToggleString = `power_${this.type.replace(' ', '_')}`;
        if(this?.[matToggleString] !== undefined) {
            // Contiguous
            if(this.mat?.power_contiguous) {
                this.getContiguous().forEach(p => p[matToggleString]());
            }
            // Single
            else this?.[matToggleString]();
        }
    }

    /** Returns an array of pixels within the moore neighborhood (8 pixels including ones at a diagonal)
     * @returns {Array.<Pixel>}
     */
    getMooreNeighborArray() {
        const neighbors = [];

        loop_x: for(let ix = -1; ix <= 1; ix++)
            loop_y: for(let iy = -1; iy <= 1; iy++)
                if(ix !== 0 || iy !== 0) neighbors.push(this.getRelativePixel(ix, iy));

        return neighbors;
    }

    /** Returns an array of 4 pixels within the von Neumann neighborhood */
    getVonNeumannNeighborArray() {
        const neighbors = [
            this.getRelativePixel( 0, -1),
            this.getRelativePixel( 0,  1),
            this.getRelativePixel(-1,  0),
            this.getRelativePixel( 1,  0)
        ];

        return neighbors;
    }

    /** Returns an array of 4 pixels at a diagonal */
    getDiagonalNeighborArray() {
        const neighbors = [
            this.getRelativePixel(-1, -1),
            this.getRelativePixel( 1, -1),
            this.getRelativePixel(-1,  1),
            this.getRelativePixel( 1,  1)
        ];

        return neighbors;
    }

    /** Returns relative forward coordinates base on Pixel.data.rotation
     * @param {Number} rotation Number 0-3 representing the four cardinal directions (0 = up, 1 = right, 2 = down, 3 = left)
     * @returns {Array} Array [rx, ry]
     */
    getForward(rotation=this.data.rotation) {
        switch (rotation) {
            case 0:
                return [0, -1];
            case 1:
                return [1, 0];
            case 2:
                return [0, 1];
            case 3:
                return [-1, 0];
            default:
                return [0, 1]; // Down
        }
    }

    /** Rotates the pixel, if applicable */
    rotate(amount=1) {
        this.data.rotation = clamp(this.data.rotation+amount, 4);
    }


    /** Water */
    tick_water() {
        // Shading
        if(!world.waterShading) return;

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

export default Pixel;
