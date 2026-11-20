import React, { memo, useEffect, useReducer, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { IconButton, useFocusTrap } from './ui.jsx';
import { CROP_RATIOS, FILTERS, editReducer, editedFilename, exportPhoto, filterThumbnail, fullCrop, initialEdit, initialHistory, moveCrop, orientedSize, ratioCrop, renderEdit, resizeCrop } from './photo-editing.js';

const tools = [['filters', 'filters', 'Filtros'], ['adjust', 'sliders', 'Ajustar'], ['crop', 'crop', 'Recortar'], ['transform', 'rotate', 'Girar']];

const FilterPreset = memo(function FilterPreset({ filter, thumbnail, active, disabled, dispatch, setCompare }) {
  return <button className={`filter-preset ${active ? 'active' : ''}`} disabled={disabled} aria-pressed={active} onClick={() => { setCompare(false); dispatch({ type: 'change', patch: { filter: filter.id } }); }}>
    <span>{thumbnail && <img src={thumbnail} alt="" draggable={false} loading="lazy" decoding="async" style={{ filter: filter.css }} />}{active && <i><Icon name="check" size={14}/></i>}</span>
    <strong>{filter.name}</strong>
  </button>;
});

export default function PhotoEditor({ item, onClose, onSave }) {
  const ref = useRef(null);
  const canvas = useRef(null);
  const stage = useRef(null);
  const frame = useRef(null);
  const image = useRef(null);
  const cropGesture = useRef(null);
  const [history, dispatch] = useReducer(editReducer, undefined, initialHistory);
  const edit = history.present;
  const [tool, setTool] = useState('filters');
  const [compare, setCompare] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [thumbnail, setThumbnail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [mime, setMime] = useState(item.type === 'image/png' ? 'image/png' : 'image/jpeg');
  const [preview, setPreview] = useState({ width: 1, height: 1 });
  const [viewport, setViewport] = useState({ width: 640, height: 480 });
  useFocusTrap(ref, () => { if (!saving) onClose(); });

  useEffect(() => {
    let alive = true;
    const source = new Image();
    source.decoding = 'async';
    source.onload = () => {
      if (!alive) return;
      image.current = source; setLoaded(true);
      try { setThumbnail(filterThumbnail(source)); } catch { setThumbnail(''); }
    };
    source.onerror = () => { if (alive) setError('No se pudo abrir esta imagen. Comprueba el formato y los permisos.'); };
    source.src = item.url;
    return () => { alive = false; source.onload = null; source.onerror = null; image.current = null; };
  }, [item.url]);

  useEffect(() => {
    function measure() {
      const rect = stage.current?.getBoundingClientRect();
      if (rect?.width && rect?.height) setViewport({ width: Math.max(1, rect.width - 40), height: Math.max(1, rect.height - 40) });
    }
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (stage.current) observer?.observe(stage.current);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const tick = window.requestAnimationFrame(() => {
      try {
        const previewEdit = compare ? initialEdit() : tool === 'crop' ? { ...edit, crop: fullCrop() } : edit;
        setPreview(renderEdit(canvas.current, image.current, previewEdit, { preview: true, mime }));
      } catch (exception) { setError(exception.message); }
    });
    return () => window.cancelAnimationFrame(tick);
  }, [loaded, edit, tool, compare, mime]);

  useEffect(() => {
    function keys(event) {
      if (saving || !event.ctrlKey && !event.metaKey || event.key.toLowerCase() !== 'z') return;
      event.preventDefault(); dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
    }
    document.addEventListener('keydown', keys);
    return () => document.removeEventListener('keydown', keys);
  }, [saving]);

  const oriented = loaded ? orientedSize(image.current.naturalWidth, image.current.naturalHeight, edit.rotation) : { width: 1, height: 1 };
  const imageAspect = oriented.width / oriented.height;
  const cropAspect = edit.ratio === 'original' ? imageAspect : CROP_RATIOS.find(ratio => ratio[0] === edit.ratio)?.[2] || null;
  const displayScale = Math.min(viewport.width / preview.width, viewport.height / preview.height);
  const change = patch => { setCompare(false); dispatch({ type: 'change', patch }); };
  const commit = () => dispatch({ type: 'commit' });

  function chooseRatio(value) {
    const aspect = value === 'original' ? imageAspect : CROP_RATIOS.find(ratio => ratio[0] === value)[2];
    change({ ratio: value, crop: aspect ? ratioCrop(aspect, imageAspect, .92) : fullCrop() });
  }
  function rotate() {
    const rotation = (edit.rotation + 90) % 360;
    const size = orientedSize(image.current.naturalWidth, image.current.naturalHeight, rotation);
    const aspect = edit.ratio === 'original' ? size.width / size.height : cropAspect;
    change({ rotation, crop: aspect ? ratioCrop(aspect, size.width / size.height) : fullCrop() });
  }
  function cropStart(event) {
    if (saving || event.button !== 0 || cropGesture.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    cropGesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, crop: edit.crop, corner: event.target.dataset.corner || null };
    setCompare(false);
  }
  function cropMove(event) {
    const g = cropGesture.current;
    if (!g || g.id !== event.pointerId) return;
    const rect = frame.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dx = (event.clientX - g.x) / rect.width;
    const dy = (event.clientY - g.y) / rect.height;
    const crop = g.corner ? resizeCrop(g.crop, g.corner, dx, dy, cropAspect, imageAspect) : moveCrop(g.crop, dx, dy);
    dispatch({ type: 'preview', patch: { crop } });
  }
  function cropEnd(event, cancelled = false) {
    if (!cropGesture.current || cropGesture.current.id !== event.pointerId) return;
    if (cancelled) dispatch({ type: 'preview', patch: { crop: cropGesture.current.crop } });
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    cropGesture.current = null;
    commit();
  }
  function cropKeys(event) {
    const delta = { ArrowLeft: [-.01, 0], ArrowRight: [.01, 0], ArrowUp: [0, -.01], ArrowDown: [0, .01] }[event.key];
    if (!delta || saving) return;
    event.preventDefault();
    change({ crop: event.shiftKey ? resizeCrop(edit.crop, 'se', ...delta, cropAspect, imageAspect) : moveCrop(edit.crop, ...delta) });
  }
  async function save() {
    if (!loaded || saving) return;
    setSaving(true); setError(''); commit();
    try {
      const result = await exportPhoto(image.current, edit, mime);
      if (await onSave({ ...result, name: editedFilename(item.name, mime) })) onClose();
    } catch (exception) { setError(exception.message || 'No se pudo guardar la copia.'); }
    finally { setSaving(false); }
  }

  return <section className="photo-editor" ref={ref} role="dialog" aria-modal="true" aria-label={`Editar ${item.name}`} tabIndex={-1}>
    <header className="editor-header"><IconButton icon="close" label="Cerrar editor" disabled={saving} onClick={onClose}/><div><h2>Estudio Luma<span>Editar foto</span></h2><p>{item.name}</p></div><div className="editor-history"><IconButton icon="undo" label="Deshacer edición" disabled={saving || !history.past.length && !history.draft} onClick={() => dispatch({ type: 'undo' })}/><IconButton icon="redo" label="Rehacer edición" disabled={saving || !history.future.length} onClick={() => dispatch({ type: 'redo' })}/></div><button className="button primary editor-save" disabled={!loaded || saving} onClick={save}><Icon name={saving ? 'restore' : 'download'} size={17}/>{saving ? 'Guardando…' : 'Guardar copia'}</button></header>
    <div className="editor-layout"><div className="editor-preview-area"><div className="editor-preview-top"><span><Icon name="shield" size={13}/>Tu original se conserva</span><button className={`compare-button ${compare ? 'active' : ''}`} disabled={!loaded || saving} aria-pressed={compare} onClick={() => setCompare(!compare)}><Icon name="compare" size={16}/>{compare ? 'Volver a edición' : 'Comparar original'}</button></div>
      <div className="editor-stage" ref={stage}>{!loaded ? <div className="editor-loading">{!error && <div className="spinner"/>}<p>{error || 'Preparando tu foto…'}</p></div> : <div className="editor-image-frame" ref={frame} style={{ width: preview.width * displayScale, height: preview.height * displayScale }}>
        <canvas ref={canvas} aria-label="Vista previa de la edición"/>
        {tool === 'crop' && !compare && <div className="crop-overlay" style={{ left: `${edit.crop.x * 100}%`, top: `${edit.crop.y * 100}%`, width: `${edit.crop.width * 100}%`, height: `${edit.crop.height * 100}%` }} tabIndex={0} role="group" aria-label="Área de recorte. Arrastra para mover; flechas para ajustar, Mayúsculas y flechas para cambiar tamaño." onPointerDown={cropStart} onPointerMove={cropMove} onPointerUp={event => cropEnd(event)} onPointerCancel={event => cropEnd(event, true)} onKeyDown={cropKeys}>
          <div className="crop-thirds"/>{[['nw', 'superior izquierda'], ['ne', 'superior derecha'], ['sw', 'inferior izquierda'], ['se', 'inferior derecha']].map(([corner, label]) => <button key={corner} className={`crop-handle ${corner}`} data-corner={corner} aria-label={`Esquina ${label} del recorte`} disabled={saving}/>)}
          <span className="crop-size">{Math.round(oriented.width * edit.crop.width)} × {Math.round(oriented.height * edit.crop.height)}</span>
        </div>}
        {compare && <span className="original-label">ORIGINAL</span>}
      </div>}</div>
      {error && loaded && <div className="editor-error" role="alert"><Icon name="info" size={16}/>{error}</div>}
      <div className="editor-preview-note">{tool === 'crop' ? 'Arrastra el marco y sus esquinas para recortar' : 'Los cambios se aplican a una copia nueva'}</div>
    </div><aside className="editor-panel"><nav className="editor-tabs" aria-label="Herramientas de edición">{tools.map(([key, icon, name]) => <button key={key} className={tool === key ? 'active' : ''} disabled={saving} onClick={() => { commit(); setCompare(false); setTool(key); }}><Icon name={icon} size={19}/><span>{name}</span></button>)}</nav>
      <div className="editor-settings"><h3>{tools.find(([key]) => key === tool)[2]}<span>{tool === 'filters' ? `${FILTERS.length} estilos para tus fotos` : tool === 'adjust' ? 'Encuentra el equilibrio perfecto' : tool === 'crop' ? 'Quédate con lo que importa' : 'Una nueva perspectiva'}</span></h3>
      {tool === 'filters' && <div className="preset-grid">{FILTERS.map(filter => <FilterPreset key={filter.id} filter={filter} thumbnail={thumbnail} active={edit.filter === filter.id} disabled={!loaded || saving} dispatch={dispatch} setCompare={setCompare}/>)}</div>}
      {tool === 'adjust' && <div className="adjustment-list">{[['brightness', 'Brillo', 'sun', 20, 200], ['contrast', 'Contraste', 'contrast', 20, 200], ['saturation', 'Saturación', 'filters', 0, 200]].map(([key, label, icon, min, max]) => <label key={key} className="adjustment"><span><Icon name={icon} size={17}/>{label}<output>{edit[key] - 100 > 0 ? '+' : ''}{edit[key] - 100}</output></span><input type="range" aria-label={label} min={min} max={max} value={edit[key]} disabled={!loaded || saving} onChange={event => { setCompare(false); dispatch({ type: 'preview', patch: { [key]: Number(event.target.value) } }); }} onPointerUp={commit} onPointerCancel={commit} onBlur={commit} onKeyUp={commit}/></label>)}<button className="text-button" disabled={saving} onClick={() => change({ brightness: 100, contrast: 100, saturation: 100 })}>Restablecer ajustes</button></div>}
      {tool === 'crop' && <div className="crop-settings"><div className="ratio-options">{CROP_RATIOS.map(([key, name]) => <button key={key} className={edit.ratio === key ? 'active' : ''} aria-pressed={edit.ratio === key} disabled={!loaded || saving} onClick={() => chooseRatio(key)}>{name}</button>)}</div><label className="adjustment"><span>Tamaño del recorte<output>{Math.round(Math.max(edit.crop.width, edit.crop.height) * 100)} %</output></span><input type="range" min="15" max="100" aria-label="Tamaño del recorte" value={Math.round(Math.max(edit.crop.width, edit.crop.height) * 100)} disabled={!loaded || saving} onChange={event => { const coverage = Number(event.target.value) / 100; const aspect = cropAspect || imageAspect * edit.crop.width / edit.crop.height; dispatch({ type: 'preview', patch: { crop: ratioCrop(aspect, imageAspect, coverage, { x: edit.crop.x + edit.crop.width / 2, y: edit.crop.y + edit.crop.height / 2 }) } }); }} onPointerUp={commit} onPointerCancel={commit} onBlur={commit} onKeyUp={commit}/></label><p className="editor-help">Mueve el marco con un dedo. Arrastra las esquinas para cambiar su tamaño. También puedes usar las flechas del teclado.</p><button className="text-button" disabled={saving} onClick={() => change({ ratio: 'free', crop: fullCrop() })}>Usar imagen completa</button></div>}
      {tool === 'transform' && <div className="transform-options"><button disabled={!loaded || saving} onClick={rotate}><Icon name="rotate"/><span>Girar 90°<small>{edit.rotation}°</small></span></button><button className={edit.flipX ? 'active' : ''} aria-pressed={edit.flipX} disabled={!loaded || saving} onClick={() => change({ flipX: !edit.flipX })}><Icon name="flip"/><span>Voltear horizontal</span></button><button className={edit.flipY ? 'active' : ''} aria-pressed={edit.flipY} disabled={!loaded || saving} onClick={() => change({ flipY: !edit.flipY })}><Icon name="flip" style={{ transform: 'rotate(90deg)' }}/><span>Voltear vertical</span></button></div>}
      <div className="export-settings"><label htmlFor="export-format">Formato de la copia</label><select id="export-format" value={mime} disabled={saving} onChange={event => setMime(event.target.value)}><option value="image/jpeg">JPEG · fotografía</option><option value="image/png">PNG · conserva transparencias</option></select><p>Hasta 4096 px y 12 megapíxeles. No modifica el original ni copia sus datos de ubicación.</p></div><button className="reset-editor" disabled={saving} onClick={() => { setCompare(false); dispatch({ type: 'reset' }); }}><Icon name="restore" size={16}/>Restablecer edición</button>
      </div></aside></div>
  </section>;
}
