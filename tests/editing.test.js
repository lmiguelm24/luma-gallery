import test from 'node:test';
import assert from 'node:assert/strict';
import { constrainView, fitImage, swipeDirection, zoomAt } from '../src/gestures.js';
import { editReducer, editedFilename, imageFilter, initialEdit, initialHistory, moveCrop, outputGeometry, ratioCrop, renderEdit, resizeCrop } from '../src/photo-editing.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < .00001, `${a} ≈ ${b}`);

test('el zoom mantiene el punto entre los dedos y limita el arrastre a la imagen visible', () => {
  const fit = fitImage(1600, 900, 400, 600, 90);
  near(fit.boundsHeight, 600);
  const view = { scale: 2, x: 30, y: 20 };
  const anchor = { x: 70, y: 50 };
  const moved = zoomAt(view, 4, anchor, { x: 90, y: 80 });
  near((anchor.x - view.x) / view.scale, (90 - moved.x) / moved.scale);
  near((anchor.y - view.y) / view.scale, (80 - moved.y) / moved.scale);
  const bounds = constrainView({ scale: 10, x: 99999, y: -99999 }, fit, { width: 400, height: 600 });
  assert.equal(bounds.scale, 6);
  near(bounds.x, (fit.boundsWidth * 6 - 400) / 2);
  near(bounds.y, -(fit.boundsHeight * 6 - 600) / 2);
  const reset = constrainView({ scale: .3, x: 100, y: 100 }, fit, { width: 400, height: 600 });
  assert.equal(reset.scale, 1); near(reset.x, 0); near(reset.y, 0);
});

test('un pellizco o un movimiento vertical no se convierte en cambio de archivo', () => {
  assert.equal(swipeDirection(-110, 10, 400), 1);
  assert.equal(swipeDirection(110, 10, 400), -1);
  assert.equal(swipeDirection(110, 10, 400, true), 0);
  assert.equal(swipeDirection(110, 180, 400), 0);
  assert.equal(swipeDirection(-20, 0, 400), 0);
});

test('el recorte mantiene proporciones y límites al mover y redimensionar cualquier esquina', () => {
  const crop = ratioCrop(9 / 16, 4 / 3, .8);
  near(crop.width / crop.height * 4 / 3, 9 / 16);
  const moved = moveCrop(crop, -10, 10);
  near(moved.x, 0); near(moved.y + moved.height, 1);
  for (const corner of ['nw', 'ne', 'sw', 'se']) {
    for (const delta of [-10, -.1, .1, 10]) {
      const resized = resizeCrop(crop, corner, delta, -delta, 9 / 16, 4 / 3);
      assert.ok(resized.x >= -1e-9 && resized.y >= -1e-9);
      assert.ok(resized.x + resized.width <= 1.000000001 && resized.y + resized.height <= 1.000000001);
      assert.ok(resized.width > 0 && resized.height > 0);
      near(resized.width / resized.height * 4 / 3, 9 / 16);
    }
  }
});

test('la exportación recorta en coordenadas de la imagen girada y respeta los límites de resolución', () => {
  const edit = { ...initialEdit(), rotation: 90, crop: { x: .25, y: .1, width: .5, height: .5 } };
  const output = outputGeometry(6000, 4000, edit);
  assert.equal(output.width, 2000);
  assert.equal(output.height, 3000);
  const large = outputGeometry(12000, 12000, initialEdit());
  assert.ok(large.width <= 4096 && large.height <= 4096 && large.width * large.height <= 12_000_000);
  const small = outputGeometry(300, 200, initialEdit());
  assert.equal(small.width, 300);
  assert.equal(small.height, 200);
});

test('el renderizado exporta filtros, giro, volteo y transparencia con la misma transformación', () => {
  const calls = [];
  const context = { filter: 'none', fillRect: (...args) => calls.push(['fill', ...args]), save() {}, restore() {}, translate: (...args) => calls.push(['translate', ...args]), rotate: value => calls.push(['rotate', value]), scale: (...args) => calls.push(['scale', ...args]), drawImage: (...args) => calls.push(['draw', ...args]) };
  const canvas = { getContext: () => context };
  const image = { naturalWidth: 800, naturalHeight: 600 };
  const edit = { ...initialEdit(), filter: 'noir', rotation: 90, flipX: true, saturation: 70, crop: { x: .1, y: .2, width: .5, height: .5 } };
  renderEdit(canvas, image, edit, { mime: 'image/png' });
  assert.equal(canvas.width, 300); assert.equal(canvas.height, 400);
  assert.equal(context.filter, imageFilter(edit));
  assert.match(context.filter, /grayscale\(1\).*saturate\(0.7\)/);
  assert.deepEqual(calls[0], ['translate', -60, -160]);
  assert.ok(calls.some(call => call[0] === 'rotate' && call[1] === Math.PI / 2));
  assert.ok(calls.some(call => call[0] === 'scale' && call[1] === -1));
  assert.ok(!calls.some(call => call[0] === 'fill'), 'PNG mantiene el canal alfa');
  renderEdit(canvas, image, edit, { mime: 'image/jpeg' });
  assert.ok(calls.some(call => call[0] === 'fill'), 'JPEG tiene un fondo sólido');
});

test('deshacer agrupa un gesto completo y los cambios nuevos descartan la rama de rehacer', () => {
  let state = initialHistory();
  state = editReducer(state, { type: 'change', patch: { filter: 'warm' } });
  state = editReducer(state, { type: 'preview', patch: { brightness: 110 } });
  state = editReducer(state, { type: 'preview', patch: { brightness: 150 } });
  state = editReducer(state, { type: 'commit' });
  assert.equal(state.past.length, 2);
  state = editReducer(state, { type: 'undo' });
  assert.equal(state.present.brightness, 100); assert.equal(state.present.filter, 'warm');
  state = editReducer(state, { type: 'redo' });
  assert.equal(state.present.brightness, 150);
  state = editReducer(state, { type: 'undo' });
  state = editReducer(state, { type: 'change', patch: { flipX: true } });
  assert.equal(state.future.length, 0);
  state = editReducer(state, { type: 'reset' });
  assert.deepEqual(state.present, initialEdit());
});

test('la copia recibe un nombre independiente con el formato de exportación', () => {
  const date = new Date('2026-11-20T12:34:56.789Z');
  assert.equal(editedFilename('foto.heic', 'image/jpeg', date), 'foto-luma-20261120-123456789.jpg');
  assert.match(editedFilename('a/b.png', 'image/png', date), /^a-b-luma-.*\.png$/);
});
