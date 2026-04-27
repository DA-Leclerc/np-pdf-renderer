// @nordparadigm/pdf-renderer — public API.
//
// One renderer, multiple templates. Add products by dropping a new
// template directory under src/templates/<product>/{en,fr}.hbs and
// exposing a typed wrapper here.

export { renderPdf, closeBrowser } from './renderer.js';
export { renderRadarPdf, buildRadarContext } from './products/radar.js';
