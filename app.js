import { StudyAPI } from './api.js';
import { renderContent } from './content-renderer.js';
import { noteMetadata, encodeMetadata, setupTagPicker } from './editor-helpers.js';
import { readDocument, writeDocument } from './note-document.js';
import {createMathPreview} from './latex-next-preview.js';
import {mountLatexWorkbench} from './latex-next-workbench.js';

const view=document.getElementById('site-view');
let api, currentProfile, revision=0, activeDraftBackup=null;
const element=(tag,text,className)=>{const node=document.createElement(tag);node.textContent=text || '';if(className)node.className=className;return node;};
const readPreviews=new WeakMap();
const renderFormulaPreview=(target,value)=>{
  let preview=readPreviews.get(target);
  if(!preview){preview=createMathPreview(target);readPreviews.set(target,preview);}
  preview.render(typeof value==='string'?readDocument(value):value);
};
function authView(mode) {
  const setup=mode==='setup',signup=mode==='signup';
  document.body.className='auth-body';
  view.className='auth-layout';
  view.innerHTML=`<a class="auth-brand" href="#login">自习室<span>.</span></a><section class="auth-card"><p class="eyebrow">MY STUDY SPACE</p><h1>${setup?'创建管理员账号':signup?'创建你的账号':'欢迎回到自习室'}</h1><p class="auth-intro">${setup?'使用管理员创建码设置管理员账号。':signup?'注册后即可拥有独立的私人空间和笔记。':'登录后查看和编辑学习笔记。'}</p><form id="login-form">${setup?'<label for="setup-key">账号创建码</label><input id="setup-key" name="setupKey" type="password" required autocomplete="off" maxlength="100">':''}<label for="username">用户名</label><input id="username" name="username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9_.-]{3,32}" autocomplete="username"><label for="password">密码</label><input id="password" name="password" type="password" required minlength="8" maxlength="128" autocomplete="${setup||signup?'new-password':'current-password'}">${setup||signup?'<p class="field-hint">至少 8 个字符，不要求字母、数字或大小写组合。</p><label for="confirm-password">再次输入密码</label><input id="confirm-password" name="confirmPassword" type="password" required minlength="8" maxlength="128" autocomplete="new-password">':''}<p id="form-message" class="auth-message" role="status" aria-live="polite"></p><button type="submit" class="auth-submit">${setup||signup?'创建账号并进入':'登录'}</button></form><a class="auth-help" href="${setup||signup?'#login':'#signup'}">${setup||signup?'已有账号？返回登录':'首次使用？创建新账号'}</a>${!signup&&!setup?'<a class="auth-help" href="#setup">管理员创建入口</a>':''}</section><p class="auth-footer">自习室 / 我的学习空间</p>`;
  document.getElementById('login-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const form=event.currentTarget,fields=new FormData(form),button=form.querySelector('button'),message=document.getElementById('form-message');
    if(setup && fields.get('password')!==fields.get('confirmPassword')) {message.textContent='两次输入的密码不一致。';return;}
    button.disabled=true;message.textContent='';
    try {
      if(setup) await api.create(fields.get('username'),fields.get('password'),fields.get('setupKey'));
      else if(signup) await api.create(fields.get('username'),fields.get('password'));
      currentProfile=await api.login(fields.get('username'),fields.get('password'));
      form.reset();location.hash='home';
    } catch(error) {message.textContent=error.message;}
    finally {button.disabled=false;}
  });
}
function header(profile) {
  const top=document.createElement('header');top.className='topbar';
  const brand=element('a','自习室','brand');brand.href='#home';top.append(brand);
  const nav=document.createElement('nav');nav.setAttribute('aria-label','主导航');
  const home=element('a','学习主页');home.href='#home';nav.append(home);
  const privateSpace=element('a','私人空间');privateSpace.href='#private';nav.append(privateSpace);
  const plaza=element('a','广场');plaza.href='#plaza';nav.append(plaza);
  {
    const content=element('a','内容管理');content.href='#content';nav.append(content);
  }
  if(profile.role==='owner') {
    const accounts=element('a','账号管理');accounts.href='#accounts';nav.append(accounts);
  }
  top.append(nav);
  const menu=element('div','','account-menu');menu.append(element('span',profile.username));
  const logout=element('button','退出登录');logout.id='logout-button';logout.type='button';
  logout.addEventListener('click',async()=>{logout.disabled=true;try{await api.logout();}catch{}currentProfile=null;location.hash='login';await show();});
  menu.append(logout);top.append(menu);return top;
}
async function homeView(profile,run) {
  const notes=await api.myNotes(),content={notes};
  if(run!==revision) return;
  document.body.className='';view.className='';
  view.replaceChildren(document.getElementById('home-template').content.cloneNode(true));
  view.querySelector('.topbar').replaceWith(header(profile));
  renderContent({...content,notes:content.notes.map(note=>{const meta=noteMetadata(note.date,note.status);return {...note,meta,date:[meta.date,...meta.tags].filter(Boolean).join(' · '),noteStatus:meta.status};})});
  const welcome=element('section','','welcome-panel');
  const copy=element('div','','welcome-copy');copy.append(element('p','WELCOME BACK','eyebrow'),element('h2',`你好，${profile.username}`),element('p',notes.length?'继续整理最近编辑的笔记。':'你的学习空间已经准备好了，先写第一篇笔记。','welcome-text'));
  const stats=element('div','','welcome-stats');
  for(const [number,label] of [[notes.length,'全部笔记'],[notes.filter(note=>note.status==='draft').length,'编辑中'],[notes.filter(note=>note.status==='published').length,'已完成']]) {const card=element('div','','stat-card');card.append(element('strong',String(number)),element('span',label));stats.append(card);}
  welcome.append(copy,stats);
  const actions=element('div','','home-actions');const create=element('a','+ 新建笔记','primary-link');create.href='#editor';const manage=element('a','管理笔记','secondary-link');manage.href='#content';actions.append(create,manage);welcome.append(actions);
  view.querySelector('.page-heading').after(welcome);
  const tagCounts=new Map();for(const note of notes)for(const tag of noteMetadata(note.date).tags)tagCounts.set(tag,(tagCounts.get(tag)||0)+1);
  if(tagCounts.size){const tags=element('div','','home-tag-strip');tags.append(element('span','常用标签'));for(const [tag,count] of [...tagCounts].sort((a,b)=>b[1]-a[1]).slice(0,8)){const link=element('a',`${tag} · ${count}`,'tag-chip');link.href='#content?tag='+encodeURIComponent(tag);tags.append(link);}welcome.after(tags);}
  try {const prefix=`study-draft:${profile.id}:`;let backup=null;for(let index=0;index<localStorage.length;index++){const key=localStorage.key(index);if(key?.startsWith(prefix)){const candidate=JSON.parse(localStorage.getItem(key)||'null');if(candidate?.values?.summary||candidate?.values?.title){backup=candidate;break;}}}if(backup){const banner=element('a','检测到尚未同步的本地内容，点击恢复。','draft-recovery');banner.href=backup.noteId?'#editor?edit='+encodeURIComponent(backup.noteId):'#editor?restore=1';welcome.after(banner);}}catch{}
  const savedScroll=sessionStorage.getItem('study-home-scroll');
  if(savedScroll!==null){sessionStorage.removeItem('study-home-scroll');requestAnimationFrame(()=>window.scrollTo(0,Number(savedScroll)||0));}
}
function contentList(items,{emptyText='暂无笔记。'}={}) {
  const list=element('ul','','manage-list');
  if(!items.length) {list.append(element('li',emptyText,'manage-empty'));return list;}
  for(const item of items) {
    const meta=noteMetadata(item.date,item.status),row=element('li','','manage-row'),open=element('a','','note-management-link');
    open.href='#editor?edit='+encodeURIComponent(item.id);
    open.addEventListener('click',()=>sessionStorage.setItem('study-content-scroll',String(window.scrollY)));
    open.append(element('strong',item.title),element('p',(item.summary||readDocument(item.body).source||'').slice(0,180)||'暂无正文'));
    const info=element('div','','note-list-meta');
    for(const tag of meta.tags) info.append(element('span',tag,'tag-chip tag-chip-static'));
    info.append(element('span',meta.status==='draft'?'编辑中':'已完成',meta.status==='draft'?'status-badge draft-badge':'status-badge'));
    info.append(element('span',item.visibility==='public'&&meta.status==='published'?'公开':'私密','status-badge'));
    info.append(element('span','更新于 '+new Date(item.updated_at||item.created_at).toLocaleString(),'note-meta'));
    open.append(info);
    const remove=element('button','删除','danger-button');remove.type='button';remove.addEventListener('click',async()=>{if(!confirm(`确定删除“${item.title}”吗？`))return;remove.disabled=true;try{await api.deleteNote(item.id);await show();}catch(error){remove.disabled=false;alert(error.message);}});
    row.append(open,remove);list.append(row);
  }
  return list;
}
async function contentManagerView(profile,run,initialTag='') {
  const notes=await api.myNotes();if(run!==revision)return;
  document.body.className='';view.className='';view.replaceChildren(header(profile));
  const main=element('main','','content-main');
  main.innerHTML='<div class="page-heading"><div><p class="eyebrow">NOTE LIBRARY</p><h1>内容管理<span class="title-dot">.</span></h1><p class="page-intro">查看、筛选并继续编辑自己的笔记。</p></div></div><section class="panel"><div class="section-heading"><h2>我的笔记</h2><span class="count" id="note-count"></span></div><div class="note-filters"><label>标签<select id="filter-tag"><option value="">全部标签</option></select></label><label>状态<select id="filter-status"><option value="">全部状态</option><option value="draft">编辑中</option><option value="published">已完成</option></select></label><label>可见性<select id="filter-visibility"><option value="">全部</option><option value="private">私密</option><option value="public">公开</option></select></label></div><div id="manage-notes"></div></section>';
  view.append(main);
  const filterTag=main.querySelector('#filter-tag'),filterStatus=main.querySelector('#filter-status'),filterVisibility=main.querySelector('#filter-visibility'),listRoot=main.querySelector('#manage-notes'),tags=[...new Set(['数学','英语',...notes.flatMap(note=>noteMetadata(note.date).tags)])].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  for(const tag of tags){const option=element('option',tag);option.value=tag;filterTag.append(option);}
  filterTag.value=initialTag;
  const render=()=>{const filtered=notes.filter(note=>{const meta=noteMetadata(note.date,note.status);return (!filterTag.value||meta.tags.includes(filterTag.value))&&(!filterStatus.value||meta.status===filterStatus.value)&&(!filterVisibility.value||note.visibility===filterVisibility.value);});document.getElementById('note-count').textContent=filtered.length+' 篇';listRoot.replaceChildren(contentList(filtered,{emptyText:notes.length?'没有符合筛选条件的笔记。':'还没有笔记，去学习主页新建一篇。'}));};
  [filterTag,filterStatus,filterVisibility].forEach(select=>select.addEventListener('change',render));render();
  const savedScroll=sessionStorage.getItem('study-content-scroll');if(savedScroll!==null){sessionStorage.removeItem('study-content-scroll');requestAnimationFrame(()=>window.scrollTo(0,Number(savedScroll)||0));}
}
async function privateSpaceView(profile,run) {
  const notes=await api.myNotes();if(run!==revision)return;
  document.body.className='';view.className='';view.replaceChildren(header(profile));
  const main=element('main','','content-main');
  main.innerHTML='<div class="page-heading"><div><p class="eyebrow">PERSONAL SPACE</p><h1>私人空间<span class="title-dot">.</span></h1><p class="page-intro">你的学习内容总览。新建与编辑在独立的笔记编辑页完成。</p></div><a class="secondary-link" href="#content">管理全部笔记</a></div>';
  const overview=element('section','','private-overview');
  for(const [number,label] of [[notes.length,'全部笔记'],[notes.filter(note=>note.status==='draft').length,'编辑中'],[notes.filter(note=>note.status==='published').length,'已完成'],[notes.filter(note=>note.visibility==='private').length,'私密']]){const card=element('div','','private-stat panel');card.append(element('strong',String(number)),element('span',label));overview.append(card);}
  main.append(overview);
  const tagCounts=new Map();for(const note of notes)for(const tag of noteMetadata(note.date).tags)tagCounts.set(tag,(tagCounts.get(tag)||0)+1);
  const tags=element('section','','panel private-tags');tags.append(element('h2','常用标签'));const tagLinks=element('div','','private-tag-links');for(const [tag,count] of tagCounts){const link=element('a',`${tag} · ${count}`,'tag-chip');link.href='#content?tag='+encodeURIComponent(tag);tagLinks.append(link);}if(!tagLinks.children.length)tagLinks.append(element('p','还没有使用标签。','manage-empty'));tags.append(tagLinks);main.append(tags);
  const recent=element('section','','panel');recent.append(element('div','最近编辑','section-heading'));recent.append(contentList(notes.slice(0,6),{emptyText:'还没有笔记，去学习主页新建一篇。'}));main.append(recent);view.append(main);
}
async function editorView(profile,run,editId='',restore=false) {
  const notes=await api.myNotes();if(run!==revision)return;
  document.body.className='editor-page';view.className='';view.replaceChildren(header(profile));
  const main=element('main','','content-main editor-main');
  main.innerHTML='<div class="page-heading"><div><p class="eyebrow">NOTE EDITOR</p><h1 id="editor-title">新建笔记<span class="title-dot">.</span></h1><p class="page-intro">内容会自动保存为私密草稿；完成后可选择是否公开。</p></div><a class="secondary-link" href="#content">返回内容管理</a></div><section class="panel editor-panel"><form id="note-form" class="content-form note-editor-form"><label for="note-title">标题</label><input id="note-title" name="title" maxlength="100" placeholder="例如：线性代数第一章"><div id="note-workbench-root"></div><div class="tag-picker" id="tag-picker"></div><div class="form-split"><div><label for="note-date">日期</label><input id="note-date" name="date" type="date"></div><div><label for="note-visibility">完成后可见性</label><select id="note-visibility" name="visibility"><option value="private">私密</option><option value="public">公开到广场</option></select></div></div><p class="form-status" role="status">输入标题或正文后将自动保存为草稿。</p><div class="editor-actions"><button class="secondary-link" type="submit">立即保存草稿</button><button class="auth-submit" id="complete-note" type="button">完成并保存</button></div></form></section>';
  const workbenchRoot=main.querySelector('#note-workbench-root');
  view.append(main);
  const form=main.querySelector('#note-form'),titleInput=form.elements.title,dateInput=form.elements.date,visibilityInput=form.elements.visibility,status=form.querySelector('.form-status'),tagRoot=main.querySelector('#tag-picker'),tagPicker=setupTagPicker(tagRoot,notes.flatMap(note=>noteMetadata(note.date).tags));
  let doc={source:'',marks:[],mathColors:[]},historyStack=[{source:'',marks:[],mathColors:[]}],historyIndex=0;
  const snapshot=()=>({source:doc.source,marks:doc.marks.map(mark=>({...mark})),mathColors:doc.mathColors.map(mark=>({...mark}))});
  const record=()=>{historyStack.splice(historyIndex+1);historyStack.push(snapshot());if(historyStack.length>200)historyStack.shift();historyIndex=historyStack.length-1;};
  const workbench=mountLatexWorkbench(workbenchRoot,{document:doc,onChange:next=>{doc=next;record();workbenchRoot.dispatchEvent(new Event('input',{bubbles:true}));}});
  const summary=workbenchRoot,preview=workbench.previewHost;
  Object.defineProperties(summary,{
    value:{get:()=>workbench.editor.getValue()},
    scrollTop:{get:()=>workbench.editor.view.scrollDOM.scrollTop,set:value=>{workbench.editor.view.scrollDOM.scrollTop=value;}},
    scrollHeight:{get:()=>workbench.editor.view.scrollDOM.scrollHeight},
    clientHeight:{get:()=>workbench.editor.view.scrollDOM.clientHeight},
  });
  summary.focus=()=>workbench.editor.focus();
  summary.setSelectionRange=(from,to=from)=>workbench.editor.view.dispatch({selection:{anchor:from,head:to},scrollIntoView:true});
  const settings=element('details','','note-settings'),settingsBody=element('div','','settings-body'),footer=element('div','','editor-footer');
  settings.append(element('summary','笔记设置'));settingsBody.append(tagRoot,form.querySelector('.form-split'));settings.append(settingsBody);
  footer.append(settings,status,form.querySelector('.editor-actions'));form.append(footer);
  summary.addEventListener('keydown',event=>{
    if(!(event.ctrlKey||event.metaKey)||!['z','y'].includes(event.key.toLowerCase()))return;
    event.preventDefault();event.stopPropagation();
    historyIndex=Math.max(0,Math.min(historyStack.length-1,historyIndex+(event.key.toLowerCase()==='y'||event.shiftKey?1:-1)));
    doc={source:historyStack[historyIndex].source,marks:historyStack[historyIndex].marks.map(mark=>({...mark})),mathColors:historyStack[historyIndex].mathColors.map(mark=>({...mark}))};
    workbench.setDocument(doc);summary.dispatchEvent(new Event('change',{bubbles:true}));
  },true);
  let noteId=editId||null,editVersion=0,savedVersion=0,timer=null,saveChain=Promise.resolve(),noteStatus='draft';
  const localKey=id=>`study-draft:${profile.id}:${id||'new'}`;
  const collect=(state='draft')=>{const desired=visibilityInput.value==='public'?'public':'private';return {title:titleInput.value.trim()||'未命名草稿',body:writeDocument(doc),summary:doc.source,date:encodeMetadata(dateInput.value,tagPicker.get(),desired),status:state,visibility:state==='draft'?'private':desired};};
  const currentValues=()=>({title:titleInput.value,summary:summary.value,marks:doc.marks,mathColors:doc.mathColors,date:dateInput.value,tags:tagPicker.get(),visibility:visibilityInput.value});
  const cacheLocal=()=>{const values=currentValues();if(!values.title.trim()&&!values.summary.trim())return;const backup={noteId,updatedAt:new Date().toISOString(),values};try{localStorage.setItem(localKey(noteId),JSON.stringify(backup));if(noteId)localStorage.removeItem(localKey(null));}catch{}};
  const clearLocal=()=>{try{localStorage.removeItem(localKey(noteId));localStorage.removeItem(localKey(null));}catch{}};
  const applyValues=values=>{titleInput.value=values.title||'';doc={source:values.summary||'',marks:Array.isArray(values.marks)?values.marks:[],mathColors:Array.isArray(values.mathColors)?values.mathColors:[]};workbench.setDocument(doc);historyStack=[snapshot()];historyIndex=0;dateInput.value=values.date||'';tagPicker.set(Array.isArray(values.tags)?values.tags:[]);visibilityInput.value=values.visibility==='public'?'public':'private';};
  const findBackup=id=>{try{return JSON.parse(localStorage.getItem(localKey(id))||'null');}catch{return null;}};
  if(editId){const rows=await api.note(editId);if(run!==revision)return;const note=rows[0];if(!note||note.author_id!==profile.id)throw new Error('笔记不存在或当前账号无权编辑。');const meta=noteMetadata(note.date,note.status);noteStatus=meta.status;titleInput.value=note.title;doc=readDocument(note.body||note.summary||'');workbench.setDocument(doc);historyStack=[snapshot()];dateInput.value=meta.date;tagPicker.set(meta.tags);visibilityInput.value=meta.desiredVisibility==='public'||note.visibility==='public'?'public':'private';main.querySelector('#editor-title').firstChild.textContent=meta.status==='draft'?'继续编辑草稿':'编辑笔记';const backup=findBackup(editId);if(backup?.updatedAt&&new Date(backup.updatedAt)>new Date(note.updated_at||note.created_at)){if(confirm('发现比云端更新的本地内容，是否恢复？'))applyValues(backup.values);else localStorage.removeItem(localKey(editId));}status.textContent=meta.status==='draft'?'这是尚未完成的草稿，编辑后会自动保存。':'修改后会自动保存为私密草稿；完成后可重新发布。';}
  const syncPreviewScroll=()=>{const editable=Math.max(1,summary.scrollHeight-summary.clientHeight),rendered=Math.max(0,preview.scrollHeight-preview.clientHeight);preview.scrollTop=(summary.scrollTop/editable)*rendered;};
  workbench.editor.view.scrollDOM.addEventListener('scroll',syncPreviewScroll);
  summary.addEventListener('input',()=>requestAnimationFrame(syncPreviewScroll));
  const persistDraft=()=>{const version=editVersion,values=collect('draft');if(!titleInput.value.trim()&&!summary.value.trim())return Promise.resolve();status.textContent='正在保存草稿…';saveChain=saveChain.then(async()=>{const rows=noteId?await api.updateNote(noteId,values):await api.addNote(values);if(!rows?.length)throw new Error('草稿没有写入数据库，请检查网络后重试。');if(!noteId){noteId=rows[0].id;history.replaceState(null,'',`#editor?edit=${encodeURIComponent(noteId)}`);localStorage.removeItem(localKey(null));}noteStatus='draft';savedVersion=version;if(editVersion>savedVersion){cacheLocal();status.textContent='有新修改，继续同步…';scheduleSave();}else{clearLocal();status.textContent='草稿已保存。';}}).catch(error=>{cacheLocal();status.textContent='保存失败，内容已暂存在本机：'+error.message;});return saveChain;};
  const scheduleSave=()=>{editVersion++;cacheLocal();clearTimeout(timer);timer=setTimeout(persistDraft,1200);};
  for(const control of [titleInput,summary,dateInput,visibilityInput]){control.addEventListener('input',scheduleSave);control.addEventListener('change',scheduleSave);}
  tagRoot.addEventListener('change',scheduleSave);
  form.addEventListener('submit',async event=>{event.preventDefault();clearTimeout(timer);if(!titleInput.value.trim()&&!summary.value.trim()){status.textContent='请先输入标题或正文。';return;}cacheLocal();await persistDraft();});
  main.querySelector('#complete-note').addEventListener('click',async()=>{clearTimeout(timer);if(!titleInput.value.trim()&&!summary.value.trim()){status.textContent='请先输入标题或正文。';titleInput.focus();return;}if(editVersion>savedVersion)await persistDraft();const values=collect('published');status.textContent='正在保存完成状态…';const button=main.querySelector('#complete-note');button.disabled=true;try{const rows=noteId?await api.updateNote(noteId,values):await api.addNote(values);if(!rows?.length)throw new Error('笔记没有保存成功。');clearLocal();status.textContent='已完成并保存。';location.hash='content';}catch(error){cacheLocal();status.textContent='保存失败，内容已暂存在本机：'+error.message;button.disabled=false;}});
  activeDraftBackup=cacheLocal;window.addEventListener('pagehide',activeDraftBackup);
  if(!editId){const backup=findBackup(null);if(backup?.values){if(restore||confirm('发现未同步的本地草稿，是否恢复？')){applyValues(backup.values);scheduleSave();}else localStorage.removeItem(localKey(null));}}
}
async function plazaView(profile,run) {
  const [notes,profiles]=await Promise.all([api.publicNotes(),api.profileNames()]); if(run!==revision)return;
  const names=new Map(profiles.map(item=>[item.id,item.username]));
  document.body.className='';view.className='';view.replaceChildren(header(profile));
  const main=element('main','','content-main');
  main.innerHTML='<div class="page-heading"><div><p class="eyebrow">PUBLIC PLAZA</p><h1>广场<span class="title-dot">.</span></h1><p class="page-intro">这里展示用户主动公开的学习笔记。</p></div><a class="primary-link" href="#editor">写一篇笔记</a></div><section class="plaza-list" id="plaza-list"></section>';
  const list=main.querySelector('#plaza-list');
  if(!notes.length) list.append(element('p','还没有公开笔记。','manage-empty'));
  notes.forEach(note=>{const card=element('a','','plaza-card');card.href='#note/'+note.id;const meta=noteMetadata(note.date,note.status);card.append(element('h2',note.title),element('p',(note.summary||readDocument(note.body).source||'').slice(0,180)),element('span',`${names.get(note.author_id)||'学习者'} · ${new Date(note.updated_at||note.created_at).toLocaleString()} · 公开`,'note-meta'));const tags=element('div','','plaza-tags');for(const tag of meta.tags)tags.append(element('span',tag,'tag-chip tag-chip-static'));card.append(tags);list.append(card);});
  view.append(main);
}
async function noteView(profile,run,id) {
  const rows=await api.note(id); if(run!==revision)return;
  if(!rows.length) throw new Error('笔记不存在或当前账号无权查看。');
  const note=rows[0],own=note.author_id===profile.id;
  document.body.className='';view.className='';view.replaceChildren(header(profile));
  const main=element('main','','content-main'),article=element('article','','panel note-reader');
  article.append(element('p',note.visibility==='public'?'公开笔记':'私密笔记','eyebrow'),element('h1',note.title),element('p',`创建于 ${new Date(note.created_at).toLocaleString()} · 更新于 ${new Date(note.updated_at).toLocaleString()}`,'note-meta'));
  const body=element('div','','note-reader-body');renderFormulaPreview(body,note.body||note.summary||'');article.append(body);
  if(own){const edit=element('a','编辑这篇笔记','primary-link');edit.href='#editor?edit='+note.id;article.append(edit);}
  main.append(article);view.append(main);
}
async function accountsView(profile,run) {
  if(profile.role!=='owner') throw new Error('只有主账号可以管理其他账号。');
  const accounts=await api.accounts();
  if(run!==revision) return;
  document.body.className='';view.className='';view.replaceChildren(header(profile));
  const main=element('main','','accounts-main');
  main.innerHTML='<div class="page-heading"><h1>账号管理<span class="title-dot">.</span></h1></div><div class="accounts-grid"><section class="panel account-create"><h2>创建新账号</h2><p class="auth-intro">新账号可使用同一个网址登录学习主页。</p><form id="account-form"><label for="username">用户名</label><input id="username" name="username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9_.-]{3,32}" autocomplete="off"><label for="password">密码</label><input id="password" name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password"><p class="field-hint">至少 8 个字符，不要求字母、数字或大小写组合。</p><label for="confirm-password">再次输入密码</label><input id="confirm-password" name="confirmPassword" type="password" required minlength="8" maxlength="128" autocomplete="new-password"><p id="form-message" class="auth-message" role="status" aria-live="polite"></p><button class="auth-submit" type="submit">创建账号</button></form></section><section class="panel"><div class="section-heading"><h2>已有账号</h2></div><ul id="account-list" class="account-list"></ul><p class="account-explainer">只有主账号可以创建其他账号。</p></section></div>';
  view.append(main);
  const list=document.getElementById('account-list');
  for(const account of accounts) {const row=element('li','');row.append(element('strong',account.username),element('span',account.role==='owner'?'主账号':'普通账号'));list.append(row);}
  document.getElementById('account-form').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,fields=new FormData(form),button=form.querySelector('button'),message=document.getElementById('form-message');
    if(fields.get('password')!==fields.get('confirmPassword')) {message.textContent='两次输入的密码不一致。';return;}
    button.disabled=true;message.textContent='';
    try {await api.createMember(fields.get('username'),fields.get('password'));form.reset();await show();} catch(error) {message.textContent=error.message;button.disabled=false;}
  });
}
async function show() {
  if(activeDraftBackup){window.removeEventListener('pagehide',activeDraftBackup);activeDraftBackup=null;}
  const run=++revision,hash=location.hash.slice(1) || 'home',parts=hash.split('?'),path=parts[0],query=new URLSearchParams(parts[1]||'');
  if(!api.session) {if(!['setup','signup','login'].includes(path)) {location.hash='login';return;}authView(path==='setup'?'setup':path==='signup'?'signup':'login');return;}
  try {
    currentProfile=await api.profile();
    if(run!==revision)return;
    if(path==='accounts') await accountsView(currentProfile,run);else if(path==='content') await contentManagerView(currentProfile,run,query.get('tag')||'');else if(path==='editor') await editorView(currentProfile,run,query.get('edit')||'',query.get('restore')==='1');else if(path==='private'&&(query.has('edit')||query.has('restore'))) {location.hash='editor?'+query.toString();return;}else if(path==='private') await privateSpaceView(currentProfile,run);else if(path==='plaza') await plazaView(currentProfile,run);else if(path.startsWith('note/')) await noteView(currentProfile,run,path.slice(5));else await homeView(currentProfile,run);
  } catch(error) {
    if(run!==revision)return;
    api.save(null);authView('login');document.getElementById('form-message').textContent=error.message;
  }
}
try {
  const response=await fetch('./config.json',{cache:'no-store'});
  if(!response.ok) throw new Error();
  const config=await response.json();
  if(!config.supabaseUrl || !config.supabasePublishableKey) throw new Error();
  api=new StudyAPI(config);window.addEventListener('hashchange',show);await show();
} catch {document.getElementById('initial-message').textContent='网站正在准备，请稍后访问。';}

