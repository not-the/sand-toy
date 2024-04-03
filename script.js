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
 * @param {object|Pixel} one 
 * @param {object|Pixel} two 
 * @returns 
 */
function distance(one, two) {
    let distX = one.x - two.x;
    let distY = one.y - two.y;
    return [Math.hypot(distX, distY), distX, distY];
}

/** Returns a random item from an array
 * @returns {any}
 */
Array.prototype.random = function() {
    return this[Math.floor(Math.random() * this.length)]
}



// World Size. Width/height are pulled from URL parameters if available
let width = 75, height = 42, scale = 10;
let params = location.search.substring(1).split(',');
if(location.search !== '') [width, height] = [Number(params[0]), Number(params[1])];


// PIXI.JS setup
const app = new PIXI.Application({
    width:width * scale,
    height:height * scale,
    antialias:false,
    useContextAlpha: false
});
PIXI.BaseTexture.defaultOptions.scaleMode = PIXI.SCALE_MODES.NEAREST;
app.renderer.background.color = 0x000000;
app.renderer.clearBeforeRender = false;
app.stage.interactiveChildren = false;
gamespace.appendChild(app.view);
let canvas = document.querySelector('canvas');

/** World container */
const worldContainer = new PIXI.Container();
worldContainer.scale.x = scale;
worldContainer.scale.y = scale;
app.stage.addChild(worldContainer);

// Filters
worldContainer.filters = [
    new PIXI.filters.AdvancedBloomFilter({
        threshold: 0.7,
        bloomScale: 1,
        brightness: 1,
        blur: 2,
        quality: 8,
        kernels: null,
        pixelSize: 0.5*scale
    })
];

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
    paused: false,
    tickrate: 1.5,
}

/** Shorthand for running a method on the pixel at the given coordinates
 * @param {number} x Pixel X coordinate
 * @param {number} y Pixel Y coordinate
 * @param {function} method 
 * @param  {...any} params 
 * @returns 
 */
function run(x, y, method='set', ...params) {
    return grid?.[y]?.[x]?.[method]?.(...params);
}
/** Returns the pixel at the provided coordinates
 * @param {number} x Pixel X coordinate
 * @param {number} y Pixel Y coordinate
 * @returns {Pixel|undefined} Pixel or undefined
 */
function getPixel(x, y) { return grid?.[y]?.[x]; }


/** 2D array where all pixels are stored */
let grid = [];

/** Pixel class */
class Pixel extends PIXI.Sprite {
    constructor(x, y, type='air') {
        super(PIXI.Texture.WHITE);
        
        this.type = type;
        this.mat = materials[type];
        this.height = 1; this.width = 1;
        this.x = x;
        this.y = y;

        this.set(type);
        worldContainer.addChild(this);
    }

    /** Set a pixel to a material
     * @param {string} type Material name
     * @param {string} preColor If defined this will be used as the color value instead of a random value
     */
    set(type, preColor) {
        // let this = grid?.[this.y]?.[this.x];
        if(this === undefined || (this?.type === type && this?.type !== 'air')) return;

        this.mat = materials[type];
        const color = preColor ?? this.mat.colors[Math.floor(Math.random() * this.mat.colors.length)];

        this.tint = color;
        this.type = type;
    }

    /** Performs a function over a region
     * @param {number} size Size of the area
     * @param {function} callback Function to run on each pixel
     * @param {boolean} centered If falsy the current pixel will be the region's top left instead of center
     */
    forRegion(size=3, callback, centered=true) {
        if(callback === undefined) return console.warn(new Error('No callback specified'));

        let {x, y} = this;
        // Center on given pixel
        if(centered) {
            x-=Math.floor(size/2);
            y-=Math.floor(size/2);
        }

        // Loop region
        for(let mx = size; mx >= 0; mx--)
            for(let my = size; my >= 0; my--)
                if(callback(x+mx, y+my, x, y) === true) break;
    }

