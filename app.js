import { StudyAPI } from './api.js';
import { renderContent } from './content-renderer.js';

const view=document.getElementById('site-view');
let api, currentProfile, revision=0;
const element=(tag,text,className)=>{const node=document.createElement(tag);node.textContent=text || '';if(className)node.className=className;return node;};
function renderFormulaPreview(target,source) {
  target.replaceChildren();
  if(!source.trim()) { target.append(element('span','直接输入公式内容，例如 \\frac{a}{b}、\\sqrt{x} 或 \\sum_{n=1}^{\\infty} n。','preview-placeholder')); return; }
  const holder=element('div','','formula-block');
  try { holder.innerHTML=window.katex.renderToString(source.trim(),{displayMode:true,throwOnError:true,trust:false,strict:'ignore'}); }
  catch(error) { holder.append(element('code',error.message || '公式暂时无法解析。','formula-error')); }
  target.append(holder);
}
const formulaSuggestions=[
  ['\\alpha','希腊字母 α'],['\\beta','希腊字母 β'],['\\gamma','希腊字母 γ'],['\\theta','希腊字母 θ'],
  ['\\frac{}{}','分式'],['\\sqrt{}','根号'],['^{}','上标'],['_{}','下标'],['\\int_{a}^{b}','积分'],
  ['\\iint','二重积分'],['\\iiint','三重积分'],['\\sum_{i=1}^{n}','求和'],['\\lim_{x\\to 0}','极限'],
  ['\\partial','偏导符号'],['\\begin{pmatrix}  &  \\\\  &  \\end{pmatrix}','矩阵'],['\\begin{vmatrix}  &  \\\\  &  \\end{vmatrix}','行列式'],
  ['\\leq','小于等于'],['\\neq','不等于'],['\\to','箭头'],['\\infty','无穷']
];
function setupFormulaInput(input,preview,menu,status) {
  const update=()=>{
    renderFormulaPreview(preview,input.value);
    const before=input.value.slice(0,input.selectionStart),match=before.match(/\\([A-Za-z]*)$/);
    menu.replaceChildren();
    if(!match){menu.hidden=true;return;}
    const query=match[1].toLowerCase(),items=formulaSuggestions.filter(([command])=>command.toLowerCase().includes(query)).slice(0,8);
    if(!items.length){menu.hidden=true;return;}
    items.forEach(([command,label],index)=>{const option=element('button',`${command}  ${label}`,'formula-suggestion');option.type='button';option.dataset.command=command;if(index===0)option.classList.add('is-active');option.addEventListener('mousedown',event=>{event.preventDefault();insert(command);});menu.append(option);});menu.hidden=false;
  };
  const insert=command=>{const start=input.selectionStart,end=input.selectionEnd,before=input.value.slice(0,start),match=before.match(/\\([A-Za-z]*)$/),from=match?start-match[0].length:start;input.setRangeText(command,from,end,'end');update();input.focus();};
  input.addEventListener('input',update);input.addEventListener('click',update);input.addEventListener('keyup',update);
  input.addEventListener('keydown',event=>{if(menu.hidden)return;const options=[...menu.querySelectorAll('button')],active=options.findIndex(option=>option.classList.contains('is-active'));if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const next=(active+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;options.forEach(option=>option.classList.remove('is-active'));options[next].classList.add('is-active');}else if(event.key==='Enter'||event.key==='Tab'){const option=options[active<0?0:active];if(option){event.preventDefault();insert(option.dataset.command);}}else if(event.key==='Escape'){menu.hidden=true;}});
  document.addEventListener('click',event=>{if(!menu.contains(event.target)&&event.target!==input)menu.hidden=true;});
  update();
  return insert;
}
function authView(setup) {
  document.body.className='auth-body';
  view.className='auth-layout';
  view.innerHTML=`<a class="auth-brand" href="#login">自习室<span>.</span></a><section class="auth-card"><p class="eyebrow">MY STUDY SPACE</p><h1>${setup?'创建你的主账号':'欢迎回到自习室'}</h1><p class="auth-intro">${setup?'设置一个专属于你的用户名和密码。':'登录后查看学习笔记和常用链接。'}</p><form id="login-form">${setup?'<label for="setup-key">账号创建码</label><input id="setup-key" name="setupKey" type="password" required autocomplete="off" maxlength="100">':''}<label for="username">用户名</label><input id="username" name="username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9_.-]{3,32}" autocomplete="username"><label for="password">密码</label><input id="password" name="password" type="password" required minlength="8" maxlength="128" autocomplete="${setup?'new-password':'current-password'}">${setup?'<p class="field-hint">至少 8 个字符，不要求字母、数字或大小写组合。</p><label for="confirm-password">再次输入密码</label><input id="confirm-password" name="confirmPassword" type="password" required minlength="8" maxlength="128" autocomplete="new-password">':''}<p id="form-message" class="auth-message" role="status" aria-live="polite"></p><button type="submit" class="auth-submit">${setup?'创建账号并进入':'登录'}</button></form><a class="auth-help" href="${setup?'#login':'#setup'}">${setup?'已有账号？返回登录':'首次使用？创建主账号'}</a></section><p class="auth-footer">自习室 / 我的学习空间</p>`;
  document.getElementById('login-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const form=event.currentTarget,fields=new FormData(form),button=form.querySelector('button'),message=document.getElementById('form-message');
    if(setup && fields.get('password')!==fields.get('confirmPassword')) {message.textContent='两次输入的密码不一致。';return;}
    button.disabled=true;message.textContent='';
    try {
      if(setup) await api.create(fields.get('username'),fields.get('password'),fields.get('setupKey'));
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
  if(profile.role==='owner') {
    const content=element('a','内容管理');content.href='#content';nav.append(content);
    const accounts=element('a','账号管理');accounts.href='#accounts';nav.append(accounts);
  }
  top.append(nav);
  const menu=element('div','','account-menu');menu.append(element('span',profile.username));
  const logout=element('button','退出登录');logout.id='logout-button';logout.type='button';
  logout.addEventListener('click',async()=>{logout.disabled=true;try{await api.logout();}catch{}currentProfile=null;location.hash='login';await show();});
  menu.append(logout);top.append(menu);return top;
}
async function homeView(profile,run) {
  const content=await api.content();
  if(run!==revision) return;
  document.body.className='';view.className='';
  view.replaceChildren(document.getElementById('home-template').content.cloneNode(true));
  view.querySelector('.topbar').replaceWith(header(profile));
  renderContent(content);
  const welcome=element('section','','welcome-panel');
  const copy=element('div','','welcome-copy');copy.append(element('p','WELCOME BACK','eyebrow'),element('h2',`你好，${profile.username}`),element('p',content.notes.length || content.links.length?'继续整理你的学习记录，常用资料都在这里。':'你的学习空间已经准备好了，先添加第一篇笔记或第一个常用链接。','welcome-text'));
  const stats=element('div','','welcome-stats');
  for(const [number,label] of [[content.notes.length,'学习笔记'],[content.links.length,'常用链接']]) {const card=element('div','','stat-card');card.append(element('strong',String(number)),element('span',label));stats.append(card);}
  welcome.append(copy,stats);
  if(profile.role==='owner') {const action=element('a','添加学习内容','primary-link');action.href='#content';welcome.append(action);}
  view.querySelector('.page-heading').after(welcome);
}
function contentList(items,type) {
  const list=element('ul','','manage-list');
  if(!items.length) {list.append(element('li',type==='note'?'还没有笔记，使用左侧表单添加第一篇。':'还没有链接，使用左侧表单添加第一个。','manage-empty'));return list;}
  for(const item of items) {
    const row=element('li','','manage-row'),copy=element('div');
    copy.append(element('strong',item.title),element('p',type==='note'?(item.summary || item.date || '无摘要'):(item.description || item.url)));
    const remove=element('button','删除','danger-button');remove.type='button';
    remove.addEventListener('click',async()=>{if(!confirm(`确定删除“${item.title}”吗？`))return;remove.disabled=true;try{if(type==='note')await api.deleteNote(item.id);else await api.deleteLink(item.id);await show();}catch(error){remove.disabled=false;alert(error.message);}});
    row.append(copy,remove);list.append(row);
  }
  return list;
}
async function contentView(profile,run) {
  if(profile.role!=='owner') throw new Error('只有主账号可以管理学习内容。');
  const content=await api.content();if(run!==revision)return;
  document.body.className='';view.className='';view.replaceChildren(header(profile));
  const main=element('main','','content-main');
  main.innerHTML='<div class="page-heading"><div><p class="eyebrow">CONTENT STUDIO</p><h1>内容管理<span class="title-dot">.</span></h1><p class="page-intro">直接输入 LaTeX 公式内容，系统会自动渲染并提供命令补全。</p></div><a class="secondary-link" href="#home">返回学习主页</a></div><div class="editor-grid"><section class="panel editor-panel"><div class="section-heading"><div><span class="section-number">01</span><h2>添加学习笔记</h2></div></div><form id="note-form" class="content-form note-editor-form"><label for="note-title">标题</label><input id="note-title" name="title" required maxlength="100" placeholder="例如：线性代数第一章"><div class="latex-workbench"><div class="formula-editor"><label for="note-summary">公式内容</label><textarea id="note-summary" name="summary" maxlength="500" rows="12" placeholder="直接输入：\\frac{1}{x+1} 或 \\int_0^1 x^2 dx"></textarea><div id="formula-menu" class="formula-menu" hidden></div><p class="formula-help">输入 \\fra、\\alp、\\sqrt、\\int 等命令可调出补全；↑↓ 选择，Enter / Tab 确认。</p><div class="formula-toolbar"><button type="button" data-formula="\\frac{}{}">分式</button><button type="button" data-formula="\\sqrt{}">根号</button><button type="button" data-formula="^{}">上标</button><button type="button" data-formula="_{ }">下标</button><button type="button" data-formula="\\sum_{i=1}^{n}">求和</button><button type="button" data-formula="\\int_{a}^{b}">积分</button><button type="button" data-formula="\\begin{pmatrix}  &  \\\\  &  \\end{pmatrix}">矩阵</button></div></div><div><label>实时预览</label><div id="latex-preview" class="latex-preview" aria-live="polite"></div><p id="formula-status" class="formula-status" role="status"></p></div></div><div class="form-split"><div><label for="note-date">日期或标签</label><input id="note-date" name="date" maxlength="40" placeholder="例如：今天 / 数学"></div><div><label for="note-url">相关链接（可选）</label><input id="note-url" name="url" type="url" maxlength="2000" placeholder="https://"></div></div><p class="form-status" role="status"></p><button class="auth-submit" type="submit">保存笔记</button></form><details class="link-quick-entry"><summary>添加常用链接</summary><form id="link-form" class="content-form link-quick-form"><div><label for="link-title">名称</label><input id="link-title" name="title" required maxlength="100" placeholder="例如：课程平台"></div><div><label for="link-url">网址</label><input id="link-url" name="url" type="url" required maxlength="2000" placeholder="https://"></div><div><label for="link-description">说明</label><input id="link-description" name="description" maxlength="300" placeholder="这个链接用来做什么"></div><p class="form-status" role="status"></p><button class="auth-submit" type="submit">保存链接</button></form></details></section></div><div class="library-grid"><section class="panel"><div class="section-heading"><div><h2>已有笔记</h2></div><span class="count">'+content.notes.length+' 篇</span></div><div id="manage-notes"></div></section><section class="panel"><div class="section-heading"><div><h2>已有链接</h2></div><span class="count">'+content.links.length+' 个</span></div><div id="manage-links"></div></section></div>';
  view.append(main);document.getElementById('manage-notes').append(contentList(content.notes,'note'));document.getElementById('manage-links').append(contentList(content.links,'link'));
  const bind=(id,save)=>document.getElementById(id).addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),status=form.querySelector('.form-status'),values=Object.fromEntries(new FormData(form));button.disabled=true;status.textContent='';try{await save(values);form.reset();status.textContent='已保存。';await show();}catch(error){status.textContent=error.message;button.disabled=false;}});
  const summary=document.getElementById('note-summary'),preview=document.getElementById('latex-preview');setupFormulaInput(summary,preview,document.getElementById('formula-menu'),document.getElementById('formula-status'));
  main.querySelectorAll('[data-formula]').forEach(button=>button.addEventListener('click',()=>{summary.focus();const start=summary.selectionStart;summary.setRangeText(button.dataset.formula,start,summary.selectionEnd,'end');summary.dispatchEvent(new Event('input'));}));
  bind('note-form',values=>api.addNote(values));bind('link-form',values=>api.addLink(values));
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
    try {await api.create(fields.get('username'),fields.get('password'));form.reset();await show();} catch(error) {message.textContent=error.message;button.disabled=false;}
  });
}
async function show() {
  const run=++revision,path=location.hash.slice(1) || 'home';
  if(!api.session) {if(path!=='setup' && path!=='login') {location.hash='login';return;}authView(path==='setup');return;}
  try {
    currentProfile=await api.profile();
    if(run!==revision)return;
    if(path==='accounts') await accountsView(currentProfile,run);else if(path==='content') await contentView(currentProfile,run);else await homeView(currentProfile,run);
  } catch(error) {
    if(run!==revision)return;
    api.save(null);authView(false);document.getElementById('form-message').textContent=error.message;
  }
}
try {
  const response=await fetch('./config.json',{cache:'no-store'});
  if(!response.ok) throw new Error();
  const config=await response.json();
  if(!config.supabaseUrl || !config.supabasePublishableKey) throw new Error();
  api=new StudyAPI(config);window.addEventListener('hashchange',show);await show();
} catch {document.getElementById('initial-message').textContent='网站正在准备，请稍后访问。';}

