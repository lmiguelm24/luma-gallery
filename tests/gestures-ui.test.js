import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';
import React, { act } from 'react';
import { createServer } from 'vite';

let sharedServer;
after(async () => { await sharedServer?.close(); });

async function browserTest(run, { manualImages = false, reducedMotion = false } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const original = new Map();
  function setGlobal(key, value) {
    original.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  for (const key of ['window', 'document', 'localStorage', 'navigator', 'HTMLElement', 'Event', 'MouseEvent']) setGlobal(key, dom.window[key]);
  setGlobal('indexedDB', new IDBFactory());
  setGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const images = [];
  setGlobal('Image', class {
    constructor() { images.push(this); }
    naturalWidth = 800;
    naturalHeight = 600;
    set src(value) { this.url = value; if (!manualImages && value) queueMicrotask(() => this.onload?.()); }
  });
  dom.window.matchMedia = () => ({ matches: reducedMotion, addEventListener() {}, removeEventListener() {} });
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300 });
  const exports = [];
  const contexts = new WeakMap();
  dom.window.HTMLCanvasElement.prototype.getContext = function () {
    if (!contexts.has(this)) contexts.set(this, { filter: 'none', save() {}, restore() {}, fillRect() {}, translate() {}, rotate() {}, scale() {}, drawImage() {} });
    return contexts.get(this);
  };
  dom.window.HTMLCanvasElement.prototype.toBlob = function (callback, mime) {
    exports.push({ width: this.width, height: this.height, mime, filter: contexts.get(this).filter });
    queueMicrotask(() => callback(new Blob(['edited-photo'], { type: mime })));
  };
  dom.window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,cHJldmlldw==';
  const { createRoot } = await import('react-dom/client');
  const server = sharedServer ||= await createServer({ server: { middlewareMode: true }, configFile: false, optimizeDeps: { noDiscovery: true, include: [] } });
  const root = createRoot(document.getElementById('root'));
  const click = async element => {
    assert.ok(element, 'El control existe');
    await act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  };
  const waitFor = async check => {
    for (let i = 0; i < 100; i++) {
      if (check()) return;
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    }
    assert.ok(check(), 'Se alcanzó el estado esperado');
  };
  const pointer = async (target, name, id, x, y) => {
    const event = new Event(name, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y });
    await act(async () => target.dispatchEvent(event));
  };
  const frame = async () => { await act(async () => { await new Promise(resolve => window.requestAnimationFrame(resolve)); }); };
  try { await run({ root, server, dom, images, exports, click, waitFor, pointer, frame }); }
  finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
}

