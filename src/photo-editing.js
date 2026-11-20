import { clamp } from './gestures.js';

export const FILTERS = [
  { id: 'original', name: 'Original', css: 'none' },
  { id: 'vivid', name: 'Vivo', css: 'saturate(1.4) contrast(1.12)' },
  { id: 'warm', name: 'Cálido', css: 'sepia(.22) saturate(1.2)' },
  { id: 'cool', name: 'Frío', css: 'saturate(.85) hue-rotate(18deg) contrast(1.06)' },
  { id: 'noir', name: 'Noir', css: 'grayscale(1) contrast(1.3)' },
  { id: 'vintage', name: 'Vintage', css: 'sepia(.48) contrast(.9) saturate(.8)' },
  { id: 'soft', name: 'Suave', css: 'contrast(.85) brightness(1.08) saturate(.85)' },
  { id: 'cinema', name: 'Cine', css: 'contrast(1.2) saturate(.72) sepia(.12)' },
  { id: 'sunset', name: 'Atardecer', css: 'sepia(.35) saturate(1.45) hue-rotate(-12deg) brightness(1.04)' },
  { id: 'aurora', name: 'Aurora', css: 'hue-rotate(25deg) saturate(1.35) contrast(1.08)' },
  { id: 'ocean', name: 'Océano', css: 'sepia(.15) hue-rotate(155deg) saturate(1.15) contrast(1.08)' },
  { id: 'forest', name: 'Bosque', css: 'hue-rotate(20deg) saturate(1.2) brightness(.95) contrast(1.12)' },
  { id: 'desert', name: 'Desierto', css: 'sepia(.42) saturate(.9) contrast(1.12) brightness(1.05)' },
  { id: 'coral', name: 'Coral', css: 'sepia(.2) hue-rotate(-22deg) saturate(1.3) brightness(1.06)' },
  { id: 'lavender', name: 'Lavanda', css: 'sepia(.18) hue-rotate(270deg) saturate(.8) brightness(1.08)' },
  { id: 'matte', name: 'Mate', css: 'contrast(.78) saturate(.85) brightness(1.12)' },
  { id: 'bold', name: 'Intenso', css: 'contrast(1.3) saturate(1.55) brightness(.97)' },
  { id: 'portrait', name: 'Retrato', css: 'sepia(.08) saturate(.95) contrast(.94) brightness(1.08)' },
  { id: 'urban', name: 'Urbano', css: 'saturate(.5) contrast(1.35) brightness(.95)' },
  { id: 'silver', name: 'Plata', css: 'grayscale(1) contrast(.92) brightness(1.12)' },
  { id: 'ink', name: 'Tinta', css: 'grayscale(1) contrast(1.65) brightness(.92)' },
  { id: 'sepia', name: 'Sepia', css: 'sepia(1) saturate(.75) contrast(1.05)' },
  { id: 'polaroid', name: 'Polaroid', css: 'sepia(.22) saturate(.8) contrast(1.08) brightness(1.08)' },
  { id: 'pastel', name: 'Pastel', css: 'saturate(.62) contrast(.82) brightness(1.15)' },
];
export const CROP_RATIOS = [['free', 'Libre', null], ['original', 'Original', null], ['square', '1:1', 1], ['landscape', '4:3', 4 / 3], ['portrait', '3:4', 3 / 4], ['wide', '16:9', 16 / 9], ['story', '9:16', 9 / 16]];
export const fullCrop = () => ({ x: 0, y: 0, width: 1, height: 1 });
export const initialEdit = () => ({ filter: 'original', brightness: 100, contrast: 100, saturation: 100, rotation: 0, flipX: false, flipY: false, ratio: 'free', crop: fullCrop() });
export const initialHistory = () => ({ past: [], present: initialEdit(), future: [], draft: null });
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function commitDraft(state) {
  if (!state.draft) return state;
  return { ...state, past: equal(state.draft, state.present) ? state.past : [...state.past, state.draft].slice(-50), future: equal(state.draft, state.present) ? state.future : [], draft: null };
}

export function editReducer(state, action) {
  if (action.type === 'preview') return { ...state, draft: state.draft || state.present, present: { ...state.present, ...action.patch } };
  const ready = commitDraft(state);
  if (action.type === 'commit') return ready;
  if (action.type === 'undo') {
    if (!ready.past.length) return ready;
    return { past: ready.past.slice(0, -1), present: ready.past.at(-1), future: [ready.present, ...ready.future], draft: null };
  }
  if (action.type === 'redo') {
    if (!ready.future.length) return ready;
    return { past: [...ready.past, ready.present].slice(-50), present: ready.future[0], future: ready.future.slice(1), draft: null };
  }
  const next = action.type === 'reset' ? initialEdit() : { ...ready.present, ...action.patch };
  if (equal(next, ready.present)) return ready;
  return { past: [...ready.past, ready.present].slice(-50), present: next, future: [], draft: null };
}

