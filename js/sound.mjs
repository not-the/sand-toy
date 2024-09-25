import * as PIXI from '../lib/pixi.mjs'
import { sound as PIXISound } from '../lib/pixi-sound.mjs'

/** Sound effects list */
const sounds = {
    "thunder1": {
        src: "./assets/sfx/thunder1.mp3",
        volume: 0.5
    },
    "thunder2": {
        src: "./assets/sfx/thunder2.mp3",
        volume: 0.5
    },
    "thunder3": {
        src: "./assets/sfx/thunder3.mp3",
        volume: 0.5
    },
    "explosion1": {
        src: "./assets/sfx/explosion1.mp3",
        volume: 0.2
    },
    // "fire": {
    //     src: "./assets/sfx/fire.mp3",
    //     volume: 0.7,
    //     loop: true,
    //     type: "fade"
    // },
}
// Register sounds
for(const [key, {src}] of Object.entries(sounds)) PIXISound.add(key, src);

/** Audio methods */
const sound = {
    recents: {},
    play(name, volume) {
        if(this.recents[name] > Date.now()-100) return; // Already played sound within last 100ms

        let options = {
            volume: volume ?? sounds[name].volume,
            loop: sounds[name].loop,
            complete: () => console.log(name + ' complete')
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
