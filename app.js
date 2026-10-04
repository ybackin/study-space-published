import { StudyAPI } from './api.js';
import { renderContent } from './content-renderer.js';

const view=document.getElementById('site-view');
let api, currentProfile, revision=0;
const element=(tag,text,className)=>{const node=document.createElement(tag);node.textContent=text || '';if(className)node.className=className;return node;};
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
  if(profile.role==='owner') {const accounts=element('a','账号管理');accounts.href='#accounts';nav.append(accounts);}
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
    if(path==='accounts') await accountsView(currentProfile,run);else await homeView(currentProfile,run);
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
