import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { filterMedia, fingerprint, formatBytes, groupMedia, mediaKind } from './lib.js';
import { loadMedia, saveMedia } from './db.js';
import { Gallery, isAndroid, mediaUrl } from './native.js';
import Viewer from './Viewer.jsx';
import { dismissTopOverlay, IconButton, useFocusTrap } from './ui.jsx';

const sections = [
  ['all', 'grid', 'Toda la galería'], ['photos', 'image', 'Fotos'],
  ['videos', 'video', 'Videos'], ['favorites', 'heart', 'Favoritos'],
  ['albums', 'folder', 'Álbumes'], ['trash', 'trash', 'Papelera local'],
];

function Modal({ title, children, onClose }) {
  const ref = useRef(null);
  useFocusTrap(ref, onClose);
  return <div className="modal-backdrop" onClick={onClose}><section className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1} onClick={event => event.stopPropagation()}>
    <div className="modal-heading"><h2>{title}</h2><IconButton icon="close" label="Cerrar" onClick={onClose}/></div>{children}
  </section></div>;
}

function Artwork() {
  return <div className="artwork" aria-hidden="true">
    <div className="art-orbit"/><div className="art-card art-back"><div className="art-sunset"/><div className="art-mountain back"/><div className="art-mountain front"/></div>
    <div className="art-card art-front"><div className="art-sun"/><div className="art-land one"/><div className="art-land two"/><div className="art-land three"/><span><Icon name="image" size={15}/> Buenos momentos</span></div>
    <div className="art-play"><Icon name="play" size={22}/></div><span className="art-star star-one">✦</span><span className="art-star star-two">✦</span>
  </div>;
}

function Thumbnail({ item }) {
  const [thumbnail, setThumbnail] = useState(null);
  const [failed, setFailed] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    setFailed(false);
    if (!item.native) return;
    let alive = true;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      Gallery.thumbnail({ uri: item.uri }).then(result => { if (alive) setThumbnail(result.data); }).catch(() => { if (alive) setFailed(true); });
    }, { rootMargin: '200px' });
    if (ref.current) observer.observe(ref.current);
    return () => { alive = false; observer.disconnect(); };
  }, [item.id, item.native, item.uri]);
  return <div className="thumbnail" ref={ref}>
    {failed ? <div className="media-fallback"><Icon name={item.kind === 'video' ? 'video' : 'image'} size={36}/><span>Abre para ver</span></div>
      : item.native ? (thumbnail ? <img src={thumbnail} alt="" loading="lazy" onError={() => setFailed(true)}/> : <div className="thumbnail-loading"/>)
      : item.kind === 'video' ? <video src={item.url} preload="metadata" muted playsInline onError={() => setFailed(true)}/>
      : <img src={item.url} alt="" loading="lazy" onError={() => setFailed(true)}/>}
  </div>;
}

