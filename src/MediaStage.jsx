import React, { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { constrainView, fitImage, swipeDirection, zoomAt } from './gestures.js';

const initialView = () => ({ scale: 1, x: 0, y: 0 });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export default forwardRef(function MediaStage({ item, rotation, prepared, onNavigate, onScaleChange, onError, playbackRate = 1, loop = false, autoPlay = false, onEnded }, controls) {
  const stage = useRef(null);
  const content = useRef(null);
  const zoomLabel = useRef(null);
  const animationFrame = useRef(null);
  const rect = useRef({ left: 0, top: 0 });
  const video = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const lastTap = useRef(null);
  const lastTouch = useRef(0);
  const current = useRef(initialView());
  const drag = useRef(0);
  const zoomed = useRef(false);
  const [interacting, setInteracting] = useState(false);
  const [viewport, setViewport] = useState({ width: 640, height: 480 });
  const [natural, setNatural] = useState({ width: prepared?.naturalWidth || item.width || 1, height: prepared?.naturalHeight || item.height || 1 });
  const fitted = fitImage(natural.width, natural.height, viewport.width, viewport.height, rotation);
  const latest = useRef(null);
  latest.current = { viewport, fitted, rotation, onNavigate, onScaleChange, item };

  function transform() {
    const view = current.current;
    return `translate3d(${view.x + drag.current}px, ${view.y}px, 0) rotate(${latest.current.rotation}deg) scale(${view.scale})`;
  }
  function paint() {
    if (!content.current || !stage.current) return;
    content.current.style.transform = transform();
    stage.current.dataset.scale = current.current.scale.toFixed(2);
    stage.current.classList.toggle('is-zoomed', current.current.scale > 1.01);
    if (zoomLabel.current) {
      zoomLabel.current.hidden = current.current.scale <= 1.01;
      zoomLabel.current.textContent = `${Math.round(current.current.scale * 100)} %`;
    }
  }
  function schedulePaint() {
    if (animationFrame.current !== null) return;
    const callback = () => { animationFrame.current = null; paint(); };
    animationFrame.current = window.requestAnimationFrame ? window.requestAnimationFrame(callback) : window.setTimeout(callback, 16);
  }
  function setDrag(value) { drag.current = value; schedulePaint(); }

  function update(next) {
    const value = constrainView(next, latest.current.fitted, latest.current.viewport);
    current.current = value;
    schedulePaint();
    const isZoomed = value.scale > 1.01;
    // The surrounding viewer only needs a render when zoom mode changes.
    if (zoomed.current !== isZoomed) { zoomed.current = isZoomed; latest.current.onScaleChange(value.scale); }
  }
  function reset() { update(initialView()); setDrag(0); lastTap.current = null; }
  function point(event) {
    return { x: event.clientX - rect.current.left - latest.current.viewport.width / 2, y: event.clientY - rect.current.top - latest.current.viewport.height / 2 };
  }
  function toggleZoom(anchor = { x: 0, y: 0 }) { update(zoomAt(current.current, current.current.scale > 1.01 ? 1 : 2.5, anchor)); }
  useImperativeHandle(controls, () => ({ toggleZoom, reset, snapshot: () => item.kind === 'image' ? { url: item.url, width: latest.current.fitted.width, height: latest.current.fitted.height, transform: transform() } : null }));
  useLayoutEffect(() => { reset(); pointers.current.clear(); gesture.current = null; setInteracting(false); paint(); }, [item.id, rotation]);
  useLayoutEffect(() => { paint(); }, [viewport.width, viewport.height, natural.width, natural.height]);
  useEffect(() => () => {
    if (animationFrame.current !== null) {
      if (window.cancelAnimationFrame) window.cancelAnimationFrame(animationFrame.current);
      else window.clearTimeout(animationFrame.current);
    }
  }, []);
  useLayoutEffect(() => {
    function measure() {
      const measured = stage.current?.getBoundingClientRect();
      if (measured?.width && measured?.height) {
        rect.current = measured;
        setViewport(previous => previous.width === measured.width && previous.height === measured.height ? previous : { width: measured.width, height: measured.height });
      }
    }
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (stage.current) observer?.observe(stage.current);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  useEffect(() => { update(current.current); }, [viewport.width, viewport.height, natural.width, natural.height]);
  useEffect(() => { if (video.current) video.current.playbackRate = playbackRate; }, [playbackRate, item.id]);
  useEffect(() => {
    const node = stage.current;
    function wheel(event) {
      if (latest.current.item.kind !== 'image') return;
      event.preventDefault();
      rect.current = node.getBoundingClientRect();
      update(zoomAt(current.current, current.current.scale * Math.exp(-event.deltaY * .002), point(event)));
    }
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, []);

  function start(event) {
    if (event.button !== 0 || pointers.current.size >= 2) return;
    if (!pointers.current.size) rect.current = stage.current.getBoundingClientRect();
    if (item.kind === 'video') {
      const rect = video.current?.getBoundingClientRect();
      // Leave Android/WebView's seek bar, volume and fullscreen controls untouched.
      if (rect && event.clientY >= rect.bottom - 64) return;
    }
    if (item.kind === 'image') {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    const p = point(event);
    pointers.current.set(event.pointerId, p);
    setInteracting(true);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { mode: 'pinch', origin: { ...current.current }, midpoint: midpoint(a, b), distance: Math.max(1, distance(a, b)), wasPinch: true };
      lastTap.current = null;
      setDrag(0);
    } else gesture.current = { mode: 'single', start: p, origin: { ...current.current }, time: Date.now(), moved: false, wasPinch: false };
  }
  function move(event) {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    const p = point(event);
    pointers.current.set(event.pointerId, p);
    const g = gesture.current;
    if (g.mode === 'pinch') {
      if (item.kind !== 'image' || pointers.current.size !== 2) return;
      const [a, b] = [...pointers.current.values()];
      update(zoomAt(g.origin, g.origin.scale * distance(a, b) / g.distance, g.midpoint, midpoint(a, b)));
      return;
    }
    const dx = p.x - g.start.x;
    const dy = p.y - g.start.y;
    if (Math.hypot(dx, dy) > 9) g.moved = true;
    if (current.current.scale > 1.01 && item.kind === 'image') update({ ...current.current, x: g.origin.x + dx, y: g.origin.y + dy });
    else if (!g.wasPinch && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDrag(dx * .7);
    }
  }
  function end(event, cancelled = false) {
    if (!pointers.current.has(event.pointerId)) return;
    const g = gesture.current;
    const p = point(event);
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (cancelled) {
      pointers.current.clear(); gesture.current = null; setDrag(0); setInteracting(false); lastTap.current = null;
      return;
    }
    if (pointers.current.size) {
      gesture.current = { mode: 'single', start: [...pointers.current.values()][0], origin: { ...current.current }, time: Date.now(), moved: true, wasPinch: true };
      return;
    }
    setInteracting(false); setDrag(0); gesture.current = null;
    if (!g || g.mode !== 'single') return;
    if (current.current.scale <= 1.01) {
      const direction = swipeDirection(p.x - g.start.x, p.y - g.start.y, viewport.width, g.wasPinch);
      if (direction) { lastTap.current = null; onNavigate(direction, { offset: (p.x - g.start.x) * .7 }); return; }
    }
    if (event.pointerType === 'touch') {
      lastTouch.current = Date.now();
      if (!g.moved && !g.wasPinch && Date.now() - g.time < 300 && item.kind === 'image') {
        if (lastTap.current && Date.now() - lastTap.current.time < 320 && distance(p, lastTap.current) < 35) { toggleZoom(p); lastTap.current = null; }
        else lastTap.current = { ...p, time: Date.now() };
      } else lastTap.current = null;
    }
  }

  return <div className={`gesture-stage ${interacting ? 'is-interacting' : ''} ${current.current.scale > 1.01 ? 'is-zoomed' : ''}`} ref={stage} data-scale={current.current.scale.toFixed(2)}
    onPointerDown={start} onPointerMove={move} onPointerUp={event => end(event)} onPointerCancel={event => end(event, true)}
    onDoubleClick={event => { if (item.kind === 'image' && Date.now() - lastTouch.current > 600) toggleZoom(point(event)); }}>
    <div ref={content} className="gesture-content" style={{ transform: transform(), width: item.kind === 'image' ? fitted.width : '100%', height: item.kind === 'image' ? fitted.height : '100%' }}>
      {item.kind === 'video' ? <video ref={video} src={item.url} controls playsInline loop={loop} autoPlay={autoPlay} preload="metadata" onEnded={onEnded} onError={onError}/>
        : <img src={item.url} alt={item.name} draggable={false} decoding="async" fetchPriority="high" onLoad={event => {
          const width = event.currentTarget.naturalWidth || 1;
          const height = event.currentTarget.naturalHeight || 1;
          setNatural(previous => previous.width === width && previous.height === height ? previous : { width, height });
        }} onError={onError}/>}
    </div>
    <span ref={zoomLabel} className="zoom-level" hidden={current.current.scale <= 1.01}>{Math.round(current.current.scale * 100)} %</span>
  </div>;
});
