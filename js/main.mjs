// Libraries
import * as PIXI from '../lib/pixi.mjs'
import '../lib/pixi-filters.js'
// import MersenneTwister from '../lib/mersenne-twister.js'


// DOM
const gamespace = document.getElementById("game");

// Import config
import config from './config.mjs'


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


// Create spritesheet
let atlas = get('./assets/sheet.json');
const spritesheet = new PIXI.Spritesheet(
	PIXI.BaseTexture.from(`./assets/${atlas.meta.image}`), atlas
);
spritesheet.parse();


// Game modules
import { get, lerp } from './util.mjs'
import ui from './ui.mjs'
import filters from './filters.mjs'
import world from './world.mjs'
import controls from './controls.mjs'


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
    controls.pressed['ui_dragging'] = true;
    dragStart = controls.mouse.x;
});


/** Material data (colors, properties, interaction/movement rules, etc.) */
const materials = get('./materials.json');


/** Brush */
import brush from './brush.mjs';

// Indicator setup
brush.indicator.x = -100; brush.indicator.y = -100;
containers.fg.addChild(brush.indicator);



// Player
const player = null;
// const player = {
//     materials: new Set([
//         "air",
//         "concrete",
//         "stone",
//         "water",
//         "dirt",
//         "fire"
//     ]),

//     unlock(type) {
//         this.materials.add(type);
//         try {
//             ui.elements[`material_${type}`].visible = true;
//         } catch (error) {
            
//         }
//         // ui.refresh();
//     }
// }



// Setup
ui.refresh();       // Build UI
brush.setSize(3);   // Set brush size
world.make();       // Create world



