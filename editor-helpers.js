import {createPopover} from './popover.js';
// Only a standalone backslash starts completion. Consecutive slashes are line breaks.
export function commandToken(source, cursor=source.length) {
  const match=source.slice(0,cursor).match(/(\\+)([A-Za-z]*)$/);
  if(!match || match[1].length!==1) return null;
  return {from:cursor-match[2].length-1,query:match[2].toLowerCase()};
}
export function noteMetadata(value,statusValue='published') {
  try {const data=JSON.parse(value);if(data && typeof data==='object')return {date:typeof data.date==='string'?data.date:'',tags:Array.isArray(data.tags)?data.tags.filter(t=>typeof t==='string'):[],status:statusValue==='draft'?'draft':'published',desiredVisibility:data.desiredVisibility==='public'?'public':'private'};}catch{}
  return {date:/^\d{4}-\d{2}-\d{2}$/.test(value||'')?value:'',tags:value && !/^\d{4}-\d{2}-\d{2}$/.test(value)?[value]:[],status:statusValue==='draft'?'draft':'published',desiredVisibility:'private'};
}
export function encodeMetadata(date,tags,desiredVisibility='private') {return tags.length||desiredVisibility==='public'?JSON.stringify({date,tags,desiredVisibility}):date;}

export function setupTagPicker(root,available) {
  const known=new Set(['数学','英语',...available]),selected=new Set();
  root.innerHTML='<label for="tag-search">标签</label><div class="tag-chips" id="selected-tags" aria-label="已选标签"></div><div class="tag-search-row"><input id="tag-search" type="search" maxlength="40" autocomplete="off" placeholder="搜索或创建标签" aria-controls="tag-options"><button type="button" class="secondary-link" id="tag-toggle" aria-expanded="false" aria-controls="tag-options">选择标签</button></div><div id="tag-options" class="tag-options" hidden></div><p class="field-hint" id="tag-message" role="status">可多选；输入新标签后按 Enter 创建。</p>';
  const search=root.querySelector('input'),chips=root.querySelector('.tag-chips'),options=root.querySelector('.tag-options'),toggle=root.querySelector('#tag-toggle'),message=root.querySelector('#tag-message');
  const popover=createPopover({panel:options,triggers:()=>[root],onOpen:()=>{options.hidden=false;toggle.setAttribute('aria-expanded','true');},onClose:()=>{options.hidden=true;toggle.setAttribute('aria-expanded','false');}});
  const setOpen=value=>value?popover.open():popover.close();
  const choose=tag=>{
    if(selected.size>=12){message.textContent='每篇笔记最多选择 12 个标签。';return;}
    selected.add(tag);known.add(tag);search.value='';message.textContent='已添加标签。';render();root.dispatchEvent(new Event('change',{bubbles:true}));search.focus();
  };
  function render() {
    chips.replaceChildren();options.replaceChildren();
    for(const tag of selected){const button=document.createElement('button');button.type='button';button.className='tag-chip';button.textContent=tag+' ×';button.setAttribute('aria-label','移除标签 '+tag);button.addEventListener('click',()=>{selected.delete(tag);render();root.dispatchEvent(new Event('change',{bubbles:true}));});chips.append(button);}
    const query=search.value.trim(),matches=[...known].filter(tag=>!selected.has(tag)&&tag.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a,b)=>a.localeCompare(b,'zh-CN'));
    for(const tag of matches){const button=document.createElement('button');button.type='button';button.textContent=tag;button.addEventListener('click',()=>choose(tag));options.append(button);}
    if(query&&!known.has(query)){const button=document.createElement('button');button.type='button';button.textContent='创建标签“'+query+'”';button.addEventListener('click',()=>choose(query));options.append(button);}
    if(!options.children.length){const text=document.createElement('p');text.textContent=query?'该标签已选择。':'输入名称即可创建新标签。';options.append(text);}
  }
  search.addEventListener('focus',()=>{render();setOpen(true);});
  search.addEventListener('input',()=>{render();setOpen(true);});
  search.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();const query=search.value.trim();if(query)choose([...known].find(t=>t.toLocaleLowerCase()===query.toLocaleLowerCase())||query);}else if(event.key==='Escape'){setOpen(false);}});
  toggle.addEventListener('click',()=>{render();setOpen(options.hidden);});
  root.closest('form').addEventListener('reset',()=>{selected.clear();search.value='';render();setOpen(false);root.dispatchEvent(new Event('change',{bubbles:true}));});
  render();
  return {get:()=>[...selected],set:tags=>{selected.clear();tags.forEach(tag=>{selected.add(tag);known.add(tag);});render();root.dispatchEvent(new Event('change',{bubbles:true}));}};
}
