// DOM
const gamespace = document.getElementById("game");

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
const materials =  {
    'air': {
        colors: [0x344457, 0x344457, 0x344457, 0x334454, 0x344558],
        replace: true,
    },
    'sand': {
        colors: [0xd4c376, 0xcebe81, 0xcfb56c],
        moves: [
            {x:0, y:1},
            {x:-1, y:1},
            {x:1, y:1}
        ]
    },
    'gravel': {
        colors: [0x878a94, 0xc9b876, 0x929497],
        moves: [
            {x:0, y:1}
        ]
    },
    'wood': {
        colors: [0x7c5a32, 0x7a5231, 0x805d30]
    },
    'stone': {
        colors: [0x8b8880]
    },
    'light': {
        colors: [0xffffff]
    },
    'water': {
        colors: [0x3388DD, 0x3385DD],
        moves: [
            {x:0, y:1},
            {x:-1, y:0},
            {x:1, y:0}
        ],
        replace: true,
        reacts: {
            'lava': 'stone',
        }
    },
    'lava': {
        colors: [0xff946a, 0xff6145, 0xffbd68],
        moves: [
            {x:0, y:1},
            {x:-1, y:0},
            {x:1, y:0}
        ],
        move_chance: 0.3,
        replace: true,
        reacts: {
            'water': 'stone',
        }
    },
    'smoke': {
        colors: [0x4b4b4b, 0x575757],
        moves: [
            {x:0, y:-1},
            {x:-1, y:0},
            {x:1, y:0}
        ],
        move_chance: 0.25,
        replace: true,
    },
}

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

            // Sand
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

        let conversion = mat?.reacts?.[dest?.type];
        console.log(dest?.type, mat?.reacts);
        if(conversion !== undefined) return this.set(dest_x, dest_y, conversion);

        this.set(dest_x, dest_y, data.type);
        this.set(x, y, replacing);
    }
}
let world = new WorldClass();
app.stage.addChild(world);

let indicator = new PIXI.Graphics();
indicator.alpha = 0.4;
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
    indicator.x = x;
    indicator.y = y;
}


// HTML
let html = '';
for(let [key, value] of Object.entries(materials)) {
    html += `<button onclick="brush.set('${key}')" data-brush="${key}"${key === brush.type ? ' class="active"' : ''}>${key}</button>`;
}
document.getElementById('controls').innerHTML += html;

document.getElementById('size').addEventListener('change', function() { brush.setSize(Number(this.value)); } )

