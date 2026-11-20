export function formatBytes(bytes = 0) {
  if (!bytes) return '0 B';
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  return `${new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(bytes / 1024 ** unit)} ${['B', 'KB', 'MB', 'GB'][unit]}`;
}

export function mediaKind(file) {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return null;
}

export function fingerprint(file) {
  return JSON.stringify([file.name, file.size, file.lastModified]);
}

export function filterMedia(items, { section = 'all', query = '', type = 'all', sort = 'newest', album = '' } = {}) {
  const text = query.trim().toLocaleLowerCase('es');
  const filtered = items.filter(item => {
    if (section === 'trash' ? !item.deletedAt : item.deletedAt) return false;
    if (section === 'favorites' && !item.favorite) return false;
    if (section === 'albums' && album && item.album !== album) return false;
    if (section === 'photos' && item.kind !== 'image') return false;
    if (section === 'videos' && item.kind !== 'video') return false;
    if (type !== 'all' && item.kind !== type) return false;
    return `${item.name} ${item.album}`.toLocaleLowerCase('es').includes(text);
  });
  return filtered.sort((a, b) => {
    if (sort === 'oldest') return a.date - b.date;
    if (sort === 'name') return a.name.localeCompare(b.name, 'es', { numeric: true });
    if (sort === 'size') return b.size - a.size;
    return b.date - a.date;
  });
}

export function groupMedia(items, sort) {
  if (sort === 'name' || sort === 'size') return [['Tu colección', items]];
  const groups = new Map();
  for (const item of items) {
    const label = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(item.date);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(item);
  }
  return [...groups];
}
