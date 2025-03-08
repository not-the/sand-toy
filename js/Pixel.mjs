import * as PIXI from '../lib/pixi.mjs'

import world from './world.mjs'
import config from './config.mjs'
import sound from './sound.mjs'

import { elapsed, materials, containers, controls, brush } from './main.mjs'
import { randomInt, distance, colorMix, parse, clamp, hexToRgb } from './util.mjs'

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

        langtonAntSetup: p => p.data.rotation = 3,
    }

    /** Set a pixel to a material
     * @param {String} type Material name
     * @param {String} preColor If defined this will be used as the color value instead of a random value
     * @param {Boolean} fresh Used to prevent gases from teleporting to the top of the screen
     * @param {String} preMat If a custom material object was defined by the pixel's predecessor it will be inherited
     */
    set(type, preColor, fresh) {
        if(this === undefined || this?.type === type) return;

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
        if(preColor === undefined) this.data = { age: 0 };

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
     * @param {function} callback Function to run on each pixel. Example: (x, y) => { }. Returning true from the callback will break the loop early.
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
        if(controls.mouse.drawing && brush.material.placement === 'once') return;
        controls.mouse.drawing = true;
        let {size, type} = brush;

        // Inbetween
        const [dist, distX, distY] = distance(controls.lastMouse, controls.mouse);

        // Draw line between points
        const steps = Math.floor(dist);
        for(let i = 0; i < steps; i++) {
            const progress = i/steps;
            const pos = {
                x: Math.ceil(this.x + distX * progress),
                y: Math.ceil(this.y + distY * progress)
            }

            const between = world.getPixel(pos.x, pos.y);
            between?.forRegion(size, handleDraw)
        }

        // Paint area
        this.forRegion(size, handleDraw)

        function handleDraw(x, y) {
            // Material brush_replace property is false
            if(
                !world.brushReplace && brush.type !== 'air' ||
                materials[type].brush_replace === false
            ) {
                if(world.getPixel(x, y)?.type !== 'air') return;
            }
            world.run(x, y, 'set', type);
        }
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
            // console.log('#####');
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
            let cx = 0;
            let cy = 0;

            // Move chance
            if(this.mat?.move_chance === undefined || Math.random() < this.mat.move_chance) {
                // Move checks
                for(let m of this.mat.moves) {
                    let moveX = parse(m.x), moveY = parse(m.y);

                    // Test if destination is valid
                    let dest = world.getPixel(this.x+moveX, this.y+moveY);
                    if(dest === undefined || (dest.mat?.float < this.mat.float || dest.mat?.float === undefined || dest?.type === this.type)) continue;
                    cx = moveX,
                    cy = moveY;
                    break;
                }

                // Move
                this.move(cx, cy);
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

    getRelativePixel(rx=0, ry=0) {
        return world.getPixel(this.x+rx, this.y+ry);
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
        this.set(type, tint);



        // State
        this.moving = true;
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
        this.forRegion(3, (x, y, ox, oy) => {
            const dest = world.getPixel(x, y);
            if(
                dest !== undefined &&
                // dest?.type === 'copper' &&
                x !== this.x || y !== this.y
            ) {
                if(dest?.type === 'copper') {
                    dest.set('electricity', undefined);
                    this.set('copper', undefined);
                    return true;
                }
            }
        })
    }

    /** Explosion */
    tick_explosion() {
        this.forRegion(9, (x, y) => {
            let type = ['fire', 'smoke']
            // this.set(type.random());
            world.run(x, y, 'set', type.random());
        })
    }

    tick_lightning() {
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
            let dest = world.getPixel(seed.x+pos.x, seed.y+pos.y);
            spread(dest);

            // Despawn chance
            if(Math.random() <= this.mat.despawn_chance) this.despawn();
        }
    }


    tick_laser() {
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
            let dest = world.getPixel(seed.x+pos.x, seed.y+pos.y);
            spread(dest);

            // Despawn chance
            if(Math.random() <= this.mat.despawn_chance) this.despawn();
        }
    }


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


    /* Continuously clones the first material it touches. Ignores materials with clonable: false */
    tick_cloner() {
        // Needs to copy a material
        if(this.data.clone_material === undefined) {
            const neighbors = this.getMooreNeighborhoodArray();
            for(const p of neighbors) {
                if(p !== undefined && !p?.mat?.air && p?.type !== this.type) {
                    this.data.clone_material = p.type;

                    // Alter color
                    this.setColor(colorMix(hexToRgb(this.tint), hexToRgb(p.tint), 0.3));
                    break;
                }
            }
        }

        // Clone
        else {
            for(const step of this.mat.clone_behavior) {
                const rx = parse(step.x), ry = parse(step.y);
    
                // Test if destination is valid
                const dest = world.getPixel(this.x+rx, this.y+ry);
                if(dest === undefined || dest?.type !== "air") continue;
    
                dest.set(this.data.clone_material);
    
                break;
            }
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
        const forward = getForward(this.data.rotation);

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


        // 0 = up, 1 = right, 2 = down, 3 = left
        function getForward(rotation=0) {
            switch (rotation) {
                case 0:
                    return [0, -1];
                case 1:
                    return [1, 0];
                case 2:
                    return [0, 1];
                case 3:
                    return [-1, 0];
            }
        }
    }

    /** Conway's game of life */
    tick_conway_cell() {
        const name = "conway cell";

        const neighbors = this.getMooreNeighborhoodArray(); // Neighbors
        const aliveNeighbors = getAliveCount(neighbors); // Alive neighbor count

        // Rules
        if(aliveNeighbors < 2 || aliveNeighbors > 3) {
            this.set("air");
        }

        // Resurrect nearby air cells if applicable
        neighbors.forEach(p => {
            if(p === undefined || p?.type !== "air") return;

            // Number of alive neighbors
            const aliveNeighbors = getAliveCount(p.getMooreNeighborhoodArray());
    
            // If there are 3 alive neighboring cells, convert air into an alive cell
            if(aliveNeighbors === 3) p.set(name);
        });

        // Returns the number of alive cells in an array
        function getAliveCount(neighbors) {
            return neighbors.reduce((accumulator, current) => {
                const alive = current?.previous()?.type === name;
                return accumulator + (alive ? 1 : 0);
            }, 0);
        }
    }

    /** Returns an object containing the pixel's type from the previous tick */
    previous() {
        return world.previousGrid?.[this.y]?.[this.x];
    }

    /** Returns an array of cells within the moore neighborhood (8 cells including ones at a diagonal) */
    getMooreNeighborhoodArray() {
        const neighbors = [];

        loop_x: for(let ix = -1; ix <= 1; ix++)
            loop_y: for(let iy = -1; iy <= 1; iy++)
                if(ix !== 0 || iy !== 0) neighbors.push(this.getRelativePixel(ix, iy));

        return neighbors;
    }

    /** Rotates the pixel, if applicable */
    rotate(amount=1) {
        this.data.rotation = clamp(this.data.rotation+amount, 4);
    }


    tick_water() {
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