// Ticker
let elapsed = 0; // Time elapsed since page load
let last_tick = 0; // Time since last world update
app.ticker.add(delta => {
    // Draw
    if(controls.pressed['click'] && !controls.pressed['ui_dragging']) world.run(controls.mouse.x, controls.mouse.y, 'draw');
    else controls.mouse.drawing = false;


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
    brush.indicator.alpha = (Math.abs(Math.sin(elapsed/20)+1)/20)+0.2;

    // Elapsed
    elapsed += delta;
    if(world.paused) return;

    // Tick
    if(elapsed >= last_tick+world.ticktime) {
        world.tick();
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
        controls.pressed[id] = true :
        delete controls.pressed[id];

    if(id === 'middle_click' && event.type === "pointerdown") {
        const targetPixel = world.getPixel(controls.mouse.x, controls.mouse.y);

        // Log info
        console.table({
            "Material": targetPixel.type,
            "X":        targetPixel.x,
            "Y":        targetPixel.y,
            "Moving":   targetPixel.moving,
            "Fresh":    targetPixel.fresh,
            "Data":     targetPixel.data
        });
        console.log(targetPixel);

        brush.setType(targetPixel.mat.clone_type ?? targetPixel.type);

        // Pan camera
        // controls.panStart.x = controls.mouse.x, controls.panStart.y = controls.mouse.y;
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
    brush.indicator.visible = false;
})

// Events
canvas.addEventListener('pointermove', moveHandler);
document.addEventListener('touchend', () => delete controls.pressed['ui_dragging']);
function moveHandler(event) {
    const marginLeft = (document.body.scrollWidth-canvas.scrollWidth)/2;

    const mouseX = event.clientX - canvas.offsetLeft - marginLeft;
    const mouseY = event.clientY - canvas.offsetTop + window.scrollY;

    // Last position
    controls.lastMouse.x = controls.mouse.x, controls.lastMouse.y = controls.mouse.y, controls.lastMouse.drawing = controls.mouse.drawing;
    
    // scale mouse coordinates to canvas coordinates
    controls.mouse.x = Math.floor(mouseX * canvas.width / canvas.clientWidth / config.scale);
    controls.mouse.y = Math.floor(mouseY * canvas.height / canvas.clientHeight / config.scale);

    // Indicator
    brush.indicator.x = controls.mouse.x - Math.floor(brush.size/2)-0.5;
    brush.indicator.y = controls.mouse.y+1 - Math.floor(brush.size/2)-0.5;
    brush.indicator.visible = true;


    // UI touch scroll
    if(!controls.pressed['ui_dragging'] || event.type !== 'pointermove') return;

    // Scroll
    containers.mats.ix += (dragStart - controls.mouse.x)*-0.5;
    // const x = controls.mouse.x + containers.mats.x;
    // const scroll = x - dragStart;
    // containers.mats.ix = startXcontainers.mats + scroll;

    // End drag
    if(!controls.pressed['click']) delete controls.pressed['ui_dragging'];
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


// Procedural menu
document.getElementById("button_procedural_generate").addEventListener("click", () => world.procedural());
document.getElementById("button_procedural_random").addEventListener("click", () => {
    document.getElementById('seed').value = Math.floor(Math.random() * 100000);
    world.procedural();
});
document.getElementById("seed").addEventListener("keydown", ({ key }) => {
    if(key === 'Enter') world.procedural();
})

function formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();

    // Options
    const options = { month: 'long', day: 'numeric' };
    const yearOptions = { year: 'numeric', ...options };
    const timeOptions = { hour: 'numeric', minute: '2-digit', hour12: true };

    // Conditional date format
    const isToday = date.toDateString() === now.toDateString();
    const isCurrentYear = date.getFullYear() === now.getFullYear();

    // Date
    const datePart = date.toLocaleDateString(
        'en-US', isCurrentYear ? options : yearOptions
    );

    // Time
    const timePart = isToday ? date.toLocaleTimeString('en-US', timeOptions).toLowerCase() : '';

    // Result
    const formattedDate = isToday ? `${timePart}` : `${datePart}${timePart ? ' ' + timePart : ''}`;
    return formattedDate;
}


// Save/Load
const button_save_world = document.getElementById("button_save_world")
button_save_world.addEventListener("click", () => {
    const label = button_save_world.innerText;
    button_save_world.disabled = "true";
    button_save_world.innerText = "Saving...";

    world.save(() => {
        // Populate saves list
        populateSaves();

        // Re-enable save button
        button_save_world.removeAttribute("disabled");
        button_save_world.innerText = label;
    });
})
document.querySelectorAll(".toggle_saves").forEach(btn => btn.addEventListener("click", event => {
    // Toggle visibility
    document.body.classList.toggle("show_load_world");

    // Populate
    populateSaves();
}));

const saves_list = document.getElementById("saves_list");
function populateSaves() {
    // Only if UI is visible
    if(!document.body.classList.contains("show_load_world")) return;

    // HTML
    const html =
        Object.entries(localStorage)
            .filter(([key, value]) => key.startsWith("sandtoy_world_"))
            .sort((a, b) => a[0] > b[0] ? -1 : 1)
            // .reverse()
            .map(([key, value]) => {
                const id = key[key.length-1];
                const data = JSON.parse(value);

                return `
                <div class="save" role="button" tabindex="0" data-storage-key="${key}">
                    <div class="save_info">
                        <div class="upper flex">
                            <strong>World ${id}</strong>
                            <button class="delete_save_button" data-storage-key="${key}">
                                <img src="/assets/google_icons/delete_forever_24dp_FFFFFF_FILL1_wght400_GRAD0_opsz24.svg" alt="Delete" />
                            </button>
                        </div>
                        <p class="margin_top_auto">
                            ${formatDate(data.timestamp)}
                        </p>
                    </div>

                    <img src="${data.thumb}" alt="">
                </div>
                `
            })
            .join("\n");
    
    // Update page
    saves_list.innerHTML = html;

    // Click event listeners
    document.querySelectorAll("[data-storage-key]").forEach(element => element.addEventListener("click", event => {
        if(event.target.tagName === "BUTTON" || event.target.tagName === "IMG") return;
        const key = event.currentTarget.dataset.storageKey;
        world.import(JSON.parse(localStorage.getItem(key)));
    }))

    document.querySelectorAll("[data-storage-key] .delete_save_button").forEach(element => element.addEventListener("click", event => {
        const key = event.currentTarget.dataset.storageKey;
        localStorage.removeItem(key);
        populateSaves();
    }))
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
    document.querySelector(`[data-world-size="${config.width},${config.height}"`).classList.add('active');
} catch (error) {
    document.querySelector("[data-world-size]").classList.add('active');
}


// Export
export {
    spritesheet,                // Spritesheet
    app, containers, filters,   // PIXI

    elapsed, world, brush, controls, player,     // Game state
    materials, config,          // Game data
};


// Debug
// globalThis.PIXI = PIXI;
globalThis.world = world;
