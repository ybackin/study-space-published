export function renderContent(content) {
  const safeUrl = value => {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  };
  const text = (tag, value, className) => {
    const element = document.createElement(tag);
    element.textContent = value || '';
    if (className) element.className = className;
    return element;
  };
  const notes = (Array.isArray(content.notes) ? content.notes : []).filter(note => note && typeof note.title === 'string' && note.title.trim());
  const links = (Array.isArray(content.links) ? content.links : []).filter(link => link && typeof link.title === 'string' && link.title.trim() && safeUrl(link.url));
  document.getElementById('notes-count').textContent = `${notes.length} 篇`;
  document.getElementById('links-count').textContent = `${links.length} 个`;
  if (notes.length) {
    const list = document.getElementById('notes-list');
    list.replaceChildren();
    notes.forEach(note => {
      const url = safeUrl(note.url);
      const item = document.createElement(url ? 'a' : 'article');
      item.className = 'note-item';
      if (url) item.href = url;
      item.append(text('h3', note.title));
      if (note.summary) item.append(text('p', note.summary));
      if (note.date) item.append(text('span', note.date, 'note-meta'));
      list.append(item);
    });
  }
  if (links.length) {
    const list = document.getElementById('links-list');
    list.replaceChildren();
    links.forEach(link => {
      const item = document.createElement('a');
      item.className = 'resource';
      item.href = safeUrl(link.url);
      item.append(text('strong', link.title));
      if (link.description) item.append(text('p', link.description));
      list.append(item);
    });
  }
}