import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageCache } from '../src/image-cache.js';

const photo = id => ({ id, kind: 'image', url: `blob:${id}`, width: 1000, height: 1000 });
function fixtures(options = {}) {
  const images = [];
  const cache = createImageCache({ ...options, createImage: () => {
    const image = { naturalWidth: 1000, naturalHeight: 1000, decode: async () => {} };
    images.push(image); return image;
  } });
  const load = async item => {
    const pending = cache.prepare(item);
    const image = images.at(-1);
    image.onload();
    return pending;
  };
  return { cache, images, load };
}

test('deduplica cargas y espera la decodificación antes de entregar la foto', async () => {
  const { cache, images } = fixtures();
  let decoded;
  try {
    const a = cache.prepare(photo('a'));
    const b = cache.prepare(photo('a'));
    assert.equal(a, b);
    assert.equal(images.length, 1);
    images[0].decode = () => new Promise(resolve => { decoded = resolve; });
    images[0].onload();
    assert.equal(cache.get(photo('a')), null);
    decoded();
    assert.equal(await a, images[0]);
    assert.equal(cache.get(photo('a')), images[0]);
    assert.equal(await cache.prepare({ ...photo('video'), kind: 'video' }), null);
    assert.equal(images.length, 1, 'No se precargan videos');
  } finally { cache.dispose(); }
});

test('la caché conserva solo fotos cercanas y elimina las menos recientes al alcanzar el límite', async () => {
  const { cache, load } = fixtures({ maxEntries: 2 });
  try {
    await load(photo('a')); await load(photo('b'));
    await cache.prepare(photo('a'));
    await load(photo('c'));
    assert.equal(cache.size, 2);
    assert.ok(cache.get(photo('a')));
    assert.equal(cache.get(photo('b')), null);
    cache.retain([photo('c')]);
    assert.equal(cache.size, 1);
    assert.ok(cache.get(photo('c')));
  } finally { cache.dispose(); }
  assert.equal(cache.size, 0);
  assert.equal(await cache.prepare(photo('d')), null);
});

test('el presupuesto de píxeles limita la retención incluso antes del máximo de entradas', async () => {
  const { cache, load } = fixtures({ maxPixels: 2_000_000 });
  try {
    await load(photo('a')); await load(photo('b')); await load(photo('c'));
    assert.equal(cache.size, 2);
    assert.equal(cache.get(photo('a')), null);
  } finally { cache.dispose(); }
});

test('cancelaciones, errores y tiempos de espera liberan las cargas sin promesas pendientes', async () => {
  const { cache, images } = fixtures({ timeout: 15 });
  try {
    const cancelled = cache.prepare(photo('a'));
    cache.retain([]);
    assert.equal(await cancelled, null);
    assert.equal(images[0].src, '');
    assert.equal(images[0].onload, null);
    const failed = cache.prepare(photo('b'));
    images[1].onerror();
    assert.equal(await failed, null);
    assert.equal(await cache.prepare(photo('c')), null);
    assert.equal(cache.size, 0);
  } finally { cache.dispose(); }
});

test('la precarga de fondo no desplaza ni cancela el destino elegido por el usuario', async () => {
  const { cache, images, load } = fixtures({ maxEntries: 2, maxPixels: 2_000_000 });
  try {
    await load(photo('a'));
    const target = cache.prepare(photo('d'));
    assert.equal(await cache.prepare(photo('b'), { background: true }), null);
    assert.equal(images.length, 2, 'La carga de fondo se omite cuando no hay presupuesto');
    images[1].onload();
    assert.equal(await target, images[1]);
    assert.ok(cache.get(photo('d')));
  } finally { cache.dispose(); }
});
