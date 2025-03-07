# Sand Toy

Fun pixel world simulation in PIXI.JS, based on games like The Sandbox

https://notkal.com/sand-toy

---

### Deployment
Project can be hosted statically

### File/Folder descriptions
- `/materials.json` - JSON that defines behavior, colors, etc. for all in-game materials (See below for documentation)
- `/ui.json` - JSON containing UI data
<!-- -->
- `/artwork/` - Individual image assets. If a material's sprite isn't found in the spritesheet, the game will try to use `/artwork/materials/[Material name].png`
- `/assets/` - Spritesheet exported after providing [TexturePacker](https://www.codeandweb.com/texturepacker) with the `/artwork/` folder
- `/assets/sfx/` - Sound effects
- `/js/` - Game scripts
- `/lib/` - Third party JS libraries

---

## Adding Your Own Materials to `/materials.json`

New materials can be made by adding an object to `/materials.json`
In most cases, non-boolean properties also support the use of an array in order to get a random result.

```json5
/** Example material - The key will be used as the material name. "color" is
the only required property, all others are optional. */
"wood": {
    /* colors {Array} Each pixel will randomly choose a color from this array */
    "colors": ["#344457", "#334454", "#344558"],

    /* air {Boolean} If set to true, our material can be destroyed by things
    like grass growing. */
    "air": false,

    /* glows {Boolean} If set to true, lightly colored pixels will appear to
    glow. */
    "glows": true,

    /* alpha {Number 0 to 1} Material opacity (Default 1). */
    "alpha": 0.5,


    /* float {Number} Defining this number will make your material a fluid.
    Fluids with a higher number will float on top of materials with a lower
    number. Water has a value of 2, and oil 3. Gases should have higher numbers
    than liquids in order for them to rise to the top. */
    "float": 2,

    /* gas {Boolean} This must be set to true for ANY material that moves
    upwards (negative y direction). */
    "gas": false,

    /* glows {Array} An array of objects determining how the material will try
    to move. If a pixel (or the edge of the screen) is in the way it will
    attempt the next move in the array. Setting a "float" property (see above)
    will allow it to sink or float  */
    "moves": [
        /* The first move to try, assuming there's nothing in the way.
        Positive Y moves downward and negative Y upward. */
        {
            "x": 0,
            "y": 1
        },
        /* If the previous move failed, we'll try this one instead. You can
        also replace the numbers with an array and a random number will be
        picked. In this case, if our material lands on something, it will
        instead attempt to flow diagonally down in one of two directions
        (like sand). */
        {
            "x": [-1, 1],
            "y": 1
        }
    ],

    /* move_chance {Number 0 to 1} Chance EACH TICK that the material will
    attempt to move. */
    "move_chance": 0.65,

    /* despawn_chance {Number 0 to 1} Chance EACH TICK that the material will
    despawn. 0.1 = 10% */
    "despawn_chance": 0.1,

    /* despawn_chance {Number} Time (in ticks) until the material will
    despawn. */
    "despawn_timer": 100,

    /* despawn_chance {Number} CURRENTLY UNUSED. Time (in ticks) before the
    material is allowed to despawn for any reason. */
    "min_despawn_age": 60,

    /* despawn_chance {String or Array} If undefined, materials will convert
    into air by default. Can be either a string, or an array for a random
    material */
    "despawn_conversion": ["ash", "fire"],

    /* reacts {Object} This object defines other materials ours will react
    with. Here we are stating that if our material touches fire, it
    will convert into an ember. The "chance" property is optional. Having
    "chance" set to a value of 0.5 (like below) means there is a 50% chance
    EACH TICK that a conversion will happen. You can also add as many
    interactions as you want. */
    "reacts": {
        "fire": { "to": "ember", "chance": 0.5 },
        "lava": { "to": "fire" }
    },

    /* grows_grass {Boolean} If set to true, our material will grow grass on
    top like mud does */
    "grows_grass": false,


    /* hidden {Boolean} If set to true, our material won't appear in the list */
    "hidden": true,

    /* brush_replace {String} Defaults to true if undefined. If set to false,
    other materials will not be destroyed when drawing. */
    "brush_replace": false,

    /* placement {String} If set to "once" the material will be placed once when
    tapping/clicking instead of continuously. (Like lightning) */
    "placement": "once",

    /* sfx {Object} */
    "sfx": {
        /* place {Array} A random sound will be played when the material spawns
        in. Sounds must be registered using JS */
        "place": ["thunder1", "thunder2", "thunder3"]
    },


    // MISC
    "lightning_pass": false,
    "laser_pass": true, // Currently unused
    "conductive": true, // Currently unused
    "while_behavior": true, // Currently unused
    "fade": 5, // Currently unused
    "acid_chance": 0.5,
    "onset": "glassColoration"
}
```
