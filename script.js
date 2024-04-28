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

/** If the value is an array it will return a random item from the array, otherwise returns value */
function parse(value) {
    return Array.isArray(value) ? value[Math.floor(Math.random() * value.length)] : value;
}

/** Returns a random item from an array
 * @returns {any}
 */
Array.prototype.random = function() {
    return this[Math.floor(Math.random() * this.length)]
}

/** Capitalizes the first character in a string */
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

/** Bloom filter container */
// const bloomContainer = new PIXI.Container();
// bloomContainer.width = width;
// bloomContainer.height = height;
// worldContainer.addChild(bloomContainer);

/** UI container */
const UIContainer = new Container({ y:viewHeight-UIHeight, eventMode:'static' });
const matsContainer = new Container({ ix:0, scale:5 }, UIContainer);                        // Materials container
const optsContainer = new Container({ scale:5 }, UIContainer);                              // Additional UI      
const moreContainer = new Container({ y:-90, scale:5, ix:50, visible:false, filters:[ filters.shadow ] }, UIContainer); // Toggle panel

// Click-and-drag to scroll through materials list
let dragOrigin = 0
UIContainer.on('pointerdown', () => {
    pressed['ui_dragging'] = true;
    dragOrigin = mouse.x;
});


/** UI */
const ui = {
    data: get('./ui.json'),

    elements: {},

    actions: {
        none: null,
        pause: () => world.playPause(),
        clear: () => world.clear(),
        brush_up: () => brush.setSize(brush.size+1),
        brush_down: () => { if(brush.size > 1) brush.setSize(brush.size-1) },

        options: () => {
            document.body.classList.toggle('show_overlay')
            moreContainer.visible = !moreContainer.visible;
            moreContainer.ix = moreContainer.visible ? -6 : 50;
        },

        ticktime_up: () => world.setTicktime(1),
        ticktime_down: () => world.setTicktime(-1),
    },

    build(name='options', container=optsContainer) {
        const menu = this.data[name];
        for(let props of menu) {
            let element = !props.text ?
                PIXI.Sprite.from(props.src) :
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
        }
    }
}
ui.build('options', optsContainer);
ui.build('overlay', moreContainer);


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
    ticks: {},

    paused: false,

    // tt_options: [12, 4, 3, 2, 1.25, 1, 0, -2, -4, -5, -8, -12],
    tt_options: [12, 4, 3, 2, 1.25, 1, 0],
    tt_index: 3,
    ticktime: 2, // Number of frames each tick takes to happen
    setTicktime(dir) {
        this.tt_index -= dir;
        let value = this.tt_options[this.tt_index];
        if(value === undefined) return this.tt_index += dir;

        this.ticktime = value;
        if(ui.elements?.ticktime) ui.elements.ticktime.text =
            value < 0 ? `${Math.abs(value)}/frame` :
            value === 0 ? 'Max' : (2 / value).toFixed(1) + 'x';
        // console.log(value);
    },

    playPause() {
        this.paused = !this.paused;
        ui.elements.pause.texture = PIXI.Texture.from(this.paused ? './assets/play.png' : './assets/pause.png');
    },

    clear() {
        this.forAll(p => p.set('air'));
    },

    forAll(callback) {
        for(let yi in world.grid) for(let p of world.grid[yi]) callback(p);
    }
}
world.setTicktime(0);

