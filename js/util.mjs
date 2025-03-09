import MersenneTwister from '../lib/mersenne-twister.js'


/** Returns a random item from an array
 * @returns {any}
 */
Array.prototype.random = function() {
    return this[Math.floor(Math.random() * this.length)];
}

/** Returns the string with the first character capitalized, the original string is unchanged
 * @returns {String}
 */
String.prototype.capitalize = function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
}


/** Returns a random integer including or between given min/max values */
export function randomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Uses the modulus operator to keep a value within amount */
export function clamp(value, max) {
    return ((value % max) + max) % max;
}


/** Get JSON - https://stackoverflow.com/a/22790025/11039898
 * @param {string} url JSON file URL
 * @param {boolean} parse Whether or not to convert into a JS object
 * @returns 
 */
export function get(url, parse=true) {
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
export function distance(one, two) {
    let distX = one.x - two.x;
    let distY = one.y - two.y;
    return [Math.hypot(distX, distY), distX, distY];
}

/** Interpolation function. Will return target value if values are within 1 of eachother */
export function lerp(a, b, alpha) { return Math.abs(b-a)<1?b : a + alpha * (b - a); }

/** RGB color mix */
export function colorMix(color1, color2, percent=0.5) {
    percent = Math.min(1, Math.max(0, percent)); // Keep within 0-1 range

    const r = Math.round(color1.r + (color2.r - color1.r) * percent);
    const g = Math.round(color1.g + (color2.g - color1.g) * percent);
    const b = Math.round(color1.b + (color2.b - color1.b) * percent);

    return { r, g, b };
}

/** Hexidecimal color to RGB
 * @param {String} hex Hex color
 * @returns {Object} Object with r, g, and b properties
 */
export function hexToRgb(hex) {
    if(typeof hex === 'object') return hex;

    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
  }

/** If the value is an array it will return a random item from the array, otherwise returns value */
export function parse(value) {
    return Array.isArray(value) ? value[Math.floor(Math.random() * value.length)] : value;
}

/** Get pseudo-random numbers */
const randomProceduralCeil = (max, seed, min=0) => min + Math.ceil(new MersenneTwister(seed).random() * (max - min));
const randomProceduralFloor = (max, seed, min=0) => min + Math.floor(new MersenneTwister(seed).random() * (max - min));
export { randomProceduralCeil, randomProceduralFloor }

/** If the value is an array it will return a random item from the array, otherwise returns value */
export function proceduralParse(value, seed) {
    return Array.isArray(value) ? value[randomProceduralFloor(value.length, seed)] : value;
}
