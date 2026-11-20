import test from 'node:test';
import assert from 'node:assert/strict';
import { filterMedia, formatBytes, groupMedia, fingerprint, mediaKind } from '../src/lib.js';

const items = [
  { id: 'a', name: 'Playa 10.jpg', album: 'Vacaciones', kind: 'image', favorite: true, date: 1750000000000, size: 200 },
  { id: 'b', name: 'Playa 2.mp4', album: 'Vacaciones', kind: 'video', favorite: false, date: 1740000000000, size: 800 },
  { id: 'c', name: 'Privado.jpg', album: 'Casa', kind: 'image', favorite: true, deletedAt: 1760000000000, date: 1730000000000, size: 100 },
];

test('la papelera no aparece en otras vistas, ni siquiera en favoritos o búsquedas', () => {
  assert.deepEqual(filterMedia(items).map(item => item.id), ['a', 'b']);
  assert.deepEqual(filterMedia(items, { section: 'favorites' }).map(item => item.id), ['a']);
  assert.deepEqual(filterMedia(items, { query: 'privado' }), []);
  assert.deepEqual(filterMedia(items, { section: 'trash' }).map(item => item.id), ['c']);
});

test('combina tipo, álbum, búsqueda y orden sin modificar la biblioteca', () => {
  assert.deepEqual(filterMedia(items, { section: 'albums', album: 'Vacaciones', type: 'video', query: ' PLAYA ' }).map(item => item.id), ['b']);
  assert.deepEqual(filterMedia(items, { sort: 'name' }).map(item => item.id), ['b', 'a']);
  assert.deepEqual(filterMedia(items, { sort: 'oldest' }).map(item => item.id), ['b', 'a']);
  assert.deepEqual(filterMedia(items, { sort: 'size' }).map(item => item.id), ['b', 'a']);
  assert.deepEqual(items.map(item => item.id), ['a', 'b', 'c']);
});

test('agrupa por mes solo cuando el orden es cronológico', () => {
  assert.equal(groupMedia(items, 'newest').length, 3);
  assert.equal(groupMedia(items, 'name').length, 1);
});

test('solo admite contenido multimedia y detecta duplicados por metadatos', () => {
  assert.equal(mediaKind({ type: 'image/heic' }), 'image');
  assert.equal(mediaKind({ type: 'video/mp4' }), 'video');
  assert.equal(mediaKind({ type: 'application/pdf' }), null);
  const file = { name: 'foto.jpg', size: 100, lastModified: 1234 };
  assert.equal(fingerprint(file), fingerprint({ ...file }));
  assert.notEqual(fingerprint(file), fingerprint({ ...file, size: 101 }));
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1 KB');
});
