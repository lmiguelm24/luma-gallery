import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { IconButton, useFocusTrap } from './ui.jsx';
import { formatBytes } from './lib.js';
import { Gallery } from './native.js';
import MediaStage from './MediaStage.jsx';
import PhotoEditor from './PhotoEditor.jsx';
import { createImageCache, IMAGE_CACHE_PIXELS } from './image-cache.js';

const TRANSITION_MS = 240;

export default function Viewer({ items, id, onClose, onFavorite, onSaveEdited, notify, busy }) {
  const [currentId, setCurrentId] = useState(id);
  const indexes = useMemo(() => new Map(items.map((item, index) => [item.id, index])), [items]);
  const index = indexes.get(currentId) ?? -1;
  const item = items[index];
  const [details, setDetails] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [scale, setScale] = useState(1);
  const [slideshow, setSlideshow] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const [transition, setTransition] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const ref = useRef(null);
  const media = useRef(null);
  const cache = useRef(null);
  const navigation = useRef({ token: 0, targetId: null, active: true, direction: 1 });
  const loadingTimer = useRef(null);
  const latest = useRef(null);
  latest.current = { items, indexes, currentId, item, editing, reducedMotion };
  useFocusTrap(ref, onClose);
  const next = useCallback(async (direction, gesture = {}) => {
    const state = latest.current;
    if (state.editing || state.items.length < 2) return;
    const step = direction < 0 ? -1 : 1;
    navigation.current.direction = step;
    const base = state.indexes.get(navigation.current.targetId || state.currentId) ?? 0;
    const target = state.items[(base + step + state.items.length) % state.items.length];
    const token = ++navigation.current.token;
    navigation.current.targetId = target.id;
    window.clearTimeout(loadingTimer.current);
    if (target.id === state.currentId) { navigation.current.targetId = null; setPreparing(false); return; }
    if (!cache.current) cache.current = createImageCache();
    const ready = cache.current.get(target);
    if (!ready && target.kind === 'image') loadingTimer.current = window.setTimeout(() => {
      if (navigation.current.active && navigation.current.token === token) setPreparing(true);
    }, 120);
    if (target.kind === 'image' && !ready) await cache.current.prepare(target);
    if (!navigation.current.active || navigation.current.token !== token) return;
    window.clearTimeout(loadingTimer.current);
    setPreparing(false);
    if (!latest.current.indexes.has(target.id)) { navigation.current.targetId = null; return; }
    const previous = media.current?.snapshot();
    setTransition(latest.current.reducedMotion ? null : { token, direction: step, previous, offset: ready ? gesture.offset || 0 : 0 });
    setRotation(0); setScale(1); setMediaError(false);
    setCurrentId(target.id);
  }, []);

  useEffect(() => {
    if (navigation.current.targetId === currentId) navigation.current.targetId = null;
  }, [currentId]);

  useEffect(() => {
    navigation.current.active = true;
    if (!cache.current) cache.current = createImageCache();
    return () => {
      navigation.current.active = false; navigation.current.token++;
      window.clearTimeout(loadingTimer.current);
      cache.current?.dispose(); cache.current = null;
    };
  }, []);
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const changed = () => { setReducedMotion(!!preference?.matches); if (preference?.matches) setTransition(null); };
    changed(); preference?.addEventListener?.('change', changed);
    return () => preference?.removeEventListener?.('change', changed);
  }, []);
  useEffect(() => {
    if (!item || editing || navigation.current.targetId && navigation.current.targetId !== item.id) return;
    let alive = true;
    const direction = navigation.current.direction;
    const adjacent = navigator.connection?.saveData || navigator.deviceMemory <= 2 ? [] : [items[(index + direction + items.length) % items.length], items[(index - direction + items.length) % items.length]];
    cache.current.retain([item, ...adjacent]);
    async function warm() {
      const decoded = await cache.current?.prepare(item);
      if (!alive || navigation.current.targetId && navigation.current.targetId !== item.id) return;
      let remaining = IMAGE_CACHE_PIXELS - (decoded ? decoded.naturalWidth * decoded.naturalHeight : item.width * item.height || 4_000_000);
      const planned = [];
      const seen = new Set([item.id]);
      for (const neighbor of adjacent) {
        if (neighbor.kind !== 'image' || seen.has(neighbor.id)) continue;
        seen.add(neighbor.id);
        const pixels = neighbor.width * neighbor.height || 4_000_000;
        if (pixels > remaining) continue;
        planned.push(neighbor); remaining -= pixels;
      }
      cache.current?.retain([item, ...planned]);
      for (const neighbor of planned) {
        if (!alive || document.visibilityState === 'hidden' || navigation.current.targetId && navigation.current.targetId !== item.id) return;
        await cache.current?.prepare(neighbor, { background: true });
      }
    }
    warm();
    return () => { alive = false; };
  }, [items, index, item?.url, editing]);
  useEffect(() => {
    if (!transition) return;
    const timer = window.setTimeout(() => setTransition(current => current?.token === transition.token ? null : current), TRANSITION_MS + 50);
    return () => window.clearTimeout(timer);
  }, [transition]);
  useEffect(() => {
    const handler = event => {
      if (editing || ['INPUT', 'SELECT', 'VIDEO'].includes(event.target.tagName)) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); next(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); next(-1); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [editing, next]);
  useEffect(() => {
    if (!slideshow || editing || items.length < 2 || item?.kind !== 'image' || scale > 1.01) return;
    const timer = setTimeout(() => next(1), 5000);
    return () => clearTimeout(timer);
  }, [slideshow, editing, currentId, items.length, item?.kind, scale]);
  useEffect(() => { if (!item) onClose(); }, [item, onClose]);
  if (!item) return null;
  async function share() {
    try {
      if (item.native) { await Gallery.share({ uri: item.uri }); return; }
      const file = new File([item.blob], item.name, { type: item.type });
      if (!navigator.canShare?.({ files: [file] })) { notify('Tu navegador no permite compartir archivos. Usa Descargar.'); return; }
      await navigator.share({ files: [file], title: item.name });
    } catch (error) { if (error.name !== 'AbortError') notify('No se pudo compartir el archivo.'); }
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (ref.current.requestFullscreen) await ref.current.requestFullscreen();
      else notify('Pantalla completa no disponible en este dispositivo.');
    } catch { notify('No se pudo activar la pantalla completa.'); }
  }
  return <div className="viewer" ref={ref} role="dialog" aria-modal="true" aria-label={`Visor: ${item.name}`} tabIndex={-1}>
    <header className="viewer-header" inert={editing}><IconButton icon="close" label="Cerrar visor" onClick={onClose}/><div className="viewer-filename"><strong>{item.name}</strong><span>{index + 1} de {items.length}</span></div><div className="viewer-actions">
      <IconButton icon="heart" active={item.favorite} label={item.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'} onClick={() => onFavorite(item)} disabled={busy}/>
      <IconButton icon="share" label="Compartir archivo" onClick={share}/>
      {!item.native && <a className="icon-button" href={item.url} download={item.name} aria-label="Descargar" title="Descargar"><Icon name="download"/></a>}
      <IconButton icon="info" label="Información" active={details} onClick={() => setDetails(!details)}/>
    </div></header>
    <div className="viewer-body" inert={editing}>
      <div className="media-deck" style={{ '--slide-direction': transition?.direction || 1, '--swipe-offset': `${transition?.offset || 0}px`, '--photo-transition-duration': `${TRANSITION_MS}ms` }}>
        {transition?.previous && <div className="media-exit" aria-hidden="true" key={`exit-${transition.token}`}><img src={transition.previous.url} alt="" draggable={false} style={{ width: transition.previous.width, height: transition.previous.height, transform: transition.previous.transform }}/></div>}
        <div key={item.id} className={`media-entry ${transition ? 'is-entering' : ''}`} onAnimationEnd={event => {
          if (event.target === event.currentTarget && event.animationName === 'luma-photo-in') setTransition(null);
        }}>
          {mediaError ? <div className="viewer-stage"><div className="viewer-error"><Icon name="info" size={36}/><h2>No se puede mostrar este archivo</h2><p>El formato puede no ser compatible o el permiso puede haber cambiado.</p><button className="button secondary" onClick={share}>Abrir con otra app</button></div></div>
            : <MediaStage ref={media} item={item} prepared={cache.current?.get(item)} rotation={rotation} onNavigate={next} onScaleChange={setScale} onError={() => setMediaError(true)} playbackRate={playbackRate} loop={loop && !slideshow} autoPlay={slideshow} onEnded={() => { if (slideshow) next(1); }}/>}</div>
        {preparing && <span className="photo-preparing" role="status">Preparando foto…</span>}
      </div>
      {items.length > 1 && <><button className="viewer-arrow prev" aria-label="Anterior" onClick={() => next(-1)}><Icon name="chevron" size={26}/></button><button className="viewer-arrow next" aria-label="Siguiente" onClick={() => next(1)}><Icon name="chevron" size={26}/></button></>}
      {details && <aside className="details-panel"><h3>Detalles del archivo</h3><dl><dt>Nombre</dt><dd>{item.name}</dd><dt>Fecha</dt><dd>{new Date(item.date).toLocaleString('es')}</dd><dt>Tipo</dt><dd>{item.type || 'Desconocido'}</dd><dt>Tamaño</dt><dd>{formatBytes(item.size)}</dd><dt>Álbum</dt><dd>{item.album}</dd>{item.width > 0 && <><dt>Resolución</dt><dd>{item.width} × {item.height} px</dd></>}{item.duration > 0 && <><dt>Duración</dt><dd>{Math.floor(item.duration / 60000)}:{String(Math.floor(item.duration / 1000) % 60).padStart(2, '0')}</dd></>}<dt>Ubicación</dt><dd>{item.native ? 'Galería de Android' : 'Importado en este navegador'}</dd></dl></aside>}
    </div>
    <footer className="viewer-footer" inert={editing}><div className="viewer-meta"><span>{new Date(item.date).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</span><small>{scale > 1.01 ? 'Arrastra para explorar · Doble toque para ajustar' : item.kind === 'image' ? 'Desliza para cambiar · Pellizca para ampliar' : 'Desliza sobre el video para cambiar'}</small></div><div className="viewer-tools">
      {item.kind === 'image' ? <><button className="viewer-edit-button" disabled={mediaError || busy} onClick={() => {
        navigation.current.token++; navigation.current.targetId = null;
        window.clearTimeout(loadingTimer.current); setPreparing(false); setTransition(null);
        setSlideshow(false); setDetails(false); setEditing(true);
      }}><Icon name="edit" size={18}/><span>Editar</span></button><IconButton icon="zoom" label={scale > 1.01 ? 'Reducir' : 'Ampliar'} active={scale > 1.01} onClick={() => media.current?.toggleZoom()}/><IconButton icon="rotate" label="Girar vista 90 grados" onClick={() => setRotation((rotation + 90) % 360)}/></>
        : <><label className="playback-speed"><span className="sr-only">Velocidad de reproducción</span><select aria-label="Velocidad de reproducción" value={playbackRate} onChange={event => setPlaybackRate(Number(event.target.value))}>{[.5, .75, 1, 1.25, 1.5, 2].map(speed => <option key={speed} value={speed}>{speed}×</option>)}</select></label><IconButton icon="repeat" label={loop ? 'Desactivar repetición' : 'Repetir video'} active={loop} onClick={() => { setSlideshow(false); setLoop(!loop); }}/></>}
      <IconButton icon={slideshow ? 'pause' : 'play'} label={slideshow ? 'Detener presentación' : 'Iniciar presentación'} active={slideshow} onClick={() => { setSlideshow(!slideshow); setLoop(false); }}/><IconButton icon="expand" label="Pantalla completa" onClick={fullscreen}/>
    </div></footer>
    {editing && <PhotoEditor item={item} onClose={() => setEditing(false)} onSave={onSaveEdited}/>}
  </div>;
}