    /** Draws using user's brush material */
    draw() {
        mouse.drawing = true;
        let {size, type} = brush;

        // Inbetween
        // let dist = distance(mouse, lastMouse)[0];
        // console.log(dist);

        // for(let i = 0; i < Math.ceil(dist); i++) {

        // }

        // var p = {
        //     x: p1.x + xDist * fractionOfTotal,
        //     y: p1.y + yDist * fractionOfTotal
        //  }

        this.forRegion(size, (x, y) => {
            run(x, y, 'set', type);
        })
    }

    /** Updates a pixel be acting out its movement and interaction rules */
    tick() {
        // Despawn chance
        if(this.mat?.despawn_chance !== undefined) if(Math.random() <= this.mat.despawn_chance) return this.set(this.mat?.despawn_conversion ?? 'air');

        // Movement
        if(this.mat?.moves !== undefined) {
            let cx = 0;
            let cy = 0;

            // Move chance
            if(Math.random() >= this.mat.move_chance) return;

            // Move checks
            for(let m of this.mat.moves) {
                let moveX = m.x, moveY = m.y;
                if(Array.isArray(moveX)) moveX = moveX[Math.floor(Math.random() * moveX.length)];
                if(Array.isArray(moveY)) moveY = moveY[Math.floor(Math.random() * moveY.length)];

                // Test if destination is valid
                let dest = getPixel(this.x+moveX, this.y+moveY);
                if(dest === undefined || (dest.mat.replace !== true || dest.type === this.type)) continue;
                cx = moveX,
                cy = moveY;
                break;
            }

            // console.log(cx, cy);
            this.move(cx, cy);
        }

        // Reacts
        if(this.mat?.reacts !== undefined) {
            this.forRegion(3, (x, y) => {
                if(this.x === x && this.y === y) return;

                let dest = getPixel(x, y);
                if(dest === undefined) return;

                let conversion = dest.mat?.reacts?.[this?.type];
                if(conversion === undefined) return
                if(
                    this.mat?.reaction_chance === undefined ||
                    Math.random() < this.mat?.reaction_chance
                ) run(x, y, 'set', conversion);
            });
        }


        // Wire/electricity
        if(this.type === 'electricity') {
            getPixel(this.x-1, this.y-1).forRegion(3, (x, y, ox, oy) => {
                const dest = getPixel(x, y);
                if(
                    dest !== undefined &&
                    // dest?.type === 'wire' &&
                    x !== ox && y !== oy
                ) {
                    // this.set(x, y, 'electricity');
                    this.set(ox+1, oy+1, 'wire');
                    // return true;
                }
            })
        }

        // Explosion
        else if(this.type === 'explosion') {
            this.forRegion(5, (x, y) => {
                let type = ['fire', 'smoke'];
                // this.set(type.random());
                run(x, y, 'set', type.random());
            })
        }
    }

    /** Swaps two pixels' positions
     * @param {number} cx Destination X coordinate
     * @param {number} cy Destination Y coordinate
     */
    move(cx=0, cy=0) {
        let dest_x = this.x+cx;
        let dest_y = this.y+cy;
        let dest = grid?.[dest_y]?.[dest_x];
        let replacing = dest.type;

        if(dest === undefined) return;
        if(dest_y > height || dest_x > width) return;

        let conversion = dest.mat?.reacts?.[this?.type];
        if(conversion !== undefined) return run(dest_x, dest_y, 'set', conversion);

        dest.set(this.type, this.tint);
        this.set(replacing);
    }
}


// Populate world with air pixels
for(let yi = 0; yi < height; yi++) {
    grid.push([]);
    for(let xi = 0; xi < width; xi++) {
        let pixel = new Pixel(xi, yi);
        grid[yi][xi] = pixel;
    }
}


/** Brush indicator */
let indicator = new PIXI.Graphics();
indicator.x = -100; indicator.y = -100
worldContainer.addChild(indicator);