export default function App() {
  const [items, setItems] = useState([]);
  const [section, setSection] = useState('all');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('newest');
  const [album, setAlbum] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [selecting, setSelecting] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [modal, setModal] = useState(null);
  const [albumName, setAlbumName] = useState('');
  const [sidebar, setSidebar] = useState(false);
  const [compact, setCompact] = useState(false);
  const [light, setLight] = useState(() => localStorage.getItem('luma-theme') === 'light');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState(null);
  const [toast, setToast] = useState('');
  const [dragging, setDragging] = useState(false);
  const filesRef = useRef(null);
  const folderRef = useRef(null);
  const urls = useRef(new Set());
  const dragDepth = useRef(0);
  const mutationLock = useRef(false);
  const refreshRef = useRef(null);
  const notify = message => setToast(message);

  useEffect(() => {
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
    localStorage.setItem('luma-theme', light ? 'light' : 'dark');
  }, [light]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function readAndroid(requestPermission = false, records) {
    const permission = await (requestPermission ? Gallery.requestAccess() : Gallery.access());
    setAccess(permission);
    if (!permission.images && !permission.videos && !permission.limited) {
      setItems([]);
      if (requestPermission) notify('No hay acceso a archivos. Puedes concederlo desde Ajustes o seleccionar fotos.');
      return;
    }
    const saved = records || await loadMedia();
    const metadata = new Map(saved.map(item => [item.id, item]));
    const all = [];
    let offset = 0;
    let more = true;
    while (more) {
      const result = await Gallery.list({ offset, limit: 300 });
      for (const item of result.items) {
        const previous = metadata.get(item.id);
        all.push({ ...item, native: true, url: mediaUrl(item.uri), favorite: previous?.favorite || false, deletedAt: previous?.deletedAt || null, album: previous?.album || item.album });
      }
      offset += result.items.length;
      more = result.hasMore && result.items.length > 0;
    }
    setItems(all);
  }

  useEffect(() => {
    let alive = true;
    async function init() {
      try {
        const saved = await loadMedia();
        if (!alive) return;
        if (isAndroid) await readAndroid(false, saved);
        else setItems(saved.filter(item => !item.native).map(item => {
          const url = URL.createObjectURL(item.blob); urls.current.add(url); return { ...item, url };
        }));
      } catch { if (alive) notify('No se pudo cargar la biblioteca. Revisa el almacenamiento y los permisos.'); }
      finally { if (alive) setLoading(false); }
    }
    init();
    return () => { alive = false; for (const url of urls.current) URL.revokeObjectURL(url); urls.current.clear(); };
  }, []);

  const active = useMemo(() => items.filter(item => !item.deletedAt), [items]);
  const visible = useMemo(() => filterMedia(items, { section, query, type, sort, album }), [items, section, query, type, sort, album]);
  const groups = useMemo(() => groupMedia(visible, sort), [visible, sort]);
  const albums = useMemo(() => [...new Set(active.map(item => item.album))].sort((a, b) => a.localeCompare(b, 'es')), [active]);
  const stats = { all: active.length, photos: active.filter(item => item.kind === 'image').length, videos: active.filter(item => item.kind === 'video').length, favorites: active.filter(item => item.favorite).length, albums: albums.length, trash: items.length - active.length };
  const totalBytes = items.reduce((sum, item) => sum + item.size, 0);
  const title = section === 'albums' && album ? album : sections.find(s => s[0] === section)[2];

  function navigate(value) { setSection(value); setAlbum(''); setSelected(new Set()); setSelecting(false); setQuery(''); setType('all'); setSidebar(false); }
  function toggleSelected(id) { setSelected(current => { const result = new Set(current); result.has(id) ? result.delete(id) : result.add(id); return result; }); }
  function clearSelection() { setSelected(new Set()); setSelecting(false); }
  useEffect(() => {
    if (!isAndroid) return;
    function back() {
      if (viewer || modal) dismissTopOverlay();
      else if (sidebar) setSidebar(false);
      else if (selecting) clearSelection();
      else if (album) setAlbum('');
      else if (section !== 'all') navigate('all');
      else Gallery.minimize();
    }
    window.addEventListener('lumaBack', back);
    return () => window.removeEventListener('lumaBack', back);
  }, [viewer, modal, sidebar, selecting, album, section]);
  async function mutate(changed, remove = []) {
    if (mutationLock.current) return false;
    mutationLock.current = true; setBusy(true);
    try {
      await saveMedia(changed, remove);
      const updates = new Map(changed.map(item => [item.id, item]));
      setItems(current => current.filter(item => !remove.includes(item.id)).map(item => updates.get(item.id) || item));
      for (const item of items.filter(item => remove.includes(item.id))) { if (!item.native) { URL.revokeObjectURL(item.url); urls.current.delete(item.url); } }
      return true;
    } catch { notify('No se guardaron los cambios. Comprueba el espacio disponible.'); return false; }
    finally { mutationLock.current = false; setBusy(false); }
  }
  async function favorite(item) { await mutate([{ ...item, favorite: !item.favorite }]); }
  async function saveEdited({ blob, name, width, height }) {
    if (mutationLock.current) return false;
    mutationLock.current = true; setBusy(true);
    try {
      if (isAndroid) {
        if (blob.size > 18_000_000) throw new Error('La copia supera 18 MB. Elige JPEG o un recorte más pequeño para guardarla.');
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = () => reject(new Error('No se pudo preparar la copia.'));
          reader.readAsDataURL(blob);
        });
        const saved = await Gallery.saveImage({ data, name, mime: blob.type });
        setItems(current => [...current.filter(item => item.id !== saved.id), { ...saved, native: true, url: mediaUrl(saved.uri), favorite: false, deletedAt: null }]);
        notify('Copia guardada en Imágenes/Luma.');
      } else {
        const file = new File([blob], name, { type: blob.type, lastModified: Date.now() });
        const record = { id: crypto.randomUUID(), fingerprint: fingerprint(file), name, blob: file, kind: 'image', type: file.type, size: file.size, date: file.lastModified, width, height, album: 'Ediciones Luma', favorite: false, deletedAt: null };
        await saveMedia([record]);
        const url = URL.createObjectURL(file); urls.current.add(url);
        setItems(current => [...current, { ...record, url }]);
        notify('Copia guardada en Ediciones Luma. Puedes descargarla desde el visor.');
      }
      return true;
    } catch (exception) { notify(exception.message || 'No se pudo guardar la copia. Comprueba el espacio disponible.'); return false; }
    finally { mutationLock.current = false; setBusy(false); }
  }
  async function importFiles(fileList) {
    if (!fileList?.length || mutationLock.current) return;
    mutationLock.current = true; setBusy(true);
    const newItems = [];
    let skipped = 0;
    const known = new Set(items.map(item => item.fingerprint));
    try {
      for (const file of fileList) {
        const kind = mediaKind(file);
        const key = fingerprint(file);
        if (!kind || known.has(key)) { skipped++; continue; }
        known.add(key);
        const path = file.webkitRelativePath?.split('/');
        newItems.push({ id: crypto.randomUUID(), fingerprint: key, name: file.name, type: file.type, kind, size: file.size, date: file.lastModified || Date.now(), album: path?.length > 1 ? path.at(-2) : 'Mi colección', favorite: false, deletedAt: null, blob: file });
      }
      await saveMedia(newItems);
      const ready = newItems.map(item => { const url = URL.createObjectURL(item.blob); urls.current.add(url); return { ...item, url }; });
      setItems(current => [...current, ...ready]);
      notify(`${ready.length} archivo${ready.length === 1 ? '' : 's'} importado${ready.length === 1 ? '' : 's'}${skipped ? ` · ${skipped} duplicados o no compatibles omitidos` : ''}.`);
    } catch { notify('No se pudo importar. Puede que no haya suficiente espacio en el navegador.'); }
    finally { mutationLock.current = false; setBusy(false); if (filesRef.current) filesRef.current.value = ''; if (folderRef.current) folderRef.current.value = ''; }
  }
  async function refresh(request = false) {
    if (mutationLock.current) return;
    mutationLock.current = true; setBusy(true);
    try { await readAndroid(request); clearSelection(); }
    catch { setItems([]); setViewer(null); notify('No se pudo leer la galería. Revisa los permisos de Luma en Ajustes.'); }
    finally { mutationLock.current = false; setBusy(false); }
  }
  refreshRef.current = refresh;
  useEffect(() => {
    if (!isAndroid || loading) return;
    let disposed = false;
    let listener;
    Gallery.addListener('libraryChanged', () => refreshRef.current()).then(handle => {
      if (disposed) handle.remove(); else listener = handle;
    });
    return () => { disposed = true; listener?.remove(); };
  }, [loading]);
  async function batch(action) {
    const targets = items.filter(item => selected.has(item.id));
    if (action === 'album') { setAlbumName(''); setModal('album'); return; }
    const changed = targets.map(item => action === 'favorite' ? { ...item, favorite: true } : { ...item, deletedAt: action === 'trash' ? Date.now() : null });
    if (await mutate(changed)) { clearSelection(); notify(action === 'trash' ? 'Movidos a la papelera local. Los originales siguen en tu dispositivo.' : 'Cambios guardados.'); }
  }
  async function saveAlbum(event) {
    event.preventDefault();
    const name = albumName.trim();
    if (!name) return;
    if (await mutate(items.filter(item => selected.has(item.id)).map(item => ({ ...item, album: name })))) { setModal(null); clearSelection(); notify(`Archivos organizados en «${name}».`); }
  }
  const importButton = (className = 'button primary') => <button className={className} disabled={busy || loading} onClick={() => isAndroid ? refresh(true) : filesRef.current.click()}><Icon name={isAndroid ? 'shield' : 'plus'} size={18}/>{busy ? 'Procesando…' : isAndroid ? (active.length ? 'Gestionar acceso' : 'Dar acceso a mi galería') : 'Añadir archivos'}</button>;

  return <div className="app" onDragEnter={event => { if (isAndroid || !event.dataTransfer.types.includes('Files')) return; event.preventDefault(); dragDepth.current++; setDragging(true); }} onDragOver={event => { if (!isAndroid) event.preventDefault(); }} onDragLeave={event => { if (isAndroid) return; event.preventDefault(); if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }} onDrop={event => { if (isAndroid) return; event.preventDefault(); setDragging(false); dragDepth.current = 0; importFiles(event.dataTransfer.files); }}>
    <input ref={filesRef} type="file" accept="image/*,video/*" multiple hidden onChange={event => importFiles(event.target.files)}/>
    <input ref={folderRef} type="file" accept="image/*,video/*" multiple webkitdirectory="" hidden onChange={event => importFiles(event.target.files)}/>
    {sidebar && <div className="sidebar-scrim" onClick={() => setSidebar(false)}/>}
    <aside className={`sidebar ${sidebar ? 'open' : ''}`}>
      <a className="brand" href="#" onClick={event => { event.preventDefault(); navigate('all'); }}><span className="brand-mark">l<span/></span><span>luma<span className="brand-dot">.</span></span></a>
      <span className="sidebar-label">TU ESPACIO PERSONAL</span>
      <nav aria-label="Navegación principal">{sections.map(([key, icon, label], index) => <React.Fragment key={key}>{index === 3 && <div className="nav-divider"/>}<button className={`nav-item ${section === key ? 'active' : ''}`} onClick={() => navigate(key)} aria-current={section === key ? 'page' : undefined}><Icon name={icon}/><span>{label}</span><span className="nav-count">{stats[key]}</span></button></React.Fragment>)}</nav>
      <div className="sidebar-bottom"><div className="local-card"><span className="local-icon"><Icon name="shield" size={21}/></span><strong>Solo tuyo. Siempre.</strong><p>Tus recuerdos se quedan en tu dispositivo, sin subirlos a la nube.</p><div className="local-total"><span>{isAndroid ? 'Archivos accesibles' : 'Biblioteca local'}</span><strong>{formatBytes(totalBytes)}</strong></div></div>
      <button className="theme-button" onClick={() => setLight(!light)}><Icon name={light ? 'moon' : 'sun'} size={18}/><span>{light ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}</span></button><div className="sidebar-foot">LUMA GALLERY <span>v1.2</span></div></div>
    </aside>

    <div className="workspace"><header className="topbar"><div className="topbar-left"><span className="mobile-menu"><IconButton icon="menu" label="Abrir menú" onClick={() => setSidebar(true)}/></span><span className="breadcrumb">Mi biblioteca</span><Icon name="chevron" size={13}/><strong>{title}</strong></div><div className="topbar-right"><span className="local-badge"><span/>{isAndroid ? 'En tu Android' : 'Almacenamiento local'}</span><button className="avatar" onClick={() => setModal('about')} aria-label="Acerca de Luma">L</button></div></header>
      <main>
        <section className="page-heading"><div><div className="eyebrow"><span/>{section === 'trash' ? 'UN POCO DE ORDEN' : 'TUS MOMENTOS, A TU MANERA'}</div><h1>{title}<span className="heading-dot">.</span></h1><p>{section === 'trash' ? 'Ocultos en Luma. Los archivos originales no se eliminan del dispositivo.' : section === 'favorites' ? 'Esos recuerdos a los que siempre quieres volver.' : section === 'albums' ? 'Una historia para cada colección.' : 'Cada foto, cada video. Todo en un mismo lugar.'}</p></div><div className="heading-actions">{isAndroid && <IconButton icon="restore" label="Actualizar galería" onClick={() => refresh()} disabled={busy || loading}/>} {importButton()}</div></section>

        {section === 'all' && !query && <section className="welcome-banner"><div><span className="banner-tag"><Icon name="spark" size={14}/> HECHO PARA TUS RECUERDOS</span><h2>Lo cotidiano también<br/>merece un lugar especial.</h2><p>Explora, organiza y vuelve a vivir tus mejores momentos.</p><div className="banner-stats"><span><Icon name="image" size={16}/><strong>{stats.photos}</strong> fotos</span><i/><span><Icon name="video" size={16}/><strong>{stats.videos}</strong> videos</span><i/><span><Icon name="heart" size={16}/><strong>{stats.favorites}</strong> favoritos</span></div></div><Artwork/></section>}

        {isAndroid && access && (access.limited || !access.images || !access.videos) && <div className="access-banner"><Icon name="shield"/><div><strong>{access.limited ? 'Acceso a fotos y videos seleccionados' : 'Acceso parcial a tu galería'}</strong><span>Para ver toda la galería, permite fotos y videos en los ajustes de Android.</span></div><button className="text-button" disabled={busy} onClick={() => Gallery.openSettings().catch(() => notify('Abre Ajustes → Aplicaciones → Luma → Permisos.'))}>Abrir ajustes <Icon name="chevron" size={15}/></button></div>}

        <div className="library-toolbar"><div className="filter-tabs" role="group" aria-label="Filtrar archivos">{[['all', 'Todo'], ['image', 'Fotos'], ['video', 'Videos']].map(([value, label]) => <button key={value} className={type === value ? 'active' : ''} onClick={() => { setType(value); clearSelection(); }}>{label}</button>)}</div><div className="toolbar-tools"><label className="search-field"><Icon name="search" size={17}/><input value={query} onChange={event => { setQuery(event.target.value); clearSelection(); }} placeholder="Buscar en tu galería…" aria-label="Buscar por nombre o álbum"/>{query && <IconButton icon="close" size={14} label="Borrar búsqueda" onClick={() => setQuery('')}/>}</label><label className="sort-field"><Icon name="sort" size={17}/><select value={sort} aria-label="Ordenar archivos" onChange={event => setSort(event.target.value)}><option value="newest">Más recientes</option><option value="oldest">Más antiguos</option><option value="name">Nombre A–Z</option><option value="size">Mayor tamaño</option></select></label><IconButton icon="grid" label={compact ? 'Miniaturas grandes' : 'Miniaturas pequeñas'} active={compact} onClick={() => setCompact(!compact)}/></div></div>

        {section === 'albums' && !album && albums.length > 0 && <section className="album-grid" aria-label="Álbumes">{albums.filter(name => name.toLowerCase().includes(query.toLowerCase())).map(name => { const members = active.filter(item => item.album === name); return <button className="album-card" key={name} onClick={() => { setAlbum(name); setQuery(''); }}><div className="album-cover"><Thumbnail item={members[0]}/><span><Icon name="folder"/></span></div><strong>{name}</strong><span>{members.length} archivos</span></button>; })}</section>}

        {!(section === 'albums' && !album && albums.length > 0) && <>
          <div className="collection-heading"><div><h2>{query ? 'Resultados de búsqueda' : section === 'all' ? 'Tu colección' : title}</h2><span>{visible.length} {visible.length === 1 ? 'archivo' : 'archivos'}</span></div><div>{album && <button className="text-button" onClick={() => { setAlbum(''); clearSelection(); }}>Todos los álbumes</button>}{visible.length > 0 && <button className="text-button" onClick={() => { setSelecting(!selecting); setSelected(new Set()); }}><Icon name={selecting ? 'close' : 'check'} size={16}/>{selecting ? 'Cancelar' : 'Seleccionar'}</button>}</div></div>
          {loading ? <div className="empty-state"><div className="spinner"/><h2>Leyendo tu biblioteca…</h2><p>Preparando tus fotos y videos.</p></div>
            : visible.length === 0 ? <section className="empty-state"><div className="empty-icon"><Icon name={query ? 'search' : section === 'favorites' ? 'heart' : section === 'trash' ? 'trash' : 'image'} size={32}/><span>✦</span></div><h2>{query ? 'No encontramos coincidencias' : section === 'favorites' ? 'Un lugar para tus favoritos' : section === 'trash' ? 'Todo en su lugar' : active.length ? 'Nada por aquí, todavía' : 'Tu historia empieza aquí'}</h2><p>{query ? 'Prueba con otro nombre de archivo o álbum.' : section === 'favorites' ? 'Toca el corazón en una foto o video para guardarlo aquí.' : section === 'trash' ? 'Los archivos que ocultes de Luma aparecerán aquí.' : active.length ? 'Prueba otro filtro o añade archivos a esta colección.' : isAndroid ? 'Dale acceso a Luma para descubrir las fotos y videos de tu Android.' : 'Añade tus fotos y videos, y dales el espacio que merecen.'}</p>{!active.length && section !== 'trash' && section !== 'favorites' && <div className="empty-actions">{importButton()} {!isAndroid && <button className="button secondary" disabled={busy} onClick={() => folderRef.current.click()}><Icon name="folder" size={17}/>Abrir carpeta</button>}</div>}<span className="empty-note"><Icon name="shield" size={13}/>{isAndroid ? 'Tú decides a qué archivos dar acceso' : 'Privado, local y sin necesidad de una cuenta'}</span></section>
            : <div className={`media-collection ${compact ? 'compact' : ''}`}>{groups.map(([label, members]) => <section className="date-group" key={label}><div className="date-heading"><h3>{label}</h3><span>{members.length}</span><div/></div><div className="media-grid">{members.map(item => <article className={`media-card ${selected.has(item.id) ? 'selected' : ''}`} key={item.id}>
              <button className="media-open" aria-label={`${selecting ? 'Seleccionar' : 'Ver'} ${item.name}`} onClick={() => selecting ? toggleSelected(item.id) : setViewer(item.id)}><Thumbnail item={item}/></button>
              {(selecting || selected.has(item.id)) && <button className="select-check" aria-label={`${selected.has(item.id) ? 'Deseleccionar' : 'Seleccionar'} ${item.name}`} aria-pressed={selected.has(item.id)} onClick={() => toggleSelected(item.id)}>{selected.has(item.id) && <Icon name="check" size={14}/>}</button>}
              {!selecting && section !== 'trash' && <button className={`card-favorite ${item.favorite ? 'liked' : ''}`} aria-label={`${item.favorite ? 'Quitar de' : 'Añadir a'} favoritos: ${item.name}`} aria-pressed={item.favorite} disabled={busy} onClick={() => favorite(item)}><Icon name="heart" size={16}/></button>}
              {item.kind === 'video' && <span className="video-badge"><Icon name="play" size={12}/>{item.duration ? `${Math.floor(item.duration / 60000)}:${String(Math.floor(item.duration / 1000) % 60).padStart(2, '0')}` : 'Video'}</span>}
              <div className="media-caption"><span title={item.name}>{item.name}</span><small>{formatBytes(item.size)}</small></div>
            </article>)}</div></section>)}</div>}
        </>}
        <footer className="page-footer"><span><span className="status-dot"/>Tus recuerdos. Tu espacio.</span><span>Diseñado para disfrutar lo que importa <Icon name="spark" size={13}/></span></footer>
      </main>
    </div>
    {selecting && <div className="selection-bar" role="region" aria-label="Acciones de selección"><strong>{selected.size} seleccionados</strong><button className="text-button" onClick={() => setSelected(new Set(visible.map(item => item.id)))}>Todos</button><div className="selection-actions">{section === 'trash' ? <><button className="button secondary" disabled={!selected.size || busy} onClick={() => batch('restore')}><Icon name="restore" size={17}/>Restaurar</button><button className="button danger" disabled={!selected.size || busy} onClick={() => setModal('delete')}>Quitar de Luma</button></> : <><IconButton icon="heart" label="Marcar favoritos" disabled={!selected.size || busy} onClick={() => batch('favorite')}/><IconButton icon="folder" label="Organizar en álbum" disabled={!selected.size || busy} onClick={() => batch('album')}/><IconButton icon="trash" label="Mover a papelera local" disabled={!selected.size || busy} onClick={() => batch('trash')}/></>}<IconButton icon="close" label="Cancelar selección" onClick={clearSelection}/></div></div>}
    {viewer && <Viewer items={visible} id={viewer} onClose={() => setViewer(null)} onFavorite={favorite} onSaveEdited={saveEdited} notify={notify} busy={busy}/>}
    {modal === 'album' && <Modal title="Organizar en álbum" onClose={() => setModal(null)}><p>Elige un álbum existente o crea uno. Esta organización solo cambia dentro de Luma.</p><form onSubmit={saveAlbum}><label className="form-label" htmlFor="album-name">Nombre del álbum</label><input id="album-name" className="form-input" list="album-suggestions" value={albumName} onChange={event => setAlbumName(event.target.value)} maxLength={80} required placeholder="Por ejemplo, Escapadas"/><datalist id="album-suggestions">{albums.map(name => <option value={name} key={name}/>)}</datalist><div className="modal-buttons"><button type="button" className="button secondary" onClick={() => setModal(null)}>Cancelar</button><button className="button primary" disabled={busy || !albumName.trim()}>Guardar álbum</button></div></form></Modal>}
    {modal === 'delete' && <Modal title="¿Quitar de la biblioteca local?" onClose={() => setModal(null)}><p>Se quitarán {selected.size} archivos y sus favoritos de Luma.{isAndroid ? ' Los originales de Android seguirán en el dispositivo y volverán a aparecer al actualizar la galería.' : ' Las copias importadas se eliminarán del navegador; los originales de tu dispositivo seguirán intactos.'}</p><div className="modal-buttons"><button className="button secondary" onClick={() => setModal(null)}>Cancelar</button><button className="button danger" disabled={busy} onClick={async () => { if (await mutate([], [...selected])) { clearSelection(); setModal(null); notify('Archivos quitados de Luma.'); } }}>Quitar de Luma</button></div></Modal>}
    {modal === 'about' && <Modal title="Tu espacio, con Luma" onClose={() => setModal(null)}><p>Luma organiza tus fotos y videos de forma local. No usa cuentas, servidores de archivos ni analíticas.</p><div className="about-feature"><Icon name="shield"/><p>{isAndroid ? 'Android controla el acceso a tu galería. Puedes cambiar los permisos en Ajustes → Aplicaciones → Luma → Permisos.' : 'Esta es la versión para navegador. Para consultar toda la galería con permisos, instala la versión Android.'}</p></div><p>Favoritos, álbumes y papelera son locales a Luma. No modifican los archivos originales. Los formatos compatibles dependen de tu dispositivo.</p><button className="button primary" onClick={() => setModal(null)}>Entendido</button></Modal>}
    {dragging && <div className="drop-overlay"><Icon name="plus" size={48}/><h2>Suelta tus recuerdos aquí</h2><p>Fotos y videos, juntos en tu galería</p></div>}
    {toast && <div className="toast" role="status"><Icon name="info" size={19}/><span>{toast}</span><IconButton icon="close" label="Cerrar aviso" onClick={() => setToast('')}/></div>}
    <div className="sr-only" aria-live="polite">{busy ? 'Procesando archivos' : ''}</div>
  </div>;
}
