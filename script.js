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

// PIXI.JS
let width = 75, height = 42;
const app = new PIXI.Application({ width, height, antialias:false, useContextAlpha: false });
PIXI.BaseTexture.defaultOptions.scaleMode = PIXI.SCALE_MODES.NEAREST;
app.renderer.background.color = 0x000000;
gamespace.appendChild(app.view);
let canvas = document.querySelector('canvas');

// Filters
app.stage.filters = [
    new PIXI.filters.AdvancedBloomFilter({
        threshold: 0.7,
        bloomScale: 1,
        brightness: 1,
        blur: 2,
        quality: 8,
        kernels: null,
        pixelSize: 0.5
    })
];

// Materials
const materials = get('./materials.json');


let mouse = {x:0,y:0};
let pressed = {};


// World
let grid = [];
class WorldClass extends PIXI.Graphics {
    constructor() {
        super();
        this.paused = false;
    }

    /** Set pixel */
    set(x, y, type) {
        let p = grid?.[y]?.[x];
        if(p === undefined || (p?.type === type && p?.type !== 'air')) return;

        const mat = materials[type]
        const color = mat.colors[Math.floor(Math.random() * mat.colors.length)];
        world.beginFill(color).drawRect(x, y, 1, 1).endFill();
        p.type = type;
        p.fresh = true;
    }
    /** Draw */
    draw(x, y) {
        x-=Math.floor(brush.size/2);
        y-=Math.floor(brush.size/2);
        let {size, type} = brush;
        for(let mx = 0; mx < size; mx++) {
            for(let my = 0; my < size; my++) this.set(x+mx, y+my, type);
        }
    }
    data(x, y) {
        return grid?.[y]?.[x];
    }

    tick(x, y) {
        // this.set(x, y, 'wood');
        let data = this.data(x, y);
        let mat = materials[data.type];
        if(!data.fresh) {
            // Despawn chance
            if(Math.random() <= mat.despawn_chance) return this.set(x, y, mat?.despawn_conversion ?? 'air');

            // Fluid movement
            if(mat?.moves !== undefined) {
                let cx = 0;
                let cy = 0;

                // // Find empty space below
                // for(let i = 0; i < 3; i++) {
                //     let below = this.data(x+cx, y+cy);
                //     if(below === undefined || below?.type !== 'air') {
                //         if(cx === 0) cx = -1;
                //         else if(cx === -1) cx = 1;
                //         else return;
                //     }
                //     else break;
                // }

                if(Math.random() >= mat.move_chance) return;

                for(let m of mat.moves) {
                    let dest = this.data(x+m.x, y+m.y);
                    if(dest === undefined || (materials[dest?.type]?.replace !== true || dest.type === data.type)) continue;
                    cx = m.x,
                    cy = m.y;
                    break;
                }

                // console.log(cx, cy);
                this.move(x, y, cx, cy, data);
            }
        }

        delete data.fresh;
    }

    move(x, y, cx=0, cy=0, data) {
        let dest_x = x+cx;
        let dest_y = y+cy;
        let dest = grid?.[dest_y]?.[dest_x];
        let replacing = dest.type;
        const mat = materials?.[data?.type];
        const replacing_mat = materials?.[dest?.type];

        if(dest === undefined || replacing_mat.replace !== true) return;
        if(dest_y > height || dest_x > width) return;

        let conversion = replacing_mat?.reacts?.[data?.type];
        if(conversion !== undefined) return this.set(dest_x, dest_y, conversion);

        this.set(dest_x, dest_y, data.type);
        this.set(x, y, replacing);
    }
}
let world = new WorldClass();
app.stage.addChild(world);

let indicator = new PIXI.Graphics();
indicator.x = -100; indicator.y = -100
app.stage.addChild(indicator);


// Brush
let brush = {
    size: 3,
    type: 'sand',

    set(type) {
        brush.type=type;
        document.querySelectorAll(`[data-brush]`).forEach(element => element.classList.remove('active'));
        document.querySelector(`[data-brush="${type}"]`).classList.add('active');
    },

    setSize(value) {
        this.size = value;
        indicator.clear().lineStyle(1, 0x000000).drawRect(0, -1, brush.size+1, brush.size+1).endFill();
    }
}
brush.setSize(3);

// class Pixel extends PIXI.Graphics {
//     // constructor() {
//     //     super();
//     // }
//     setColor(color=0x000000) {
//         this.beginFill(color).drawRect(this.xi, this.yi, 1, 1).endFill();
//     }
// }


// Pixels
for(let yi = 0; yi < height; yi++) {
    grid.push([]);
    for(let xi = 0; xi < width; xi++) {
        let p = {
            xi, yi,
            type: 'air'
        }

        grid[yi][xi] = p;
        world.set(xi, yi, type='air');
    }
}

// Ticker
let elapsed = 0;
let last_tick = 0;
app.ticker.add(delta => {
    // Draw
    if(pressed['click']) world.draw(mouse.x, mouse.y);

    // Indicator
    indicator.alpha = (Math.abs(Math.sin(elapsed/20)+1)/20)+0.2;

    elapsed += delta;

    if(world.paused) return;

    // Tick
    if(elapsed >= last_tick+1.5) {
        for(let xi = grid.length-1; xi >= 0; xi--) {
            for(let yi = grid[xi].length-1; yi >= 0; yi--) {
                world.tick(Number(yi), Number(xi));
            }
        }

        last_tick = elapsed;
    }
})



canvas.addEventListener('pointerdown', () => pressed['click'] = true )
canvas.addEventListener('pointerup', () => delete pressed['click'] )

// Events
app.stage.interactive = true;
app.stage.on('pointerdown', mouseHandler);
app.stage.on('pointermove', mouseHandler);
function mouseHandler(event) {
    let pos = event.data.global;
    let x = Math.floor(pos.x);
    let y = Math.floor(pos.y);
    mouse = {x,y};

    // Indicator
    indicator.x = x - Math.floor(brush.size/2);
    indicator.y = y+1 - Math.floor(brush.size/2);;
}


// HTML
let html = '';
for(let [key, value] of Object.entries(materials)) {
    html += `
        <button onclick="brush.set('${key}')" data-brush="${key}"${key === brush.type ? ' class="active"' : ''}>
            <div class="square" style="--color: #${value.colors[0].toString(16)}"></div>
            <span>${key}</span>
        </button>`;
}
document.getElementById('controls').innerHTML += html;

document.getElementById('size').addEventListener('change', function() { brush.setSize(Number(this.value)); } )
