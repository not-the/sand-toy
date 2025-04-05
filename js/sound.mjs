import * as PIXI from '../lib/pixi.mjs'
import { sound as PIXISound } from '../lib/pixi-sound.mjs'
import { parse } from './util.mjs';

/**
 * @typedef {Object} Sound Object containing data for a sound effect
 * @property {String} src (Required) File URL 
 * @property {Number} volume (Optional) Volume relative to other files. Defaults to 1
 * @property {Number|Array} speed (Optional) Playback speed. Can be an array of numbers if you want a randomized speed.
 */

/** Sound effects list
 * @type {Object.<String, Sound>}
*/
const sounds = {
    // Thunder
    "thunder1": { src: "./assets/sfx/thunder1.mp3" },
    "thunder2": { src: "./assets/sfx/thunder2.mp3" },
    "thunder3": { src: "./assets/sfx/thunder3.mp3" },

    // Explosions
    "explosion1": {
        src: "./assets/sfx/explosion1.mp3",
        volume: 0.4
    },

    // Fire
    // "fire": {
    //     src: "./assets/sfx/fire.mp3",
    //     volume: 0.7,
    //     loop: true,
    //     type: "fade"
    // },

    // Fireworks
    "fireworks1": { src: "./assets/sfx/firework_explosion_001.mp3" },
    "fireworks2": { src: "./assets/sfx/firework_explosion_002.mp3" },
    // "fireworks3": { src: "./assets/sfx/firework_explosion_fizz_001.mp3" },
    "fireworks4": { src: "./assets/sfx/firework_explosion_fizz_002.mp3" },
    
    // Balloons
    "balloon_pop": { src: "./assets/sfx/zapsplat_foley_balloon_pop_20568.mp3", volume: 0.3, speed: [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3] },

    // Clicks
    "click_1": { src: "./assets/sfx/zapsplat_household_switch_video_game_controller_click_001_110095.mp3", volume: 0.9 },
    "click_2": { src: "./assets/sfx/zapsplat_household_switch_video_game_controller_click_002_110096.mp3", volume: 0.9 },
    
    "light_on": { src: "./assets/sfx/trimmed_zapsplat_household_fluorescent_bulb_light_on_starter_hum_buzz_002_111457.ogg", volume: 0.7 },
}
// Register sounds
for(const [key, {src}] of Object.entries(sounds)) PIXISound.add(key, src);

/** Audio methods */
const sound = {
    volume_master: 0.3,

    recents: {},
    play(name, volume, speed) {
        // Sound effect data
        const snippet = sounds?.[name];

        // Already played sound within last 75ms
        const minMS = snippet.min_ms ?? 75;
        if(this.recents[name] > Date.now()-minMS) return; 

        const options = {
            volume: (volume ?? snippet?.volume ?? 1) * this.volume_master,
            loop: snippet.loop,
            // complete: () => console.log(name + ' complete')
            speed: parse(speed ?? snippet.speed ?? 1)
        }

        let s;

        // if(options.stereo_x !== undefined) {
        //     let stereo = (options.stereo_x - (containerGame.x*-1))/1200;
        //     options.filters = [
        //         new PIXISound.filters.StereoFilter(stereo)
        //     ];
        // }
        try { s = PIXISound.play(name, options); }
        catch (error) { console.error(error); }

        this.recents[name] = Date.now();
        return s;
    }
}

export default sound;
