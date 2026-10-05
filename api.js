export class StudyAPI {
  constructor(config,{fetchAPI=fetch,storage=sessionStorage}={}) {
    this.url=config.supabaseUrl.replace(/\/$/,'');
    this.key=config.supabasePublishableKey;
    // Call native window.fetch as a plain function. Some browsers reject it when
    // it is invoked as an object method with StudyAPI as the receiver.
    this.fetchAPI=(...args)=>fetchAPI(...args);
    this.storage=storage;
    this.version=0;
    this.refreshing=null;
    try {this.session=JSON.parse(storage.getItem('study-session') || 'null');} catch {this.session=null;}
    if(!this.session?.access_token || !this.session?.refresh_token || !this.session?.user?.id) this.session=null;
  }
  save(session) {
    this.version++;
    this.session=session;
    if(session) this.storage.setItem('study-session',JSON.stringify(session));
    else this.storage.removeItem('study-session');
  }
  async refresh() {
    if(!this.refreshing) {
      const version=this.version,refreshToken=this.session?.refresh_token;
      this.refreshing=(async()=>{
        const refreshed=await this.request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:refreshToken},authenticated:false});
        if(this.version!==version) throw new Error('登录状态已改变，请重新登录。');
        this.save(refreshed);
      })().finally(()=>{this.refreshing=null;});
    }
    return this.refreshing;
  }
  async request(path,{method='GET',body,authenticated=true,retry=true,headers={}}={}) {
    if(authenticated && !this.session?.access_token) throw new Error('请先登录。');
    const accessToken=this.session?.access_token;
    const response=await this.fetchAPI(this.url+path,{method,headers:{apikey:this.key,'Content-Type':'application/json',...(authenticated?{Authorization:'Bearer '+accessToken}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    let data;
    try {data=await response.json();} catch {data={};}
    if(response.status===401 && authenticated && retry && this.session?.refresh_token) {
      try {
        if(this.session.access_token===accessToken) await this.refresh();
      } catch {this.save(null);throw new Error('登录已过期，请重新登录。');}
      return this.request(path,{method,body,authenticated,retry:false,headers});
    }
    if(!response.ok) throw new Error(data.error_description || data.error || data.msg || '暂时无法完成请求，请稍后重试。');
    return data;
  }
  async login(username,password) {
    const session=await this.request('/auth/v1/token?grant_type=password',{method:'POST',authenticated:false,body:{email:username.trim().toLowerCase()+'@study-accounts.invalid',password}});
    this.save(session);
    try {return await this.profile();} catch(error) {this.save(null);throw error;}
  }
  async profile() {
    const profiles=await this.request('/rest/v1/study_profiles?id=eq.'+encodeURIComponent(this.session.user.id)+'&select=id,username,role');
    if(!profiles.length) throw new Error('这个账号尚未获得网站访问权限。');
    return profiles[0];
  }
  async content() {
    const [notes,links]=await Promise.all([this.myNotes(),this.request('/rest/v1/study_links?select=id,title,description,url&order=created_at.desc')]);
    return {notes,links};
  }
  myNotes() {
    const userId=encodeURIComponent(this.session?.user?.id || '');
    return this.request('/rest/v1/study_notes?select=id,title,body,summary,url,date,status,created_at,updated_at,visibility,author_id&author_id=eq.'+userId+'&order=updated_at.desc');
  }
  publicNotes() { return this.request('/rest/v1/study_notes?select=id,title,body,summary,url,date,status,created_at,updated_at,visibility,author_id&visibility=eq.public&status=eq.published&order=updated_at.desc'); }
  notes(scope='private') { return scope==='public' ? this.publicNotes() : this.myNotes(); }
  note(id) {return this.request('/rest/v1/study_notes?id=eq.'+encodeURIComponent(id)+'&select=id,title,body,summary,url,date,status,created_at,updated_at,visibility,author_id');}
  addNote({title,body='',summary='',url='',date='',visibility='private',status='published'}) {
    return this.request('/rest/v1/study_notes',{method:'POST',headers:{Prefer:'return=representation'},body:{author_id:this.session.user.id,title:title.trim(),body:body || summary,summary:summary || body,url:url.trim() || null,date:date.trim() || null,status:status==='draft'?'draft':'published',visibility:visibility==='public'?'public':'private'}});
  }
  updateNote(id,{title,body='',summary='',url='',date='',visibility='private',status='published'}) {return this.request('/rest/v1/study_notes?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=representation'},body:{title:title.trim(),body,summary:summary || body,url:url.trim() || null,date:date.trim() || null,status:status==='draft'?'draft':'published',visibility:visibility==='public'?'public':'private',updated_at:new Date().toISOString()}});}
  deleteNote(id) {return this.request('/rest/v1/study_notes?id=eq.'+encodeURIComponent(id),{method:'DELETE'});}
  addLink({title,description='',url}) {
    return this.request('/rest/v1/study_links',{method:'POST',headers:{Prefer:'return=minimal'},body:{title:title.trim(),description:description.trim(),url:url.trim()}});
  }
  deleteLink(id) {return this.request('/rest/v1/study_links?id=eq.'+encodeURIComponent(id),{method:'DELETE'});}
  accounts() {return this.request('/rest/v1/study_profiles?select=id,username,role&order=created_at');}
  profileNames() {return this.request('/rest/v1/study_profiles?select=id,username&order=created_at');}
  create(username,password,setupKey) {return this.request('/functions/v1/study-accounts',{method:'POST',authenticated:false,body:{action:setupKey?'setup':'signup',username,password,...(setupKey?{setupKey}:{})}});}
  createMember(username,password) {return this.request('/functions/v1/study-accounts',{method:'POST',body:{action:'create',username,password}});}
  async logout() {
    const session=this.session;
    this.save(null);
    if(session) {
      const response=await this.fetchAPI(this.url+'/auth/v1/logout',{method:'POST',headers:{apikey:this.key,Authorization:'Bearer '+session.access_token}});
      if(!response.ok && response.status!==401) throw new Error('远程会话退出暂未完成，本设备已退出。');
    }
  }
}

