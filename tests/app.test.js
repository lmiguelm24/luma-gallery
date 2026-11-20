import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { indexedDB } from 'fake-indexeddb';
import React, { act } from 'react';
import { createServer } from 'vite';

test('importación, duplicados, favoritos, visor, álbum y papelera persisten correctamente', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const original = new Map();
  function setGlobal(key, value) {
    original.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  for (const key of ['window', 'document', 'localStorage', 'navigator', 'HTMLElement', 'Event', 'MouseEvent']) setGlobal(key, dom.window[key]);
  setGlobal('indexedDB', indexedDB);
  setGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { createRoot } = await import('react-dom/client');
  const server = await createServer({ server: { middlewareMode: true }, configFile: false });
  const root = createRoot(document.getElementById('root'));
  const getButton = text => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text);
  async function waitFor(check) {
    for (let i = 0; i < 100; i++) {
      if (check()) return;
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    }
    assert.ok(check(), 'La interfaz no alcanzó el estado esperado');
  }
  async function click(button) {
    assert.ok(button, 'El botón existe');
    await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  }
  try {
    const { default: App } = await server.ssrLoadModule('/src/App.jsx');
    await act(async () => { root.render(React.createElement(App)); });
    await waitFor(() => document.body.textContent.includes('Tu historia empieza aquí'));
    const input = document.querySelector('input[type="file"]');
    const file = new File(['photo-data'], 'playa.jpg', { type: 'image/jpeg', lastModified: 1750000000000 });
    Object.defineProperty(input, 'files', { configurable: true, value: [file, file] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    await waitFor(() => document.querySelectorAll('.media-card').length === 1);
    assert.match(document.querySelector('.toast').textContent, /1 archivo importado.*1 duplicados/);
    await click(document.querySelector('[aria-label="Añadir a favoritos: playa.jpg"]'));
    await waitFor(() => document.querySelector('.card-favorite.liked'));
    await click(document.querySelector('[aria-label="Ver playa.jpg"]'));
    assert.ok(document.querySelector('[role="dialog"][aria-label="Visor: playa.jpg"]'));
    await click(document.querySelector('[aria-label="Información"]'));
    assert.match(document.querySelector('.details-panel').textContent, /image\/jpeg/);
    await click(document.querySelector('[aria-label="Cerrar visor"]'));
    await click(getButton('Seleccionar'));
    await click(document.querySelector('.media-open'));
    await click(document.querySelector('[aria-label="Organizar en álbum"]'));
    const album = document.getElementById('album-name');
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(album, 'Escapadas');
      album.dispatchEvent(new Event('input', { bubbles: true }));
      album.dispatchEvent(new Event('change', { bubbles: true }));
    });
    assert.equal(album.value, 'Escapadas');
    await act(async () => document.querySelector('.modal form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await waitFor(() => !document.querySelector('.modal'));
    await click(getButton('Seleccionar'));
    await click(document.querySelector('.media-open'));
    await click(document.querySelector('[aria-label="Mover a papelera local"]'));
    await waitFor(() => document.querySelectorAll('.media-card').length === 0);
    await click([...document.querySelectorAll('.nav-item')].find(button => button.textContent.includes('Papelera')));
    assert.equal(document.querySelectorAll('.media-card').length, 1);
    await click(getButton('Seleccionar'));
    await click(document.querySelector('.media-open'));
    await click(getButton('Restaurar'));
    await waitFor(() => document.querySelectorAll('.media-card').length === 0);
    const database = await new Promise((resolve, reject) => { const request = indexedDB.open('luma-gallery', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const saved = await new Promise(resolve => { const request = database.transaction('media').objectStore('media').getAll(); request.onsuccess = () => resolve(request.result); });
    assert.equal(saved.length, 1);
    assert.equal(saved[0].favorite, true);
    assert.equal(saved[0].album, 'Escapadas');
    assert.equal(saved[0].deletedAt, null);
    assert.equal(saved[0].url, undefined, 'Las URL temporales no se persisten');
    database.close();
  } finally {
    await act(async () => root.unmount());
    await server.close();
    dom.window.close();
    for (const [key, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
