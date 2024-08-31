/** Game config. Includes screen resolution and world dimensions */
const config = {
    // Resolution
    viewWidth: 1280,
    viewHeight: 800,
    UIHeight: 80,

    // Pixel world
    width: 128,
    height: 72,
    scale: undefined
}

// World Size. Width/height are pulled from URL parameters if available
let params = location.search.substring(1).split(',');
if(location.search !== '') [config.width, config.height] = [Number(params[0]), Number(params[1])];

/** Pixel scale */
config.scale = config.viewWidth/config.width;

export default config;