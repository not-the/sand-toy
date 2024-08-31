import * as PIXI from '../lib/pixi.mjs'
import config from './config.mjs'

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
        pixelSize: 0.5*config.scale
    }),
    'shadow': new PIXI.filters.DropShadowFilter({
        distance: 5,
        color: '000',
        alpha: 0.5,
        blur: 1,
        rotation: 90,
    })
}
filters.bloom.padding = 100;

export default filters;