/** Shorthand for running a method on the pixel at the given coordinates
 * @param {number} x Pixel X coordinate
 * @param {number} y Pixel Y coordinate
 * @param {function} method 
 * @param  {...any} params 
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

    /** Set a pixel to a material
     * @param {string} type Material name
     * @param {string} preColor If defined this will be used as the color value instead of a random value
     */
    set(type, preColor, fresh) {
        // let this = grid?.[this.y]?.[this.x];
        if(this === undefined || (this?.type === type && this?.type !== 'air')) return;

        this.mat = materials[type];
        const color = preColor ?? this.mat.colors[Math.floor(Math.random() * this.mat.colors.length)];
        this.alpha = this.mat?.alpha ?? 1;

        this.tint = color;
        this.type = type;
        if(this.mat?.gas === true || fresh !== undefined) this.fresh = fresh??1;

        if(preColor === undefined) this.data.age = 0;

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
    }

    /** Performs a function over a region
     * @param {number} size Size of the area
     * @param {function} callback Function to run on each pixel
     * @param {boolean} centered If falsy the current pixel will be the region's top left instead of center
     */
    forRegion(size=3, callback, centered=true) {
        if(callback === undefined) return console.warn(new Error('No callback specified'));
        size -= 1;

        let {x, y} = this;
        // Center on given pixel
        if(centered) {
            x-=Math.floor(size/2);
            y-=Math.floor(size/2);
        }

        // Loop region
        for(let mx = size; mx >= 0; mx--)
            for(let my = size; my >= 0; my--)
                if(callback(x+mx, y+my, x, y)) break;
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
            run(x, y, 'set', type);
        })
    }

    /** Updates a pixel be acting out its movement and interaction rules */
    tick() {
        if(this.fresh) {
            if(this.fresh > 1) this.fresh--;
            else delete this.fresh;
            return;
        }

        // Track pixel's age
        if(this.mat?.despawn_timer) this.data.age += 1;

        // Despawn chance
        if(this.mat?.despawn_chance !== undefined)
            if(Math.random() <= this.mat.despawn_chance) return this.set(
                parse(this.mat?.despawn_conversion) ?? 'air'
            );

        // Despawn timer
        if(this.mat?.despawn_timer !== undefined) {
            if(this.data.age >= this.mat.despawn_timer) return this.set(
                parse(this.mat?.despawn_conversion) ?? 'air'
            );
        }


        // Reacts
        if(this.mat?.reacts !== undefined) {
            // console.log('#####');
            this.forRegion(3, (x, y) => {
                if(this.x === x && this.y === y) return;

                let dest = getPixel(x, y);
                // console.log(dest.type);
                if(dest === undefined) return;

                // Convert
                let conversion = dest.mat?.reacts?.[this?.type];
                if(conversion === undefined) return
                if(
                    this.mat?.reaction_chance === undefined ||
                    Math.random() <= this.mat?.reaction_chance
                ) run(x, y, 'set', conversion);
            }, true);
            // console.log('#####');
        }


        // Acid
        if(this.type === 'acid') {
            // Dissolve below
            if(Math.random() < this.mat.reaction_chance) {
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
        if(this.type === 'electricity') {
            this.forRegion(3, (x, y, ox, oy) => {
                const dest = getPixel(x, y);
                if(
                    dest !== undefined &&
                    // dest?.type === 'wire' &&
                    x !== this.x || y !== this.y
                ) {
                    if(dest?.type === 'wire') {
                        dest.set('electricity', undefined, 2);
                        this.set('wire', undefined, 1);
                        return true;
                    }
                }
            })
        }

        // Explosion
        else if(this.type === 'explosion') {
            this.forRegion(9, (x, y) => {
                let type = ['fire', 'smoke'];
                // this.set(type.random());
                run(x, y, 'set', type.random());
            })
        }


        // Movement
        if(this.mat?.moves !== undefined) {
            let cx = 0;
            let cy = 0;

            // Move chance
            if(Math.random() >= this.mat.move_chance) return;

            // Move checks
            for(let m of this.mat.moves) {
                let moveX = parse(m.x), moveY = parse(m.y);

                // Test if destination is valid
                let dest = getPixel(this.x+moveX, this.y+moveY);
                if(dest === undefined || (dest.mat?.replace !== true || dest?.type === this.type)) continue;
                cx = moveX,
                cy = moveY;
                break;
            }

            // console.log(cx, cy);
            this.move(cx, cy);
        }
    }

    /** Swaps two pixels' positions
     * @param {number} cx Destination X coordinate
     * @param {number} cy Destination Y coordinate
     */
    move(cx=0, cy=0, condition) {
        let dest_x = this.x+cx;
        let dest_y = this.y+cy;
        let dest = world.grid?.[dest_y]?.[dest_x];

        if(condition !== undefined) if(!condition(dest)) return 0;

        if(dest === undefined || dest_y > height || dest_x > width) return 0;

        let replacing = dest.type;
        let conversion = dest.mat?.reacts?.[this?.type];
        if(conversion !== undefined) {
            run(dest_x, dest_y, 'set', conversion);
            return 0;
        }

        [dest.data, this.data] = [this.data, dest.data];
        dest.set(this.type, this.tint);
        this.set(replacing);
    }
}


// Populate world with air pixels
for(let yi = 0; yi < height; yi++) {
    world.grid.push([]);
    for(let xi = 0; xi < width; xi++) {
        let pixel = new Pixel(xi, yi);
        world.grid[yi][xi] = pixel;
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
        // document.querySelectorAll(`[data-brush]`).forEach(element => element.classList.remove('active'));
        // document.querySelector(`[data-brush="${type}"]`).classList.add('active');
    },

    // Size
    size: 3,
    setSize(value) {
        this.size = value;
        indicator.clear().lineStyle(1, 0x000000).drawRect(0, -1, brush.size+1, brush.size+1).endFill();
        // document.getElementById("size").value = value;

        ui.elements.brush_size.text = value;
    }
}
// brush.setSize(3);
brush.setSize(1);



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
        // Get type
        console.log(getPixel(mouse.x, mouse.y).type);

        // Pan camera
        panStart.x = mouse.x, panStart.y = mouse.y;
    }
}

canvas.addEventListener('wheel', event => {
    event.preventDefault();
    matsContainer.ix -= event.deltaY;
})

// canvas.addEventListener('contextmenu', event => {
//     event.preventDefault();
// })

// Events
canvas.addEventListener('pointermove', moveHandler);
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
    else if(event.key === 'ArrowDown') world.setTicktime(1);
    else if(event.key === 'ArrowUp') world.setTicktime(-1);

    // Brush size
    else if(event.key === 'ArrowLeft') ui.actions.brush_down();
    else if(event.key === 'ArrowRight') ui.actions.brush_up();
    // console.log(world.tickrate);
})



// UI
let uiX = 0;
let uiSelection;
for(let [key, value] of Object.entries(materials)) {
    // Title
    if(key.startsWith('#')) {
        uiX += 3;
        continue;
    }

    // Button
    let button = PIXI.Sprite.from('./assets/tray.png');
    button.brush = key;
    button.x = uiX;
    uiX += 16;

    // Icon
    let icon = PIXI.Sprite.from(`./assets/materials/${key}.png`);
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


    // Events
    button.eventMode = 'static';
    button.buttonMode = true;
    button.cursor = 'pointer';
    button.on('pointerdown', selectHandler);
    function selectHandler(event, element=this) {
        brush.setType(element.brush);

        if(uiSelection !== undefined) {
            uiSelection.texture = PIXI.Texture.from('./assets/tray.png');
            uiSelection.children[1].style.fill = 'fff';
        }
        element.texture = PIXI.Texture.from('./assets/selection.png');
        element.children[1].style.fill = '000';
        uiSelection = element;
    }
    if(button.brush === brush.type) selectHandler(undefined, button);

    matsContainer.addChild(button);
}


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
