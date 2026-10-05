export function renderContent(content) {
  const text = (tag, value, className) => {
    const element = document.createElement(tag);
    element.textContent = value || '';
    if (className) element.className = className;
    return element;
  };
  const notes = (Array.isArray(content.notes) ? content.notes : []).filter(note => note && typeof note.title === 'string' && note.title.trim());
  document.getElementById('notes-count').textContent = `${notes.length} 篇`;
  if (notes.length) {
    const list = document.getElementById('notes-list');
    list.replaceChildren();
    notes.forEach(note => {
      const item = document.createElement('a');
      item.className = 'note-item';
      item.href = '#editor?edit=' + encodeURIComponent(note.id);
      item.setAttribute('aria-label','编辑笔记：'+note.title);
      item.addEventListener('click',()=>sessionStorage.setItem('study-home-scroll',String(window.scrollY)));
      item.append(text('h3', note.title));
      if (note.summary) item.append(text('p', note.summary));
      const meta=text('span',[note.date,note.noteStatus==='draft'?'编辑中':'已完成',note.visibility==='public'&&note.noteStatus!=='draft'?'公开':'私密',note.updated_at?'更新于 '+new Date(note.updated_at).toLocaleString(): ''].filter(Boolean).join(' · '),'note-meta');item.append(meta);
      list.append(item);
    });
  }
}