export function imageFilter(edit) {
  const preset = FILTERS.find(filter => filter.id === edit.filter)?.css || 'none';
  return `${preset === 'none' ? '' : `${preset} `}brightness(${edit.brightness / 100}) contrast(${edit.contrast / 100}) saturate(${edit.saturation / 100})`;
}

export function filterThumbnail(image, maxDimension = 160) {
  const canvas = document.createElement('canvas');
  try {
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return '';
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .75);
  } finally { canvas.width = 1; canvas.height = 1; }
}

export function orientedSize(width, height, rotation) {
  return Math.abs(rotation % 180) === 90 ? { width: height, height: width } : { width, height };
}

export function ratioCrop(ratio, imageAspect, coverage = 1, center = { x: .5, y: .5 }) {
  const normalized = ratio ? ratio / imageAspect : 1;
  const width = Math.min(1, normalized) * coverage;
  const height = Math.min(1, 1 / normalized) * coverage;
  return { x: clamp(center.x - width / 2, 0, 1 - width), y: clamp(center.y - height / 2, 0, 1 - height), width, height };
}

export function moveCrop(crop, dx, dy) {
  return { ...crop, x: clamp(crop.x + dx, 0, 1 - crop.width), y: clamp(crop.y + dy, 0, 1 - crop.height) };
}

export function resizeCrop(crop, corner, dx, dy, aspect = null, imageAspect = 1) {
  const left = corner.includes('w');
  const top = corner.includes('n');
  const anchorX = left ? crop.x + crop.width : crop.x;
  const anchorY = top ? crop.y + crop.height : crop.y;
  const maxWidth = left ? anchorX : 1 - anchorX;
  const maxHeight = top ? anchorY : 1 - anchorY;
  let width = clamp(crop.width + dx * (left ? -1 : 1), Math.min(.05, maxWidth), maxWidth);
  let height = clamp(crop.height + dy * (top ? -1 : 1), Math.min(.05, maxHeight), maxHeight);
  if (aspect) {
    const ratio = aspect / imageAspect;
    if (Math.abs(dx) >= Math.abs(dy)) height = width / ratio;
    else width = height * ratio;
    const factor = Math.min(1, maxWidth / width, maxHeight / height);
    width *= factor; height *= factor;
    const minimum = Math.max(.03 / width, .03 / height, 1);
    const growth = Math.min(minimum, maxWidth / width, maxHeight / height);
    width *= growth; height *= growth;
  }
  return { x: left ? anchorX - width : anchorX, y: top ? anchorY - height : anchorY, width, height };
}

export function outputGeometry(sourceWidth, sourceHeight, edit, maxDimension = 4096, maxPixels = 12_000_000) {
  const size = orientedSize(sourceWidth, sourceHeight, edit.rotation);
  const cropWidth = size.width * edit.crop.width;
  const cropHeight = size.height * edit.crop.height;
  const scale = Math.min(1, maxDimension / cropWidth, maxDimension / cropHeight, Math.sqrt(maxPixels / (cropWidth * cropHeight)));
  return { width: Math.max(1, Math.floor(cropWidth * scale)), height: Math.max(1, Math.floor(cropHeight * scale)), scale, oriented: size };
}

export function renderEdit(canvas, image, edit, { preview = false, mime = 'image/jpeg' } = {}) {
  const geometry = outputGeometry(image.naturalWidth, image.naturalHeight, edit, preview ? 1400 : 4096, preview ? 2_000_000 : 12_000_000);
  canvas.width = geometry.width;
  canvas.height = geometry.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo iniciar el editor de imágenes.');
  if (!('filter' in context)) throw new Error('Actualiza Android System WebView o tu navegador para usar filtros.');
  if (mime === 'image/jpeg') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); }
  context.save();
  context.filter = imageFilter(edit);
  context.translate(-edit.crop.x * geometry.oriented.width * geometry.scale, -edit.crop.y * geometry.oriented.height * geometry.scale);
  context.translate(geometry.oriented.width * geometry.scale / 2, geometry.oriented.height * geometry.scale / 2);
  context.rotate(edit.rotation * Math.PI / 180);
  context.scale(geometry.scale * (edit.flipX ? -1 : 1), geometry.scale * (edit.flipY ? -1 : 1));
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  context.restore();
  return geometry;
}

export function exportPhoto(image, edit, mime = 'image/jpeg') {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    try {
      const geometry = renderEdit(canvas, image, edit, { mime });
      canvas.toBlob(blob => {
        canvas.width = 1; canvas.height = 1;
        if (!blob) reject(new Error('No se pudo exportar la imagen.'));
        else resolve({ blob, width: geometry.width, height: geometry.height });
      }, mime, .93);
    } catch (error) { canvas.width = 1; canvas.height = 1; reject(error); }
  });
}

export function editedFilename(name, mime, now = new Date()) {
  const stem = name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').slice(0, 70) || 'foto';
  const stamp = now.toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '');
  return `${stem}-luma-${stamp}.${mime === 'image/png' ? 'png' : 'jpg'}`;
}