test('pellizco, arrastre, doble toque y swipe de fotos/videos respetan los controles', () => browserTest(async ({ root, server, pointer, frame }) => {
  const { default: MediaStage } = await server.ssrLoadModule('/src/MediaStage.jsx');
  const controls = React.createRef();
  const directions = [];
  const props = { ref: controls, item: { id: 'photo', kind: 'image', name: 'foto.jpg', width: 800, height: 600, url: 'blob:test' }, rotation: 0, onNavigate: direction => directions.push(direction), onScaleChange() {}, onError() {} };
  let renders = 0;
  await act(async () => root.render(React.createElement(React.Profiler, { id: 'gestures', onRender: () => renders++ }, React.createElement(MediaStage, props))));
  let stage = document.querySelector('.gesture-stage');
  await pointer(stage, 'pointerdown', 1, 150, 150);
  await pointer(stage, 'pointerdown', 2, 250, 150);
  const beforeMoves = renders;
  await pointer(stage, 'pointermove', 1, 100, 150);
  await pointer(stage, 'pointermove', 2, 300, 150);
  await frame();
  assert.equal(renders, beforeMoves, 'Mover los dedos no vuelve a renderizar React');
  assert.equal(stage.dataset.scale, '2.00');
  await pointer(stage, 'pointerup', 1, 100, 150);
  await pointer(stage, 'pointerup', 2, 300, 150);
  assert.equal(directions.length, 0, 'Soltar un pellizco no cambia la foto');
  await pointer(stage, 'pointerdown', 1, 200, 150);
  await pointer(stage, 'pointermove', 1, 260, 180);
  await pointer(stage, 'pointerup', 1, 260, 180);
  await frame();
  assert.match(document.querySelector('.gesture-content').style.transform, /translate3d\(60px, 30px/);
  assert.equal(directions.length, 0, 'El arrastre con zoom no navega');
  await act(async () => controls.current.reset());
  await pointer(stage, 'pointerdown', 1, 300, 100);
  await pointer(stage, 'pointermove', 1, 90, 110);
  await pointer(stage, 'pointerup', 1, 90, 110);
  assert.deepEqual(directions, [1]);
  await pointer(stage, 'pointerdown', 1, 300, 100);
  await pointer(stage, 'pointermove', 1, 80, 110);
  await pointer(stage, 'pointercancel', 1, 80, 110);
  assert.deepEqual(directions, [1], 'Un gesto cancelado no navega');
  for (let i = 0; i < 2; i++) {
    await pointer(stage, 'pointerdown', 1, 200, 150);
    await pointer(stage, 'pointerup', 1, 200, 150);
  }
  assert.equal(stage.dataset.scale, '2.50');
  await act(async () => root.render(React.createElement(MediaStage, { ...props, item: { ...props.item, id: 'video', kind: 'video' }, playbackRate: 1.5, loop: true })));
  stage = document.querySelector('.gesture-stage');
  assert.equal(document.querySelector('video').playbackRate, 1.5);
  assert.equal(document.querySelector('video').loop, true);
  await pointer(stage, 'pointerdown', 1, 80, 100);
  await pointer(stage, 'pointermove', 1, 300, 100);
  await pointer(stage, 'pointerup', 1, 300, 100);
  assert.deepEqual(directions, [1, -1], 'Se puede deslizar sobre un video');
  await pointer(stage, 'pointerdown', 1, 300, 280);
  await pointer(stage, 'pointermove', 1, 80, 280);
  await pointer(stage, 'pointerup', 1, 80, 280);
  assert.deepEqual(directions, [1, -1], 'La barra de reproducción no activa navegación');
}));

test('el editor aplica filtros y recorte, permite deshacer y guarda una copia sin reemplazar el original', () => browserTest(async ({ root, server, exports, click, waitFor }) => {
  const { default: App } = await server.ssrLoadModule('/src/App.jsx');
  const findButton = (text, scope = document) => [...scope.querySelectorAll('button')].find(button => button.textContent.trim() === text);
  await act(async () => root.render(React.createElement(App)));
  await waitFor(() => document.body.textContent.includes('Tu historia empieza aquí'));
  const input = document.querySelector('input[type=file]');
  const original = new File(['original-data'], 'recuerdo.png', { type: 'image/png', lastModified: 1750000000000 });
  Object.defineProperty(input, 'files', { configurable: true, value: [original] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  await waitFor(() => document.querySelector('.media-open'));
  await click(document.querySelector('.media-open'));
  await click(findButton('Editar'));
  await waitFor(() => document.querySelector('.photo-editor canvas')?.width === 800);
  assert.equal(document.querySelectorAll('.filter-preset').length, 24);
  const thumbnails = [...document.querySelectorAll('.filter-preset img')];
  assert.equal(thumbnails.length, 24);
  assert.ok(thumbnails.every(image => image.src.startsWith('data:image/jpeg')), 'Los filtros usan miniaturas y no la foto completa');
  await click(findButton('Atardecer', document.querySelector('.photo-editor')));
  await click(findButton('Noir', document.querySelector('.photo-editor')));
  await click(findButton('Recortar', document.querySelector('.editor-tabs')));
  await click(findButton('1:1', document.querySelector('.ratio-options')));
  assert.equal(findButton('1:1', document.querySelector('.ratio-options')).getAttribute('aria-pressed'), 'true');
  await click(document.querySelector('[aria-label="Deshacer edición"]'));
  assert.equal(findButton('Libre', document.querySelector('.ratio-options')).getAttribute('aria-pressed'), 'true');
  await click(document.querySelector('[aria-label="Rehacer edición"]'));
  await click(findButton('Comparar original'));
  assert.ok(document.querySelector('.original-label'));
  await click(findButton('Volver a edición'));
  await click(findButton('Guardar copia'));
  await waitFor(() => !document.querySelector('.photo-editor'));
  assert.equal(document.querySelectorAll('.media-card').length, 2);
  assert.equal(exports.length, 1);
  assert.equal(exports[0].width, exports[0].height);
  assert.ok(exports[0].width > 500 && exports[0].width < 600);
  assert.equal(exports[0].mime, 'image/png');
  assert.match(exports[0].filter, /grayscale\(1\)/);
  assert.ok(document.querySelector('[aria-label="Visor: recuerdo.png"]'), 'El visor sigue abierto después de guardar');
  await click(findButton('Editar'));
  await waitFor(() => document.querySelector('.photo-editor canvas'));
  await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.ok(!document.querySelector('.photo-editor'));
  assert.ok(document.querySelector('.viewer'), 'Escape cierra solo el editor superior');
  await click(document.querySelector('[aria-label="Cerrar visor"]'));
  assert.equal(document.body.style.overflow, '', 'Cerrar las capas libera el desplazamiento');
  const db = await new Promise(resolve => { const request = indexedDB.open('luma-gallery', 1); request.onsuccess = () => resolve(request.result); });
  const records = await new Promise(resolve => { const request = db.transaction('media').objectStore('media').getAll(); request.onsuccess = () => resolve(request.result); });
  const originalRecord = records.find(record => record.name === 'recuerdo.png');
  const edited = records.find(record => record.album === 'Ediciones Luma');
  assert.equal(originalRecord.size, original.size);
  assert.equal(originalRecord.date, original.lastModified);
  assert.match(edited.name, /^recuerdo-luma-.*\.png$/);
  assert.equal(edited.width, edited.height);
  assert.notEqual(edited.id, originalRecord.id);
  db.close();
}));

const viewerItems = ['a', 'b', 'c'].map(id => ({ id, name: `${id}.jpg`, kind: 'image', type: 'image/jpeg', url: `blob:${id}`, width: 800, height: 600, date: 1750000000000, size: 10, album: 'Prueba' }));
const viewerProps = { items: viewerItems, id: 'a', onClose() {}, onFavorite() {}, onSaveEdited() {}, notify() {}, busy: false };

test('la navegación rápida conserva el destino más reciente y limpia la transición anterior', () => browserTest(async ({ root, server, images, click }) => {
  const { default: Viewer } = await server.ssrLoadModule('/src/Viewer.jsx');
  await act(async () => root.render(React.createElement(Viewer, viewerProps)));
  await click(document.querySelector('[aria-label="Siguiente"]'));
  await click(document.querySelector('[aria-label="Siguiente"]'));
  assert.equal(document.querySelector('.viewer-filename strong').textContent, 'a.jpg', 'El original sigue visible mientras se prepara el destino');
  await act(async () => images.find(image => image.url === 'blob:c').onload());
  assert.equal(document.querySelector('.viewer-filename strong').textContent, 'c.jpg');
  assert.equal(document.querySelector('.media-exit img').getAttribute('src'), 'blob:a');
  assert.ok(document.querySelector('.media-entry.is-entering'));
  assert.equal(document.querySelector('.media-deck').style.getPropertyValue('--slide-direction'), '1');
  await act(async () => {
    images.find(image => image.url === 'blob:b').onload?.();
    images.find(image => image.url === 'blob:a').onload?.();
  });
  assert.equal(document.querySelector('.viewer-filename strong').textContent, 'c.jpg', 'Una decodificación atrasada no cambia el destino');
  await click(document.querySelector('[aria-label="Anterior"]'));
  assert.equal(document.querySelector('.viewer-filename strong').textContent, 'b.jpg');
  assert.equal(document.querySelectorAll('.gesture-stage').length, 1);
  assert.equal(document.querySelectorAll('.media-exit').length, 1);
  assert.equal(document.querySelector('.media-deck').style.getPropertyValue('--slide-direction'), '-1');
  const finished = new Event('animationend', { bubbles: true });
  Object.defineProperty(finished, 'animationName', { value: 'luma-photo-in' });
  await act(async () => document.querySelector('.media-entry').dispatchEvent(finished));
  assert.equal(document.querySelector('.media-exit'), null);
  assert.equal(document.querySelector('.is-entering'), null);
}, { manualImages: true }));

test('reducir movimiento desactiva las transiciones y mantiene la navegación', () => browserTest(async ({ root, server, click }) => {
  const { default: Viewer } = await server.ssrLoadModule('/src/Viewer.jsx');
  await act(async () => root.render(React.createElement(Viewer, viewerProps)));
  await click(document.querySelector('[aria-label="Siguiente"]'));
  assert.equal(document.querySelector('.viewer-filename strong').textContent, 'b.jpg');
  assert.equal(document.querySelector('.media-exit'), null);
  assert.equal(document.querySelector('.is-entering'), null);
}, { reducedMotion: true }));