/** Brush */
const brush = {
    // Type
    type: 'sand',
    setType(type) {
        this.type=type;
        document.querySelectorAll(`[data-brush]`).forEach(element => element.classList.remove('active'));
        document.querySelector(`[data-brush="${type}"]`).classList.add('active');
    },

    // Size
    size: 3,
    setSize(value) {
        this.size = value;
        indicator.clear().lineStyle(1, 0x000000).drawRect(0, -1, brush.size+1, brush.size+1).endFill();
        document.getElementById("size").value = value;
    }
}
brush.setSize(3);
// brush.setSize(1);



// Ticker
let elapsed = 0; // Time elapsed since page load
let last_tick = 0; // Time since last world update
app.ticker.add(delta => {
    // Draw
    if(pressed['click']) run(mouse.x, mouse.y, 'draw');
    else mouse.drawing = false;

    // Indicator
    indicator.alpha = (Math.abs(Math.sin(elapsed/20)+1)/20)+0.2;

    elapsed += delta;

    if(world.paused) return;

    // Tick
    if(elapsed >= last_tick+world.tickrate) {
        for(let xi = grid.length-1; xi >= 0; xi--) {
            for(let yi = grid[xi].length-1; yi >= 0; yi--) {
                run(Number(yi), Number(xi), 'tick');
            }
        }

        last_tick = elapsed;
    }
})


// ----- Event Listeners ----- //
canvas.addEventListener('pointerdown', pointerHandler)
document.addEventListener('pointerup', pointerHandler)

function pointerHandler(event) {
    moveHandler(event);

    const clickIDs = ['click', 'middle_click', 'right_click'];
    const id = clickIDs[event.button];

    event.type === "pointerdown" ?
        pressed[id] = true :
        delete pressed[id];

    if(id === 'middle_click' && event.type === "pointerdown") {
        // Get type
        console.log(getPixel(mouse.x, mouse.y).type);

        // Pan camera
        panStart.x = mouse.x, panStart.y = mouse.y;
    }
}

canvas.addEventListener('contextmenu', event => {
    event.preventDefault();
    pressed['rclick'] = true;
})
document.addEventListener('contextmenu', event => {
    event.preventDefault();
    delete pressed['rclick'];
})

// Events
canvas.addEventListener('pointermove', moveHandler);
function moveHandler(event) {
    const mouseX = event.clientX - canvas.offsetLeft;
    const mouseY = event.clientY - canvas.offsetTop;

    // Last position
    lastMouse.x = mouse.x, lastMouse.y = mouse.y, lastMouse.drawing = mouse.drawing;
    
    // scale mouse coordinates to canvas coordinates
    mouse.x = Math.floor(mouseX * canvas.width / canvas.clientWidth / scale);
    mouse.y = Math.floor(mouseY * canvas.height / canvas.clientHeight / scale);

    // Indicator
    indicator.x = mouse.x - Math.floor(brush.size/2);
    indicator.y = mouse.y+1 - Math.floor(brush.size/2);
}

document.addEventListener('keydown', event => {
    if(event.key === " ") {
        world.paused = !world.paused;
    }
    else if(event.key === 'ArrowDown') world.tickrate += 0.25;
    else if(event.key === 'ArrowUp' && world.tickrate > 0) world.tickrate -= 0.25;
    // console.log(world.tickrate);
})




// HTML
let html = '';
for(let [key, value] of Object.entries(materials)) {
    if(key.startsWith('#')) {
        html += `<h3>${key.substring(1)}</h3>`;
        continue;
    }

    html += `
    <button onclick="brush.setType('${key}')" data-brush="${key}"${key === brush.type ? ' class="active"' : ''}>
        <div class="square" style="--color: #${value.colors[0].toString(16)}"></div>
        <span>${key}</span>
    </button>`;
}
document.getElementById('controls').innerHTML += html;
document.getElementById('size').addEventListener('change', function() { brush.setSize(Number(this.value)); } )


try {
    document.querySelector(`[data-world-size="${width},${height}"`).classList.add('active');
} catch (error) {
    document.querySelector("[data-world-size]").classList.add('active');
}
