const STORAGE_KEY = 'telesale-assistant-v1'; // giữ dữ liệu từ V1/V2
const AGENT_KEY = 'telesale-agent-name';

const seed = {
  customers: [
    {id: crypto.randomUUID(), name:'Nguyễn Văn An', phone:'0901234567', source:'CRM', product:'Vay theo lương', status:'Tiềm năng', followup: nextLocalDate(1,9,30), note:'Khách quan tâm, cần gọi lại xác nhận hồ sơ.', zaloStatus:'unknown', updatedAt:new Date().toISOString()},
    {id: crypto.randomUUID(), name:'Trần Minh Anh', phone:'0912345678', source:'Facebook', product:'Tư vấn khoản vay', status:'Đã gửi Zalo', followup: nextLocalDate(0,16,0), note:'Đã gửi thông tin, chờ phản hồi.', zaloStatus:'yes', updatedAt:new Date().toISOString()},
    {id: crypto.randomUUID(), name:'Lê Quốc Huy', phone:'0987654321', source:'Data riêng', product:'Vay tiêu dùng', status:'Không nghe', followup: nextLocalDate(1,10,0), note:'Gọi lần 1 chưa nghe máy.', zaloStatus:'unknown', updatedAt:new Date().toISOString()}
  ],
  templates: [
    {id: crypto.randomUUID(), name:'Khách mới', text:'Chào {ten}, em là {nhan_vien}. Em liên hệ để hỗ trợ thông tin về {san_pham}. Khi tiện anh/chị nhắn lại em nhé.', zbsTemplateId:'', zbsTemplateData:'{"customer_name":"{ten}"}'},
    {id: crypto.randomUUID(), name:'Sau cuộc gọi', text:'Em chào {ten}, em là {nhan_vien} vừa trao đổi với anh/chị. Em gửi lại thông tin để mình tiện tham khảo. Có gì cần hỗ trợ cứ nhắn em nhé.', zbsTemplateId:'', zbsTemplateData:'{"customer_name":"{ten}"}'},
    {id: crypto.randomUUID(), name:'Hẹn gọi lại', text:'Chào {ten}, em {nhan_vien} đây ạ. Em xin phép liên hệ lại theo lịch mình đã trao đổi. Khi nào anh/chị tiện em gọi lại nhé.', zbsTemplateId:'', zbsTemplateData:'{"customer_name":"{ten}"}'}
  ],
  schedules: [],
  settings: {showSourceInfo:true,autoSendEnabled:false,smsFallback:true,backendBaseUrl:'',backendApiKey:'',offlineOnly:false,smsDuplicateDays:30,staleCustomerDays:7}
};

let state = migrateState(loadState());
let selectedCustomerId = state.customers[0]?.id || null;
let schedulerBusy = false;
setTimeout(()=>{try{aippScheduleNativeDbSync(250);}catch(_){}},1200);

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const isAndroid = /Android/i.test(navigator.userAgent);

function nextLocalDate(dayOffset,hour,min){ const d=new Date(); d.setDate(d.getDate()+dayOffset); d.setHours(hour,min,0,0); return toLocalInput(d); }
function toLocalInput(d){ const z=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; }
function fmtDate(v){ if(!v)return '—'; const d=new Date(v); return Number.isNaN(d.getTime())?'—':d.toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
function loadState(){ try{return JSON.parse(localStorage.getItem(STORAGE_KEY)) || structuredClone(seed)}catch{return structuredClone(seed)} }
function migrateState(raw){
  const s=raw&&typeof raw==='object'?raw:structuredClone(seed);
  s.customers=Array.isArray(s.customers)?s.customers.map(c=>{
    c={...c,zaloStatus:c.zaloStatus||'unknown',gender:c.gender||'unknown'};
    // Data-safe migration: old V5.6.1 used `documents` as an array, while checklist uses an object.
    if(Array.isArray(c.documents)){ c.legacyDocuments=Array.isArray(c.legacyDocuments)?[...c.legacyDocuments,...c.documents]:[...c.documents]; c.documents={}; }
    else if(!c.documents||typeof c.documents!=='object') c.documents={};
    if(!c.documentImages||Array.isArray(c.documentImages)) c.documentImages={};
    c.extraPhones=Array.isArray(c.extraPhones)?c.extraPhones:[];
    c.timeline=Array.isArray(c.timeline)?c.timeline:[];
    c.profile=c.profile&&typeof c.profile==='object'?c.profile:{};
    c.customFields=c.customFields&&typeof c.customFields==='object'?c.customFields:{};
    return c;
  }):[];
  s.templates=Array.isArray(s.templates)?s.templates.map(t=>({...t,zbsTemplateId:t.zbsTemplateId||'',zbsTemplateData:t.zbsTemplateData||'{"customer_name":"{ten}"}'})):structuredClone(seed.templates);
  s.schedules=Array.isArray(s.schedules)?s.schedules:[];
  const old=s.settings||{};
  s.settings={...seed.settings,...old,backendBaseUrl:old.backendBaseUrl||'',backendApiKey:old.backendApiKey||''};
  delete s.settings.zaloApiEndpoint; delete s.settings.zaloLookupEndpoint; delete s.settings.smsApiEndpoint;
  return s;
}
let aippNativeDbSyncTimer=null;
function aippNativeDbSnapshot(){
  return (Array.isArray(state?.customers)?state.customers:[]).map(c=>({
    id:c.id||'',name:c.name||'',phone:c.phone||'',source:c.source||'',status:c.status||'',
    followup:c.followup||'',updatedAt:c.updatedAt||'',zaloStatus:c.zaloStatus||'',gender:c.gender||'',
    province:c.province||'',region:c.region||'',product:c.product||'',birthday:c.birthday||''
  }));
}
function aippSyncNativeDbNow(){
  try{
    if(!window.AippAndroid||typeof window.AippAndroid.syncCustomerDb!=='function')return;
    window.AippAndroid.syncCustomerDb(JSON.stringify(aippNativeDbSnapshot()));
  }catch(err){console.warn('AIPP native DB shadow sync skipped',err);}
}
function aippScheduleNativeDbSync(delay=900){
  try{clearTimeout(aippNativeDbSyncTimer);}catch(_){}
  aippNativeDbSyncTimer=setTimeout(aippSyncNativeDbNow,Math.max(100,Number(delay)||900));
}

function save({render=true}={}){
  try{
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    state._storageMeta={...(state._storageMeta||{}),lastSavedAt:new Date().toISOString()};
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch(_){}
    aippScheduleNativeDbSync();
    if(render)renderAll();
    return true;
  }catch(err){
    console.error('AIPP save failed',err);
    toast('⚠️ Không thể lưu dữ liệu. Bộ nhớ AIPP có thể đã đầy. Hãy tạo backup và giảm số ảnh hồ sơ.',5200);
    return false;
  }
}
function toast(msg,ms=2600){ const el=$('#toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>el.classList.remove('show'),ms); }
function agent(){return localStorage.getItem(AGENT_KEY)||'Nhân viên'}
function normalizePhone(p){let n=String(p||'').replace(/[^\d+]/g,'');if(n.startsWith('+84'))n='0'+n.slice(3);if(n.startsWith('84')&&n.length>=11)n='0'+n.slice(2);return n.replace(/\D/g,'')}
function internationalPhone(p){const n=normalizePhone(p);return /^0\d{9}$/.test(n)?'84'+n.slice(1):n}
function statusClass(s){return s==='Tiềm năng'?'hot':''}
function isToday(v){if(!v)return false;return new Date(v).toDateString()===new Date().toDateString()}
function isOverdue(v){return !!v&&new Date(v)<new Date()}
function isDueSchedule(s){return s.status==='scheduled'&&new Date(s.sendAt)<=new Date()}
function zaloLabel(v){return v==='yes'?'Có Zalo':v==='no'?'Không có Zalo':'Chưa xác minh'}
function genderLabel(v){return v==='male'?'Nam':v==='female'?'Nữ':'Chưa xác định'}
function genderClass(v){return v==='male'?'gender-male':v==='female'?'gender-female':'gender-unknown'}
function zaloPillClass(v){return v==='yes'?'good':v==='no'?'bad':'warn'}
function scheduleStatusLabel(v){return ({scheduled:'Đã lên lịch',manual:'Cần gửi thủ công',sent:'Đã gửi',failed:'Lỗi',blocked:'Chặn gửi trùng',cancelled:'Đã hủy'})[v]||v}
function scheduleStatusClass(v){return v==='sent'?'good':(v==='failed'||v==='blocked')?'bad':v==='manual'?'warn':''}

function classifyPhone(phone){
  const p=normalizePhone(phone);if(!/^0\d{9}$/.test(p))return {valid:false,type:'Không hợp lệ',origin:'—'};
  if(/^02/.test(p))return {valid:true,type:'Cố định',origin:'Điện thoại bàn'};
  const pre=p.slice(0,3),groups={Viettel:['032','033','034','035','036','037','038','039','086','096','097','098'],VinaPhone:['081','082','083','084','085','088','091','094'],MobiFone:['070','076','077','078','079','089','090','093'],Vietnamobile:['052','056','058','092'],Gmobile:['059','099'],iTel:['087'],Wintel:['055']};
  let origin='Di động';for(const [name,prefixes] of Object.entries(groups))if(prefixes.includes(pre)){origin=name;break}return {valid:true,type:'Di động',origin};
}

function carrierSymbol(origin){
  const logos={
    Viettel:'carriers/viettel.svg',
    VinaPhone:'carriers/vinaphone.svg',
    MobiFone:'carriers/mobifone.svg',
    Vietnamobile:'carriers/vietnamobile.svg',
    Gmobile:'carriers/gmobile.svg',
    iTel:'carriers/itel.svg',
    Wintel:'carriers/wintel.svg'
  };
  if(logos[origin]) return `<img class="carrier-logo carrier-logo-${String(origin).toLowerCase()}" src="${logos[origin]}" alt="${origin}" loading="lazy">`;
  return ({'Điện thoại bàn':'☎️','Di động':'📱','—':'❔'})[origin]||'📡';
}
function carrierDisplay(phone){const net=classifyPhone(phone).origin;return carrierSymbol(net);}

function telHref(phone){
  const p=normalizePhone(phone); if(!p)return '#';
  return `tel:${p}`;
}
function smsHref(phone,message=''){
  const p=normalizePhone(phone); if(!p)return '#';
  if(isAndroid)return `smsto:${p}${message?`?body=${encodeURIComponent(message)}`:''}`;
  const sep=/iPhone|iPad|iPod/i.test(navigator.userAgent)?'&':'?';return `sms:${p}${message?`${sep}body=${encodeURIComponent(message)}`:''}`;
}
function zaloHref(phone){
  const p=normalizePhone(phone); if(!p)return 'https://zalo.me/';
  const fallback=encodeURIComponent(`https://zalo.me/${p}`);
  return isAndroid?`intent://zaloapp.com/qr/link/${p}#Intent;scheme=zalo;package=com.zing.zalo;S.browser_fallback_url=${fallback};end`:`https://zalo.me/${p}`;
}
function apiBase(){
  const configured=(state.settings.backendBaseUrl||'').trim().replace(/\/$/,'');
  if(configured)return configured;
  if(/^https?:$/.test(location.protocol))return location.origin;
  return '';
}
function apiUrl(path){const base=apiBase();return base?base+path:''}
async function fetchJson(url,options={}){if(state.settings.offlineOnly){const err=new Error('Chế độ riêng tư đang bật – kết nối API/backend đã bị chặn');err.code='AIPP_OFFLINE_ONLY';throw err}const headers={...(options.headers||{})};if(state.settings.backendApiKey)headers['x-app-key']=state.settings.backendApiKey;const r=await fetch(url,{...options,headers});let data={};try{data=await r.json()}catch{}if(!r.ok){const err=new Error(data.message||`HTTP ${r.status}`);err.status=r.status;err.data=data;throw err}return data}
async function postJson(url,payload){return fetchJson(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})}

function renderAll(){applySettingsUI();renderStats();renderTodos();renderDueMessages();renderHot();renderCustomers();renderDetail();renderFollowups();renderSchedules();renderTemplates();renderSourceFilter();renderSettings();}
function renderStats(){const c=state.customers;const stats=[['Tổng khách',c.length],['Cần xử lý',c.filter(x=>isToday(x.followup)||isOverdue(x.followup)).length],['Tiềm năng',c.filter(x=>x.status==='Tiềm năng').length],['Chưa rõ Zalo',c.filter(x=>x.zaloStatus==='unknown').length],['Tin đến lịch',state.schedules.filter(isDueSchedule).length]];$('#statsGrid').innerHTML=stats.map(([t,v])=>`<div class="stat"><span>${t}</span><strong>${v}</strong></div>`).join('')}
function renderTodos(){const a=state.customers.filter(x=>x.followup&&(isToday(x.followup)||isOverdue(x.followup))).sort((x,y)=>new Date(x.followup)-new Date(y.followup));$('#todoCount').textContent=a.length;$('#todoList').innerHTML=a.length?a.map(listItemHtml).join(''):'<div class="muted">Không có lịch cần xử lý.</div>'}
function renderDueMessages(){const a=state.schedules.filter(s=>isDueSchedule(s)||s.status==='manual').sort((x,y)=>new Date(x.sendAt)-new Date(y.sendAt));$('#dueMessageCount').textContent=a.length;$('#dueMessageList').innerHTML=a.length?a.slice(0,8).map(s=>{const c=state.customers.find(x=>x.id===s.customerId);return `<div class="list-item" data-open-schedule="${s.id}"><div class="item-main"><strong>${esc(c?.name||'Khách đã xóa')}</strong><div class="meta">${fmtDate(s.sendAt)} • ${esc(s.channel==='auto'?'Tự chọn':s.channel.toUpperCase())}</div></div><span class="mini-pill ${scheduleStatusClass(s.status)}">${esc(scheduleStatusLabel(s.status))}</span></div>`}).join(''):'<div class="muted">Chưa có tin đến lịch.</div>'}
function renderHot(){const a=state.customers.filter(x=>x.status==='Tiềm năng');$('#hotList').innerHTML=a.length?a.map(listItemHtml).join(''):'<div class="muted">Chưa có khách tiềm năng.</div>'}
function listItemHtml(x){const src=state.settings.showSourceInfo&&x.source?` • ${esc(x.source)}`:'';return `<div class="list-item ${genderClass(x.gender)}" data-open-customer="${x.id}"><div class="item-main"><strong>${esc(x.name)}</strong><div class="meta">${esc(x.phone)}${src}${x.followup?' • '+fmtDate(x.followup):''}</div></div><span class="status-pill ${statusClass(x.status)}">${esc(x.status)}</span></div>`}
function carrierValue(phone){const c=classifyPhone(phone);return c.valid&&c.type==='Di động'?c.origin:'other'}
function carrierMatches(phone,filter){if(!filter)return true;const v=carrierValue(phone);return filter==='other'?!['Viettel','VinaPhone','MobiFone','Vietnamobile','Gmobile','iTel','Wintel'].includes(v):v===filter}
function renderCustomers(){const q=($('#globalSearch').value||'').trim().toLowerCase(),sf=$('#statusFilter').value,src=$('#sourceFilter').value,carrier=$('#carrierFilter')?.value||'';const list=state.customers.filter(x=>(!q||x.name.toLowerCase().includes(q)||normalizePhone(x.phone).includes(normalizePhone(q)))&&(!sf||x.status===sf)&&(!state.settings.showSourceInfo||!src||x.source===src)&&carrierMatches(x.phone,carrier));$('#customerList').innerHTML=list.length?list.map(x=>{const source=state.settings.showSourceInfo?` • ${esc(x.source||'Không rõ nguồn')}`:'';const net=classifyPhone(x.phone).origin;return `<div class="customer-row ${genderClass(x.gender)} ${x.id===selectedCustomerId?'active':''}" data-customer-id="${x.id}"><div><strong>${esc(x.name)}</strong><div class="meta">${esc(x.phone)}${source}</div><div class="phone-class"><span class="mini-pill carrier-pill" title="${esc(net)}">${carrierSymbol(net)}</span><span class="mini-pill ${zaloPillClass(x.zaloStatus)}">${zaloLabel(x.zaloStatus)}</span><span class="mini-pill ${genderClass(x.gender)}">${genderLabel(x.gender)}</span></div></div><span class="status-pill ${statusClass(x.status)}">${esc(x.status)}</span></div>`}).join(''):'<div class="muted" style="padding:18px">Không tìm thấy khách hàng.</div>'}
function firstTemplateMessage(c){const t=state.templates[0];return t?compileTemplate(t.text,c):''}
function renderDetail(){
  const x=state.customers.find(c=>c.id===selectedCustomerId);if(!x){$('#detailPanel').innerHTML='<div class="detail-empty">Chọn một khách hàng để xem chi tiết.</div>';return}
  const pc=classifyPhone(x.phone),msg=firstTemplateMessage(x),sourceCard=state.settings.showSourceInfo?`<div class="detail-card"><span>Nguồn</span><strong>${esc(x.source||'—')}</strong></div>`:'';
  const statuses=['Không nghe','Máy bận','Đang tư vấn','Đã tư vấn','Đã gửi Zalo','Đã gửi SMS','Hẹn gọi lại','Tiềm năng','Không nhu cầu','Hoàn tất'];
  $('#detailPanel').innerHTML=`
    <div class="customer-summary"><div class="customer-summary-main"><h3>${esc(x.name)}</h3><div class="phone">${esc(x.phone)}</div><div class="phone-class"><span class="mini-pill ${pc.valid?'good':'bad'}">${esc(pc.type)}</span><span class="mini-pill carrier-pill" title="${esc(pc.origin)}">${carrierSymbol(pc.origin)}</span><span class="mini-pill ${zaloPillClass(x.zaloStatus)}">${zaloLabel(x.zaloStatus)}</span><span class="mini-pill ${genderClass(x.gender)}">${genderLabel(x.gender)}</span></div></div><div class="customer-head-actions"><button class="secondary small" data-edit="${x.id}" title="Sửa khách">✏️ <span>Sửa</span></button><button class="secondary small" data-schedule-customer="${x.id}" title="Nhắc hoặc gửi sau">🗓 <span>Nhắc/Gửi sau</span></button><button class="danger small" data-delete="${x.id}" title="Xóa khách">🗑 <span>Xóa</span></button></div></div>
    <div class="contact-actions">
      <a class="action-btn action-call" href="${esc(telHref(x.phone))}"><span>📞</span><span>Gọi</span></a>
      <a class="action-btn action-zalo" href="${esc(zaloHref(x.phone))}"><span>💬</span><span>Zalo</span></a>
      <a class="action-btn action-sms" href="${esc(smsHref(x.phone,msg))}"><span>✉️</span><span>SMS</span></a>
    </div>
    <div class="secondary-actions"><button class="secondary" data-copy-template="${x.id}">📋 Tạo/copy tin</button><button class="secondary" data-check-zalo="${x.id}">🔎 Tra trạng thái Zalo</button><button class="secondary" data-schedule-customer="${x.id}">🗓 Lên lịch nhắn</button></div>
    <div class="quick-status-wrap"><div class="section-label">Cập nhật nhanh trạng thái</div><div class="quick-status">${statuses.map(s=>`<button class="${x.status===s?'active':''}" data-status="${esc(s)}" data-id="${x.id}">${esc(s)}</button>`).join('')}</div></div>
    <div class="info-grid"><div class="detail-card"><span>Giới tính</span><strong class="gender-text ${genderClass(x.gender)}">${genderLabel(x.gender)}</strong></div><div class="detail-card"><span>Trạng thái</span><strong>${esc(x.status)}</strong></div>${sourceCard}<div class="detail-card"><span>Nhu cầu</span><strong>${esc(x.product||'—')}</strong></div><div class="detail-card"><span>Gọi lại</span><strong>${fmtDate(x.followup)}</strong></div><div class="detail-card"><span>Zalo</span><div class="row-inline"><strong>${zaloLabel(x.zaloStatus)}</strong><button data-zalo-state="yes" data-id="${x.id}" class="secondary small zalo-choice ${x.zaloStatus==='yes'?'active yes':''}">Có</button><button data-zalo-state="no" data-id="${x.id}" class="secondary small zalo-choice ${x.zaloStatus==='no'?'active no':''}">Không</button><button data-zalo-state="unknown" data-id="${x.id}" class="secondary small zalo-choice ${x.zaloStatus==='unknown'?'active unknown':''}">?</button></div></div></div>
    <div class="note-box">${esc(x.note||'Chưa có ghi chú.')}</div><div class="customer-foot-actions aipp-detail-end-marker" aria-hidden="true"></div>`;
}
function renderFollowups(){const a=state.customers.filter(x=>x.followup).sort((x,y)=>new Date(x.followup)-new Date(y.followup));$('#followupList').innerHTML=a.length?a.map(listItemHtml).join(''):'<div class="muted">Chưa có lịch gọi lại.</div>'}
function renderTemplates(){$('#templateList').innerHTML=state.templates.length?state.templates.map(t=>`<div class="template-row"><div><strong>${esc(t.name)}</strong><p>${esc(t.text)}</p><div class="meta">ZBS Template ID: ${esc(t.zbsTemplateId||'chưa cấu hình')}</div></div><div class="template-actions"><button class="secondary small" data-edit-template="${t.id}">Sửa</button><button class="secondary small" data-delete-template="${t.id}">Xóa</button></div></div>`).join(''):'<div class="muted">Chưa có mẫu tin.</div>'}
function renderSourceFilter(){const el=$('#sourceFilter'),prev=el.value,sources=[...new Set(state.customers.map(x=>x.source).filter(Boolean))].sort();el.innerHTML='<option value="">Tất cả nguồn</option>'+sources.map(s=>`<option>${esc(s)}</option>`).join('');el.value=prev}
function renderSchedules(){const f=$('#scheduleStatusFilter')?.value||'',a=[...state.schedules].filter(s=>!f||s.status===f).sort((x,y)=>new Date(x.sendAt)-new Date(y.sendAt));$('#scheduleList').innerHTML=a.length?a.map(s=>{const c=state.customers.find(x=>x.id===s.customerId),t=state.templates.find(x=>x.id===s.templateId),msg=c&&t?compileTemplate(t.text,c):'';return `<div class="schedule-row"><div class="schedule-main"><strong>${esc(c?.name||'Khách đã xóa')} • ${esc(c?.phone||'')}</strong><p class="meta">${fmtDate(s.sendAt)} • ${esc(s.channel==='auto'?'Tự chọn Zalo → SMS':s.channel.toUpperCase())} • ${esc(t?.name||'Đã xóa')}</p><p class="meta">${esc(msg.slice(0,120))}${msg.length>120?'…':''}</p>${s.serverId?'<p class="schedule-sync">☁ Đã đồng bộ server</p>':''}${s.lastError?`<p class="error-text">${esc(s.lastError)}</p>`:''}</div><div class="schedule-side"><span class="mini-pill ${scheduleStatusClass(s.status)}">${esc(scheduleStatusLabel(s.status))}</span><div class="schedule-actions">${s.status==='manual'?`<button class="secondary small" data-send-manual="${s.id}">Mở để gửi</button>`:''}${['scheduled','manual','failed','blocked'].includes(s.status)?`<button class="secondary small" data-edit-schedule="${s.id}">✏️ Sửa</button>`:''}${['failed','blocked'].includes(s.status)?`<button class="secondary small" data-retry-native-sms="${s.id}">↻ Gửi lại</button>`:''}${['scheduled','manual','failed','blocked'].includes(s.status)?`<button class="danger small" data-cancel-schedule="${s.id}">Hủy</button>`:''}</div></div></div>`}).join(''):'<div class="muted">Chưa có lịch gửi tin.</div>'}
function renderSettings(){$('#showSourceInfoToggle').checked=!!state.settings.showSourceInfo;if($('#offlineOnlyToggle'))$('#offlineOnlyToggle').checked=!!state.settings.offlineOnly;updateOfflineOnlyUI();$('#autoSendToggle').checked=!!state.settings.autoSendEnabled;$('#smsFallbackToggle').checked=!!state.settings.smsFallback;$('#backendBaseUrl').value=state.settings.backendBaseUrl||'';$('#backendApiKey').value=state.settings.backendApiKey||''}
function applySettingsUI(){$$('.source-field').forEach(el=>el.classList.toggle('hidden-by-setting',!state.settings.showSourceInfo));$('#sourceFilter')?.classList.toggle('hidden-by-setting',!state.settings.showSourceInfo)}

function openCustomerDialog(id=null){const x=state.customers.find(c=>c.id===id);$('#dialogTitle').textContent=x?'Sửa khách hàng':'Thêm khách hàng';$('#customerId').value=x?.id||'';$('#nameInput').value=x?.name||'';$('#phoneInput').value=x?.phone||'';$('#sourceInput').value=x?.source||'';$('#productInput').value=x?.product||'';$('#birthdayInput').value=x?.birthday||'';$('#provinceInput').value=x?.province||'';$('#regionInput').value=x?.region||'';$('#genderInput').value=x?.gender||'unknown';$('#statusInput').value=x?.status||'Chưa gọi';$('#followupInput').value=x?.followup||'';$('#zaloStatusInput').value=x?.zaloStatus||'unknown';$('#noteInput').value=x?.note||'';$('#customerDialog').showModal()}
function saveCustomer(){const name=$('#nameInput').value.trim(),phone=$('#phoneInput').value.trim();if(!name){toast('Vui lòng nhập họ tên');$('#nameInput').focus();return false}if(!phone){toast('Vui lòng nhập số điện thoại');$('#phoneInput').focus();return false}if(!classifyPhone(phone).valid){toast('Số điện thoại chưa đúng định dạng Việt Nam');$('#phoneInput').focus();return false}const old=state.customers.find(x=>x.id===$('#customerId').value);const obj={...(old||{}),id:$('#customerId').value||crypto.randomUUID(),name,phone:normalizePhone(phone),source:state.settings.showSourceInfo?$('#sourceInput').value.trim():(old?.source||''),product:$('#productInput').value.trim(),birthday:$('#birthdayInput')?.value||'',province:$('#provinceInput')?.value.trim()||'',region:$('#regionInput')?.value.trim()||'',gender:$('#genderInput')?.value||old?.gender||'unknown',status:$('#statusInput').value,followup:$('#followupInput').value,zaloStatus:$('#zaloStatusInput').value,note:$('#noteInput').value.trim(),updatedAt:new Date().toISOString()};const i=state.customers.findIndex(x=>x.id===obj.id);if(i>=0)state.customers[i]=obj;else state.customers.unshift(obj);selectedCustomerId=obj.id;save();toast('Đã lưu khách hàng');return true}
function openTemplateDialog(id=null){const t=state.templates.find(x=>x.id===id);$('#templateId').value=t?.id||'';$('#templateNameInput').value=t?.name||'';$('#templateTextInput').value=t?.text||'';$('#zbsTemplateIdInput').value=t?.zbsTemplateId||'';$('#zbsTemplateDataInput').value=t?.zbsTemplateData||'{"customer_name":"{ten}"}';$('#templateDialog').showModal()}
function saveTemplate(){const name=$('#templateNameInput').value.trim(),txt=$('#templateTextInput').value.trim(),zbsData=$('#zbsTemplateDataInput').value.trim();if(!name){toast('Nhập tên mẫu tin');return false}if(!txt){toast('Nhập nội dung mẫu tin');return false}if(zbsData){try{JSON.parse(zbsData)}catch{toast('ZBS template_data phải là JSON hợp lệ');return false}}const obj={id:$('#templateId').value||crypto.randomUUID(),name,text:txt,zbsTemplateId:$('#zbsTemplateIdInput').value.trim(),zbsTemplateData:zbsData||'{}'};const i=state.templates.findIndex(x=>x.id===obj.id);if(i>=0)state.templates[i]=obj;else state.templates.unshift(obj);save();toast('Đã lưu mẫu tin');return true}
function compileTemplate(t,c){return String(t||'').replaceAll('{ten}',c.name||'').replaceAll('{sdt}',c.phone||'').replaceAll('{san_pham}',c.product||'dịch vụ').replaceAll('{nhan_vien}',agent())}
function compileZbsData(t,c){const raw=compileTemplate(t.zbsTemplateData||'{}',c);return JSON.parse(raw)}
async function createMessage(id){const c=state.customers.find(x=>x.id===id);if(!c||!state.templates.length)return;const options=state.templates.map((t,i)=>`${i+1}. ${t.name}`).join('\n'),raw=prompt(`Chọn mẫu tin:\n${options}`,'1');if(raw===null)return;const idx=Math.max(0,Math.min(state.templates.length-1,(parseInt(raw)||1)-1)),msg=compileTemplate(state.templates[idx].text,c);try{await navigator.clipboard.writeText(msg);toast('Đã copy tin nhắn')}catch{prompt('Copy nội dung sau:',msg)}}
function nextCustomer(){const pending=state.customers.filter(x=>!['Hoàn tất','Không nhu cầu'].includes(x.status)).sort((a,b)=>{const af=a.followup?new Date(a.followup):new Date(8640000000000000),bf=b.followup?new Date(b.followup):new Date(8640000000000000);return af-bf});if(!pending.length)return toast('Không còn khách cần xử lý');const i=pending.findIndex(x=>x.id===selectedCustomerId);selectedCustomerId=pending[(i+1+pending.length)%pending.length].id;showView('customers');renderAll()}
function showView(name){$$('.view').forEach(x=>x.classList.remove('active'));$(`#${name}View`).classList.add('active');$$('.nav-btn').forEach(x=>x.classList.toggle('active',x.dataset.view===name));document.body.classList.toggle('aipp-dashboard-active',name==='dashboard');const t={dashboard:'Tổng quan',customers:'Khách hàng',followups:'Lịch gọi lại',automation:'Tự động gửi tin',templates:'Mẫu tin nhắn',settings:'Cài đặt'};$('#pageTitle').textContent=t[name]}

function openScheduleDialog(customerId=null,scheduleId=null){const s=state.schedules.find(x=>x.id===scheduleId);if(!state.customers.length||!state.templates.length){toast('Cần có ít nhất 1 khách và 1 mẫu tin');return}$('#scheduleId').value=s?.id||'';$('#scheduleCustomerInput').innerHTML=state.customers.map(c=>`<option value="${c.id}">${esc(c.name)} — ${esc(c.phone)}</option>`).join('');$('#scheduleTemplateInput').innerHTML=state.templates.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('');$('#scheduleCustomerInput').value=s?.customerId||customerId||state.customers[0].id;$('#scheduleChannelInput').value=s?.channel||'auto';$('#scheduleTimeInput').value=s?.sendAt||nextLocalDate(0,new Date().getHours()+1,0);$('#scheduleTemplateInput').value=s?.templateId||state.templates[0].id;updateSchedulePreview();$('#scheduleDialog').showModal()}
function updateSchedulePreview(){const c=state.customers.find(x=>x.id===$('#scheduleCustomerInput').value),t=state.templates.find(x=>x.id===$('#scheduleTemplateInput').value);$('#schedulePreview').value=c&&t?compileTemplate(t.text,c):''}
async function saveSchedule(){const customerId=$('#scheduleCustomerInput').value,templateId=$('#scheduleTemplateInput').value,sendAt=$('#scheduleTimeInput').value;if(!customerId||!templateId||!sendAt){toast('Chọn đủ khách, mẫu tin và thời gian');return false}const id=$('#scheduleId').value||crypto.randomUUID(),old=state.schedules.find(x=>x.id===id),obj={id,customerId,templateId,channel:$('#scheduleChannelInput').value,sendAt,status:old?.status==='sent'?'sent':'scheduled',createdAt:old?.createdAt||new Date().toISOString(),lastError:'',serverId:old?.serverId||''};const i=state.schedules.findIndex(x=>x.id===id);if(i>=0)state.schedules[i]=obj;else state.schedules.push(obj);save();if(state.settings.autoSendEnabled&&apiBase())await pushScheduleToBackend(obj);toast(obj.serverId?'Đã lưu và đồng bộ lịch lên server':'Đã lưu lịch gửi');return true}

async function testBackend(){if(state.settings.offlineOnly){setApiStatus(null);toast('🔒 Chế độ riêng tư đang bật – API/backend đã bị chặn');return null}const base=apiBase();if(!base){setApiStatus(null);toast('Chưa có địa chỉ Backend V3');return null}try{const data=await fetchJson(apiUrl('/api/health'));setApiStatus(data);toast('Backend đã phản hồi');return data}catch(err){setApiStatus(false);toast(`Không kết nối được backend: ${err.message}`,4200);return null}}
function setApiStatus(data){const overall=$('#apiOverallBadge');const set=(id,val)=>{$(id).textContent=val===true?'Sẵn sàng':val===false?'Chưa cấu hình':'—';$(id).style.color=val===true?'#166534':val===false?'#991b1b':''};if(!data){overall.textContent='Chưa kết nối';overall.className='mini-pill warn';set('#zaloApiStatus',null);set('#lookupApiStatus',null);set('#smsApiStatus',null);return}if(data===false){overall.textContent='Lỗi kết nối';overall.className='mini-pill bad';set('#zaloApiStatus',false);set('#lookupApiStatus',false);set('#smsApiStatus',false);return}overall.textContent='Backend online';overall.className='mini-pill good';set('#zaloApiStatus',!!data.zaloConfigured);set('#lookupApiStatus',!!data.lookupConfigured);set('#smsApiStatus',!!data.smsConfigured)}
async function checkZaloAvailability(customer,{silent=false}={}){if(!customer)return null;if(!apiBase()){if(!silent)toast('Chưa kết nối backend. Bạn có thể đánh dấu Có/Không thủ công.');return null}try{if(!silent)toast('Đang tra trạng thái Zalo...');const data=await postJson(apiUrl('/api/zalo/check'),{phone:internationalPhone(customer.phone),customerId:customer.id});if(data.supported===false){if(!silent)toast(data.message||'Backend chưa có dịch vụ tra Zalo');return null}if(typeof data.hasZalo!=='boolean')throw new Error('API không trả về hasZalo true/false');customer.zaloStatus=data.hasZalo?'yes':'no';customer.updatedAt=new Date().toISOString();save();if(!silent)toast(data.hasZalo?'Đã xác định số có Zalo':'Đã xác định số không có Zalo');return data.hasZalo}catch(err){if(err.status===501){if(!silent)toast(err.data?.message||'Chưa cấu hình dịch vụ tra Zalo');return null}if(!silent)toast(`Không tra được Zalo: ${err.message}`);return null}}
async function sendViaZalo(customer,message,template){if(!apiBase())return {ok:false,manual:true,error:'Chưa kết nối Backend V3'};if(!template?.zbsTemplateId)return {ok:false,manual:true,error:'Mẫu chưa có ZBS Template ID'};try{const data=await postJson(apiUrl('/api/zalo/send'),{phone:internationalPhone(customer.phone),templateId:template.zbsTemplateId,templateData:compileZbsData(template,customer),trackingId:`${customer.id}-${Date.now()}`});return {ok:data.ok!==false,error:data.message||''}}catch(err){if(err.data?.noZalo){customer.zaloStatus='no';save();return {ok:false,noZalo:true,error:err.data?.message||'Không có Zalo'}}return {ok:false,error:err.data?.message||err.message}}}
async function sendViaSms(customer,message){if(!apiBase())return {ok:false,manual:true,error:'Chưa kết nối Backend V3'};try{const data=await postJson(apiUrl('/api/sms/send'),{phone:internationalPhone(customer.phone),message,customerId:customer.id,name:customer.name});return {ok:data.ok!==false,error:data.message||''}}catch(err){if(err.status===501)return {ok:false,manual:true,error:err.data?.message||'SMS backend chưa cấu hình'};return {ok:false,error:err.data?.message||err.message}}}
async function executeSchedule(schedule,{force=false}={}){if(!schedule||schedule.status==='sent'||schedule.status==='cancelled')return;if(schedule.serverId&&!force){return}const c=state.customers.find(x=>x.id===schedule.customerId),t=state.templates.find(x=>x.id===schedule.templateId);if(!c||!t){schedule.status='failed';schedule.lastError='Không tìm thấy khách hoặc mẫu tin';save();return}const msg=compileTemplate(t.text,c);let channel=schedule.channel;if(channel==='auto'){if(c.zaloStatus==='unknown')await checkZaloAvailability(c,{silent:true});channel=c.zaloStatus==='no'?'sms':'zalo'}let result;if(channel==='zalo'){result=await sendViaZalo(c,msg,t);if(!result.ok&&result.noZalo&&state.settings.smsFallback){channel='sms';result=await sendViaSms(c,msg)}}else result=await sendViaSms(c,msg);if(result.ok){schedule.status='sent';schedule.sentAt=new Date().toISOString();schedule.sentChannel=channel;schedule.lastError='';c.status=channel==='sms'?'Đã gửi SMS':'Đã gửi Zalo';c.updatedAt=new Date().toISOString();toast(`Đã gửi ${channel.toUpperCase()} cho ${c.name}`)}else if(result.manual){schedule.status='manual';schedule.lastError=result.error||'Cần gửi thủ công';if(force)openManualSchedule(schedule)}else{schedule.status='failed';schedule.lastError=result.error||'Gửi thất bại';toast(`Gửi thất bại: ${schedule.lastError}`,4200)}save()}
function openManualSchedule(schedule){const c=state.customers.find(x=>x.id===schedule.customerId),t=state.templates.find(x=>x.id===schedule.templateId);if(!c||!t)return;const msg=compileTemplate(t.text,c),channel=schedule.channel==='auto'?(c.zaloStatus==='no'?'sms':'zalo'):schedule.channel;if(channel==='sms'){location.href=smsHref(c.phone,msg)}else{navigator.clipboard?.writeText(msg).catch(()=>{});location.href=zaloHref(c.phone);toast('Đã copy nội dung và mở Zalo')}}
async function processDueSchedules(){if(state.settings.offlineOnly||schedulerBusy||!state.settings.autoSendEnabled)return;const due=state.schedules.filter(s=>isDueSchedule(s)&&!s.serverId);if(!due.length)return;schedulerBusy=true;try{for(const s of due)await executeSchedule(s)}finally{schedulerBusy=false}}

function schedulePayload(schedule){const c=state.customers.find(x=>x.id===schedule.customerId),t=state.templates.find(x=>x.id===schedule.templateId);if(!c||!t)throw new Error('Không tìm thấy khách hoặc mẫu tin');return {clientId:schedule.id,customerId:c.id,name:c.name,phone:internationalPhone(c.phone),zaloStatus:c.zaloStatus,channel:schedule.channel,sendAt:new Date(schedule.sendAt).toISOString(),message:compileTemplate(t.text,c),zbsTemplateId:t.zbsTemplateId||'',zbsTemplateData:t.zbsTemplateId?compileZbsData(t,c):{},smsFallback:!!state.settings.smsFallback}}
async function pushScheduleToBackend(schedule){if(state.settings.offlineOnly){schedule.lastError='Chế độ riêng tư: lịch chỉ lưu trên thiết bị';save();return false}try{const data=await postJson(apiUrl('/api/schedules'),schedulePayload(schedule));schedule.serverId=data.id||data.schedule?.id||schedule.serverId;schedule.lastError='';save();return true}catch(err){schedule.lastError=`Chưa đồng bộ server: ${err.data?.message||err.message}`;save();return false}}
async function syncSchedulesFromBackend({quiet=false}={}){if(state.settings.offlineOnly){if(!quiet)toast('🔒 Chế độ riêng tư đang bật – không đồng bộ server');return}if(!apiBase()){if(!quiet)toast('Chưa kết nối backend');return}try{const data=await fetchJson(apiUrl('/api/schedules'));const list=Array.isArray(data.schedules)?data.schedules:[];for(const local of state.schedules){if(!local.serverId)continue;const remote=list.find(r=>r.id===local.serverId);if(!remote)continue;local.status=remote.status||local.status;local.lastError=remote.lastError||'';local.sentAt=remote.sentAt||local.sentAt;local.sentChannel=remote.sentChannel||local.sentChannel}save();if(!quiet)toast('Đã đồng bộ trạng thái lịch')}catch(err){if(!quiet)toast(`Không đồng bộ được: ${err.message}`)}}
async function cancelSchedule(schedule){schedule.status='cancelled';if(schedule.serverId&&apiBase()){try{await fetchJson(apiUrl(`/api/schedules/${encodeURIComponent(schedule.serverId)}`),{method:'DELETE'})}catch{}}save();toast('Đã hủy lịch')}

function updateOfflineOnlyUI(previewValue){const toggle=$('#offlineOnlyToggle');const on=typeof previewValue==='boolean'?previewValue:(toggle?!!toggle.checked:!!state.settings.offlineOnly),el=$('#offlineOnlyState'),card=$('#aippPrivacyCard');if(el){el.textContent=on?'🔒 RIÊNG TƯ ĐANG BẬT — API/backend và đồng bộ mạng bị khóa':'🌐 KẾT NỐI MẠNG ĐANG BẬT — API/backend được phép hoạt động';el.className='aipp-privacy-state '+(on?'good':'bad')}if(card){card.classList.toggle('privacy-on',on);card.classList.toggle('privacy-off',!on)}const ids=['#testApiBtn','#syncSchedulesBtn'];ids.forEach(id=>{const b=$(id);if(b){b.disabled=on;b.title=on?'Đang bật Chế độ riêng tư':''}})}

function saveSettings(){state.settings.showSourceInfo=$('#showSourceInfoToggle').checked;state.settings.offlineOnly=!!$('#offlineOnlyToggle')?.checked;state.settings.autoSendEnabled=$('#autoSendToggle').checked;state.settings.smsFallback=$('#smsFallbackToggle').checked;state.settings.backendBaseUrl=$('#backendBaseUrl').value.trim().replace(/\/$/,'');state.settings.backendApiKey=$('#backendApiKey').value.trim();save();updateOfflineOnlyUI();toast(state.settings.offlineOnly?'🔒 Đã bật Chế độ riêng tư':'Đã lưu cài đặt');if(!state.settings.offlineOnly&&state.settings.autoSendEnabled&&apiBase()){for(const s of state.schedules.filter(x=>x.status==='scheduled'&&!x.serverId))pushScheduleToBackend(s)}processDueSchedules()}

$('#todayText').textContent=new Date().toLocaleDateString('vi-VN',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});
$('#agentName').value=agent()==='Nhân viên'?'':agent();$('#agentName').addEventListener('change',e=>{localStorage.setItem(AGENT_KEY,e.target.value.trim()||'Nhân viên');toast('Đã lưu tên nhân viên')});
$$('.nav-btn').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));$('#addCustomerBtn').addEventListener('click',()=>openCustomerDialog());
$('#customerForm').addEventListener('submit',e=>{e.preventDefault();if(saveCustomer())$('#customerDialog').close()});$('#templateForm').addEventListener('submit',e=>{e.preventDefault();if(saveTemplate())$('#templateDialog').close()});$('#scheduleForm').addEventListener('submit',async e=>{e.preventDefault();if(await saveSchedule())$('#scheduleDialog').close()});
$('#addTemplateBtn').addEventListener('click',()=>openTemplateDialog());$('#addScheduleBtn').addEventListener('click',()=>openScheduleDialog());$('#globalSearch').addEventListener('input',()=>{showView('customers');renderCustomers()});$('#statusFilter').addEventListener('change',renderCustomers);$('#sourceFilter').addEventListener('change',renderCustomers);$('#nextCustomerBtn').addEventListener('click',nextCustomer);$('#scheduleStatusFilter').addEventListener('change',renderSchedules);$('#scheduleCustomerInput').addEventListener('change',updateSchedulePreview);$('#scheduleTemplateInput').addEventListener('change',updateSchedulePreview);$('#saveSettingsBtn').addEventListener('click',saveSettings);$('#offlineOnlyToggle')?.addEventListener('change',e=>updateOfflineOnlyUI(!!e.target.checked));$('#testApiBtn').addEventListener('click',testBackend);$('#syncSchedulesBtn').addEventListener('click',()=>syncSchedulesFromBackend());
$$('dialog').forEach(d=>{d.addEventListener('click',e=>{if(e.target===d)d.close()});d.addEventListener('cancel',()=>{})});

document.addEventListener('click',async e=>{
  const close=e.target.closest('[data-close-dialog]');if(close){document.getElementById(close.dataset.closeDialog)?.close();return}
  const row=e.target.closest('[data-customer-id]');if(row){selectedCustomerId=row.dataset.customerId;renderCustomers();renderDetail();return}
  const li=e.target.closest('[data-open-customer]');if(li){selectedCustomerId=li.dataset.openCustomer;showView('customers');renderAll();return}
  if(e.target.closest('[data-open-schedule]')){showView('automation');renderSchedules();return}
  const el=e.target.closest('button');if(!el)return;
  if(el.dataset.edit)openCustomerDialog(el.dataset.edit);
  if(el.dataset.status){const c=state.customers.find(x=>x.id===el.dataset.id);if(c){c.status=el.dataset.status;c.updatedAt=new Date().toISOString();if(c.status==='Hẹn gọi lại'&&!c.followup)c.followup=nextLocalDate(1,9,0);save();toast('Đã cập nhật trạng thái')}}
  if(el.dataset.zaloState){const c=state.customers.find(x=>x.id===el.dataset.id);if(c){c.zaloStatus=el.dataset.zaloState;save();toast('Đã cập nhật trạng thái Zalo')}}
  if(el.dataset.copyTemplate)await createMessage(el.dataset.copyTemplate);
  if(el.dataset.checkZalo){const c=state.customers.find(x=>x.id===el.dataset.checkZalo);if(c)await checkZaloAvailability(c)}
  if(el.dataset.scheduleCustomer)openScheduleDialog(el.dataset.scheduleCustomer);
  /* customer delete handled by PHUC.PINK V5.3 undo-delete handler */
  if(el.dataset.editTemplate)openTemplateDialog(el.dataset.editTemplate);
  if(el.dataset.deleteTemplate&&confirm('Xóa mẫu tin này?')){state.templates=state.templates.filter(x=>x.id!==el.dataset.deleteTemplate);state.schedules=state.schedules.filter(x=>x.templateId!==el.dataset.deleteTemplate);save()}
  if(el.dataset.cancelSchedule){const s=state.schedules.find(x=>x.id===el.dataset.cancelSchedule);if(s)await cancelSchedule(s)}
  if(el.dataset.runSchedule){const s=state.schedules.find(x=>x.id===el.dataset.runSchedule);if(s)await executeSchedule(s,{force:true})}
  if(el.dataset.sendManual){const s=state.schedules.find(x=>x.id===el.dataset.sendManual);if(s)openManualSchedule(s)}
});

$('#exportBtn').addEventListener('click',()=>{
  const name=`AIPP-backup-${new Date().toISOString().slice(0,10)}.json`, payload=JSON.stringify(state,null,2);
  try{if(window.AippAndroid&&typeof AippAndroid.exportBackup==='function'){AippAndroid.exportBackup(name,payload);return;}}catch(e){console.error(e)}
  const blob=new Blob([payload],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
});
// Import khách được xử lý duy nhất bởi AIPP Excel V4 ở phần dưới. Backup JSON dùng mục Khôi phục riêng.

const previewLikely=location.protocol==='file:'||/Acode|; wv\)/i.test(navigator.userAgent);if(previewLikely)$('#browserNotice').classList.remove('hidden');$('#dismissBrowserNotice').addEventListener('click',()=>$('#browserNotice').classList.add('hidden'));
// AIPP V11: service worker registration disabled to prevent stale import code cache.
renderAll();processDueSchedules();if(apiBase())testBackend();setInterval(processDueSchedules,30000);setInterval(()=>{renderStats();renderDueMessages();renderSchedules();if(apiBase())syncSchedulesFromBackend({quiet:true})},45000);


/* =========================================================
   PHUC.PINK V5 SETTINGS EXTENSION
   Giao diện + bật/tắt chức năng + hồ sơ + checklist
   Không thay telHref / zaloHref / smsHref
   ========================================================= */
(() => {
  const profileDefs = [
    ['occupation','Nghề nghiệp','text'],['income','Thu nhập','text'],['company','Công ty','text'],
    ['area','Khu vực','text'],['loanAmount','Khoản cần vay','text'],['salaryDay','Ngày nhận lương','number']
  ];
  const featureDefs = [
    ['showSourceInfo','Hiển thị nguồn khách'],['showCall','Hiển thị Gọi'],['showZalo','Hiển thị Zalo'],
    ['showSms','Hiển thị SMS'],['showFollowups','Hiển thị Gọi lại'],['showAutomation','Hiển thị Tự động'],
    ['showTemplates','Hiển thị Mẫu tin'],['showDueMessages','Tin nhắn đến lịch'],['showHotCustomers','Khách tiềm năng']
  ];
  const defaults = {
    colorMode:'system',themeStyle:'soft-pink',density:'comfortable',fontSize:'normal',showCall:true,showZalo:true,showSms:true,
    showFollowups:true,showAutomation:true,showTemplates:true,showDueMessages:true,showHotCustomers:true,
    profileFields:Object.fromEntries(profileDefs.map(([k])=>[k,true])),customFields:[],
    documentTypes:[
      {id:'cccd',name:'CCCD',enabled:true},{id:'bank_statement',name:'Sao kê',enabled:true},
      {id:'labor_contract',name:'HĐLĐ',enabled:true},{id:'payslip',name:'Bảng lương',enabled:true},
      {id:'other_docs',name:'Hồ sơ khác',enabled:true}
    ]
  };
  state.settings={...defaults,...state.settings,profileFields:{...defaults.profileFields,...(state.settings.profileFields||{})},customFields:Array.isArray(state.settings.customFields)?state.settings.customFields:[],documentTypes:Array.isArray(state.settings.documentTypes)&&state.settings.documentTypes.length?state.settings.documentTypes:defaults.documentTypes};
  state.customers.forEach(c=>{c.profile=c.profile||{};c.customFields=c.customFields||{};c.documents=c.documents||{};});
  save({render:false});

  const originalRenderSettings=renderSettings;
  renderSettings=function(){
    originalRenderSettings();
    const st=state.settings;
    $('#colorModeSelect').value=st.colorMode||'system'; $('#themeStyleSelect').value=st.themeStyle||'soft-pink'; $('#densitySelect').value=(st.density==='dense'?'compact':(st.density||'comfortable')); $('#fontSizeSelect').value=st.fontSize||'normal';
    $('#featureToggleList').innerHTML=featureDefs.map(([k,label])=>`<label class="setting-check"><span>${esc(label)}</span><input type="checkbox" data-feature="${k}" ${st[k]?'checked':''}></label>`).join('');
    $('#profileFieldList').innerHTML=profileDefs.map(([k,label])=>`<label class="setting-check"><span>${esc(label)}</span><input type="checkbox" data-profile-field="${k}" ${st.profileFields[k]?'checked':''}></label>`).join('');
    $('#customFieldList').innerHTML=st.customFields.length?st.customFields.map(f=>`<div class="setting-check"><label><input type="checkbox" data-custom-toggle="${f.id}" ${f.enabled?'checked':''}> <span>✚ ${esc(f.name)}</span></label><button type="button" class="icon-danger" data-custom-delete="${f.id}">×</button></div>`).join(''):'<div class="muted setting-empty">Chưa có trường tùy chỉnh.</div>';
    $('#documentTypeList').innerHTML=st.documentTypes.map(d=>`<div class="setting-check"><label><input type="checkbox" data-doc-toggle="${d.id}" ${d.enabled?'checked':''}> <span>${esc(d.name)}</span></label><button type="button" class="icon-danger" data-doc-delete="${d.id}">×</button></div>`).join('');
  };

  const originalApplySettingsUI=applySettingsUI;
  applySettingsUI=function(){
    originalApplySettingsUI(); const st=state.settings;
    document.body.dataset.theme=st.themeStyle||'soft-pink'; document.body.dataset.density=(st.density==='dense'?'compact':(st.density||'comfortable')); document.body.dataset.fontSize=st.fontSize||'normal'; document.documentElement.dataset.colorMode=st.colorMode||'system';
    const dark=st.colorMode==='dark'||(st.colorMode==='system'&&matchMedia('(prefers-color-scheme: dark)').matches); document.body.classList.toggle('pp-dark',dark);
    const navMap={followups:'showFollowups',automation:'showAutomation',templates:'showTemplates'};
    Object.entries(navMap).forEach(([v,k])=>document.querySelector(`.nav-btn[data-view="${v}"]`)?.classList.toggle('hidden-by-setting',!st[k]));
    $('#dueMessageList')?.closest('.panel')?.classList.toggle('hidden-by-setting',!st.showDueMessages);
    $('.dashboard-hot')?.classList.toggle('hidden-by-setting',!st.showHotCustomers);
    updateAddCustomerVisibility();
  };
  function updateAddCustomerVisibility(){const btn=$('#addCustomerBtn'),active=$('.nav-btn.active')?.dataset.view; if(btn)btn.style.display=active==='customers'?'':'none';}
  const ppShowView=showView;
  showView=function(name){
    const key={followups:'showFollowups',automation:'showAutomation',templates:'showTemplates'}[name]; if(key&&!state.settings[key])name='dashboard';
    ppShowView(name); updateAddCustomerVisibility();
  };

  function dynamicFormHtml(c){
    const standard=profileDefs.filter(([k])=>state.settings.profileFields[k]).map(([k,label,type])=>`<label class="field"><span>${esc(label)}</span><input data-profile-input="${k}" type="${type}" value="${esc(c?.profile?.[k]||'')}"></label>`).join('');
    const custom=state.settings.customFields.filter(f=>f.enabled).map(f=>`<label class="field"><span>${esc(f.name)}</span><input data-custom-input="${f.id}" value="${esc(c?.customFields?.[f.id]||'')}"></label>`).join('');
    return standard+custom;
  }
  const ppOpenCustomerDialog=openCustomerDialog;
  openCustomerDialog=function(id=null){ppOpenCustomerDialog(id);const c=state.customers.find(x=>x.id===id);$('#dynamicCustomerFields').innerHTML=dynamicFormHtml(c);};
  const ppSaveCustomer=saveCustomer;
  saveCustomer=function(){
    const oldId=$('#customerId').value; const profile={}; $$('[data-profile-input]').forEach(i=>profile[i.dataset.profileInput]=i.value.trim()); const custom={}; $$('[data-custom-input]').forEach(i=>custom[i.dataset.customInput]=i.value.trim());
    const ok=ppSaveCustomer(); if(!ok)return false; const id=oldId||selectedCustomerId,c=state.customers.find(x=>x.id===id); if(c){c.profile={...(c.profile||{}),...profile};c.customFields={...(c.customFields||{}),...custom};save();} return true;
  };

  const ppRenderDetail=renderDetail;
  renderDetail=function(){
    ppRenderDetail(); const c=state.customers.find(x=>x.id===selectedCustomerId); if(!c)return; const st=state.settings,panel=$('#detailPanel');
    panel.querySelector('.action-call')?.classList.toggle('hidden-by-setting',!st.showCall); panel.querySelector('.action-zalo')?.classList.toggle('hidden-by-setting',!st.showZalo); panel.querySelector('.action-sms')?.classList.toggle('hidden-by-setting',!st.showSms);
    const ca=panel.querySelector('.contact-actions'); if(ca){const visible=[st.showCall,st.showZalo,st.showSms].filter(Boolean).length;ca.style.gridTemplateColumns=`repeat(${Math.max(1,visible)},1fr)`;}
    const info=[...profileDefs.filter(([k])=>st.profileFields[k]).map(([k,label])=>[label,c.profile?.[k]]),...st.customFields.filter(f=>f.enabled).map(f=>[f.name,c.customFields?.[f.id]])];
    const docs=st.documentTypes.filter(d=>d.enabled);
    const extra=document.createElement('div'); extra.className='pp-extra-profile'; extra.innerHTML=`${info.length?`<div class="pp-profile-grid">${info.map(([l,v])=>`<div class="detail-card"><span>${esc(l)}</span><strong>${esc(v||'—')}</strong></div>`).join('')}</div>`:''}${docs.length?`<div class="pp-checklist"><div class="section-label">📄 Checklist hồ sơ</div>${docs.map(d=>`<label class="doc-check"><input type="checkbox" data-customer-doc="${d.id}" data-customer="${c.id}" ${c.documents?.[d.id]?'checked':''}><span>${esc(d.name)}</span></label>`).join('')}</div>`:''}`;
    panel.querySelector('.note-box')?.insertAdjacentElement('beforebegin',extra);
  };

  function persistUiSettings(){
    state.settings.colorMode=$('#colorModeSelect').value;state.settings.themeStyle=$('#themeStyleSelect').value;state.settings.density=$('#densitySelect').value;state.settings.fontSize=$('#fontSizeSelect').value;
    $$('[data-feature]').forEach(i=>state.settings[i.dataset.feature]=i.checked); state.settings.showSourceInfo=!!state.settings.showSourceInfo;
    $$('[data-profile-field]').forEach(i=>state.settings.profileFields[i.dataset.profileField]=i.checked); save(); toast('Đã lưu tùy chỉnh');
  }
  $('#settingsView').addEventListener('change',e=>{
    const t=e.target;
    if(t.matches('#colorModeSelect,#themeStyleSelect,#densitySelect,#fontSizeSelect,[data-feature],[data-profile-field]')){persistUiSettings();return;}
    if(t.dataset.customToggle){const f=state.settings.customFields.find(x=>x.id===t.dataset.customToggle);if(f){f.enabled=t.checked;save();}}
    if(t.dataset.docToggle){const d=state.settings.documentTypes.find(x=>x.id===t.dataset.docToggle);if(d){d.enabled=t.checked;save();}}
  });
  $('#settingsView').addEventListener('click',e=>{
    const addF=e.target.closest('#addCustomFieldBtn'); if(addF){const name=prompt('Tên trường tùy chỉnh:');if(name?.trim()){state.settings.customFields.push({id:'cf_'+Date.now(),name:name.trim(),enabled:true});save();}return;}
    const addD=e.target.closest('#addDocumentTypeBtn'); if(addD){const name=prompt('Tên loại giấy tờ:');if(name?.trim()){state.settings.documentTypes.push({id:'doc_'+Date.now(),name:name.trim(),enabled:true});save();}return;}
    const delF=e.target.closest('[data-custom-delete]');if(delF&&confirm('Xóa trường tùy chỉnh này?')){state.settings.customFields=state.settings.customFields.filter(x=>x.id!==delF.dataset.customDelete);save();return;}
    const delD=e.target.closest('[data-doc-delete]');if(delD&&confirm('Xóa loại giấy tờ này?')){state.settings.documentTypes=state.settings.documentTypes.filter(x=>x.id!==delD.dataset.docDelete);save();return;}
  });
  document.addEventListener('change',e=>{const t=e.target;if(t.dataset.customerDoc){const c=state.customers.find(x=>x.id===t.dataset.customer);if(c){c.documents=c.documents||{};c.documents[t.dataset.customerDoc]=t.checked;save({render:false});toast(t.checked?'Đã đánh dấu hồ sơ':'Đã bỏ đánh dấu');}}});
  $('#saveSettingsBtn').addEventListener('click',()=>{persistUiSettings();});
  if(window.matchMedia){matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(state.settings.colorMode==='system')applySettingsUI();});}
  renderAll(); updateAddCustomerVisibility();
})();

/* =========================================================
   PHUC.PINK V5.1 - AUTOMATION + DELETE SCHEDULE FIX
   ========================================================= */
(() => {
  const oldRenderSchedulesV51 = renderSchedules;
  renderSchedules = function(){
    oldRenderSchedulesV51();
    const list=$('#scheduleList'); if(!list)return;
    const rows=[...list.querySelectorAll('.schedule-row')];
    const filter=$('#scheduleStatusFilter')?.value||'';
    const schedules=[...state.schedules].filter(s=>!filter||s.status===filter).sort((x,y)=>new Date(x.sendAt)-new Date(y.sendAt));
    rows.forEach((row,i)=>{
      const s=schedules[i]; if(!s)return;
      const actions=row.querySelector('.schedule-actions')||row.querySelector('.schedule-side');
      if(actions&&!actions.querySelector('[data-delete-schedule]')){
        const b=document.createElement('button');b.type='button';b.className='danger small schedule-delete';b.dataset.deleteSchedule=s.id;b.textContent='🗑 Xóa';actions.appendChild(b);
      }
    });
    const view=$('#automationView');
    let note=view?.querySelector('.automation-state-note');
    if(view&&!note){note=document.createElement('div');note.className='automation-state-note';view.querySelector('.automation-toolbar')?.insertAdjacentElement('afterend',note);}
    if(note && !window.AippAndroid){
      const connected=!!apiBase();
      note.classList.toggle('good',connected&&state.settings.autoSendEnabled);
      note.textContent=!state.settings.autoSendEnabled?'⏸ Tự động đang tắt. Bật “Tự động xử lý lịch gửi” trong Cài đặt.':!connected?'⚠ Chưa kết nối Backend V3: lịch đến giờ chỉ có thể chuyển sang gửi thủ công. Muốn tự gửi thật khi đóng app cần kết nối backend/API.':'✓ Tự động đang bật và có địa chỉ backend. Lịch sẽ được đồng bộ để backend xử lý khi được cấu hình đúng.';
    }
  };

  async function deleteSchedulePermanently(id){
    const s=state.schedules.find(x=>x.id===id);if(!s)return;
    if(!confirm('Xóa hẳn lịch gửi này? Thao tác này không thể hoàn tác.'))return;
    if(s.serverId&&apiBase()){try{await fetchJson(apiUrl(`/api/schedules/${encodeURIComponent(s.serverId)}`),{method:'DELETE'})}catch(err){console.warn('Không xóa được lịch trên server:',err)}}
    state.schedules=state.schedules.filter(x=>x.id!==id);save();toast('Đã xóa hẳn lịch gửi');
  }
  /* schedule delete handled by PHUC.PINK V5.3 undo-delete handler */

  // Xử lý lịch ngay khi app trở lại màn hình và kiểm tra thường xuyên hơn khi app đang mở.
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){processDueSchedules();if(apiBase())syncSchedulesFromBackend({quiet:true});}});
  window.addEventListener('focus',()=>processDueSchedules());
  setInterval(processDueSchedules,10000);
  renderSchedules();
})();

/* =========================================================
   PHUC.PINK V5.2 - MOBILE UX + RELIABLE DELETE
   ========================================================= */
(() => {
  // V5.3: one reliable delete path for Android WebView + undo snackbar.
  let undoDelete=null;
  let undoTimer=null;

  function showUndoDelete(message, restoreFn){
    const el=$('#toast');
    clearTimeout(toast._t); clearTimeout(undoTimer);
    undoDelete=restoreFn;
    el.innerHTML=`<span>${esc(message)}</span><button type="button" class="toast-undo" data-undo-delete>HOÀN TÁC</button>`;
    el.classList.add('show','toast-with-action');
    undoTimer=setTimeout(()=>{
      undoDelete=null;
      el.classList.remove('show','toast-with-action');
      el.textContent='';
    },6000);
  }

  async function deleteScheduleWithUndo(id){
    const index=state.schedules.findIndex(x=>x.id===id); if(index<0)return;
    const removed=structuredClone(state.schedules[index]);
    state.schedules.splice(index,1);
    save();
    showUndoDelete('Đã xóa lịch gửi.',()=>{
      state.schedules.splice(Math.min(index,state.schedules.length),0,removed);
      save(); toast('Đã hoàn tác xóa lịch');
    });
    // Server cleanup is best-effort. Local delete must never be blocked by backend/WebView.
    if(removed.serverId&&apiBase()){
      try{await fetchJson(apiUrl(`/api/schedules/${encodeURIComponent(removed.serverId)}`),{method:'DELETE'});}catch(err){console.warn('Không xóa được lịch trên server:',err);}
    }
  }

  function deleteCustomerWithUndo(id){
    const index=state.customers.findIndex(x=>x.id===id); if(index<0)return;
    const removedCustomer=structuredClone(state.customers[index]);
    const removedSchedules=state.schedules.filter(x=>x.customerId===id).map(x=>structuredClone(x));
    state.customers.splice(index,1);
    state.schedules=state.schedules.filter(x=>x.customerId!==id);
    selectedCustomerId=state.customers[Math.min(index,state.customers.length-1)]?.id||state.customers[0]?.id||null;
    save();
    showUndoDelete(`Đã xóa khách ${removedCustomer.name}.`,()=>{
      state.customers.splice(Math.min(index,state.customers.length),0,removedCustomer);
      const ids=new Set(state.schedules.map(x=>x.id));
      removedSchedules.forEach(x=>{if(!ids.has(x.id))state.schedules.push(x)});
      selectedCustomerId=removedCustomer.id;
      save(); toast('Đã hoàn tác xóa khách');
    });
  }

  document.addEventListener('click', async (e) => {
    const undoBtn=e.target.closest('[data-undo-delete]');
    if(undoBtn){
      e.preventDefault();e.stopImmediatePropagation();
      const fn=undoDelete; undoDelete=null; clearTimeout(undoTimer);
      if(fn)fn();
      return;
    }
    const scheduleBtn=e.target.closest('[data-delete-schedule]');
    if(scheduleBtn){
      e.preventDefault();e.stopImmediatePropagation();
      await deleteScheduleWithUndo(scheduleBtn.dataset.deleteSchedule);
      return;
    }
    const customerBtn=e.target.closest('button[data-delete]');
    if(customerBtn && !customerBtn.hasAttribute('data-delete-template')){
      e.preventDefault();e.stopImmediatePropagation();
      deleteCustomerWithUndo(customerBtn.dataset.delete);
      return;
    }
  }, true);

  // On phones, selecting a customer moves naturally to the detail card below the list.
  document.addEventListener('click',(e)=>{
    const row=e.target.closest('[data-customer-id],[data-open-customer]');
    if(!row || window.innerWidth>920)return;
    setTimeout(()=>{
      const panel=$('#detailPanel');
      if(panel && selectedCustomerId) panel.scrollIntoView({behavior:'smooth',block:'start'});
    },80);
  });

  // Mobile helper actions matching the compact Phuc.Pink layout.
  function ensureMobileCustomerTools(){
    const top=$('.top-actions'); if(!top || $('#ppMobileTools'))return;
    const tools=document.createElement('div');tools.id='ppMobileTools';tools.className='pp-mobile-tools';
    tools.innerHTML=`<button type="button" class="secondary" id="ppImportBtn">📥 Nhập</button><button type="button" class="secondary" id="ppPasteBtn">📋 Dán</button>`;
    top.appendChild(tools);
    $('#ppImportBtn').onclick=(e)=>{e.preventDefault();try{if(window.AippAndroid&&typeof AippAndroid.openImportPicker==='function'){AippAndroid.openImportPicker();return}}catch(_){}$('#importInput')?.click()};
    // V5.4.8: Dán được xử lý bởi một module duy nhất ở phần dưới.

  }
  ensureMobileCustomerTools();

  // Keep mobile header/controls in sync after navigation/render.
  const v52ShowView=showView;
  showView=function(name){v52ShowView(name);document.body.dataset.currentView=name;ensureMobileCustomerTools();};
  document.body.dataset.currentView=$('.nav-btn.active')?.dataset.view||'dashboard';
})();

/* ===== PHUC.PINK V6 - CRM WORKFLOW ===== */
(()=>{
  const LEVELS=['Nóng','Quan tâm','Lạnh','Không nhu cầu'];
  const levelIcon=v=>({'Nóng':'🔥','Quan tâm':'⭐','Lạnh':'❄️','Không nhu cầu':'🚫'})[v]||'⭐';
  const getC=id=>state.customers.find(x=>x.id===id);
  function ensureCRMData(){
    state.customers.forEach(c=>{c.timeline=Array.isArray(c.timeline)?c.timeline:[];c.level=c.level||((c.status==='Tiềm năng')?'Nóng':(c.status==='Không nhu cầu'?'Không nhu cầu':'Quan tâm'));});
    state.settings.reportRange=state.settings.reportRange||'day';
  }
  ensureCRMData(); localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  function logEvent(c,type,title,detail=''){
    if(!c)return;c.timeline=Array.isArray(c.timeline)?c.timeline:[];
    c.timeline.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),type,title,detail});
    c.updatedAt=new Date().toISOString();
  }
  function timelineHtml(c){const a=(c.timeline||[]).slice(0,40);return `<section class="pp-timeline"><div class="pp-section-title pp-log-head"><span>🕘 Nhật ký chăm sóc <b>${a.length}</b></span>${a.length?`<button type="button" class="secondary pp-reset-log" data-reset-timeline="${c.id}">🗑 Xóa nhật ký</button>`:''}</div>${a.length?`<div class="pp-timeline-list">${a.map(e=>`<div class="pp-time-row"><div class="pp-time-dot">${e.type==='call'?'📞':e.type==='zalo'?'💬':e.type==='sms'?'✉️':e.type==='followup'?'⏰':'📝'}</div><div><strong>${esc(e.title)}</strong><small>${fmtDate(e.at)}</small>${e.detail?`<p>${esc(e.detail)}</p>`:''}</div></div>`).join('')}</div>`:'<div class="muted pp-empty-small">Chưa có hoạt động chăm sóc.</div>'}<div class="pp-log-note"><input id="ppQuickNote" placeholder="Ghi chú nhanh cho khách này..."><button class="secondary" data-add-log-note="${c.id}">+ Ghi chú</button></div></section>`}
  const oldDetail=renderDetail;
  renderDetail=function(){oldDetail();const c=getC(selectedCustomerId),p=$('#detailPanel');if(!c||!p)return;
    const sum=p.querySelector('.customer-summary');if(sum&&!p.querySelector('.pp-level-select')){const box=document.createElement('div');box.className='pp-level-select';box.innerHTML=`<span>Mức độ</span><select data-customer-level="${c.id}">${LEVELS.map(v=>`<option ${c.level===v?'selected':''}>${v}</option>`).join('')}</select>`;sum.after(box)}
    const foot=p.querySelector('.customer-foot-actions');if(foot&&!p.querySelector('.pp-timeline'))foot.insertAdjacentHTML('beforebegin',timelineHtml(c));
  };
  const oldSaveCustomer=saveCustomer;
  saveCustomer=function(){
    const phone=normalizePhone($('#phoneInput').value),id=$('#customerId').value;const dup=state.customers.find(c=>normalizePhone(c.phone)===phone&&c.id!==id);
    if(dup){selectedCustomerId=dup.id;showView('customers');renderAll();toast(`SĐT đã tồn tại: ${dup.name}. Đã mở khách hiện có.`,4200);return false}
    const old=id?structuredClone(getC(id)):null;const ok=oldSaveCustomer();if(ok){const c=getC(selectedCustomerId);ensureCRMData();if(c){if(!old)logEvent(c,'note','Tạo khách hàng','Khách mới được thêm vào hệ thống');else if((old.note||'')!==(c.note||''))logEvent(c,'note','Cập nhật ghi chú',c.note||'Đã xóa nội dung ghi chú');if((old?.followup||'')!==(c.followup||'')&&c.followup)logEvent(c,'followup','Hẹn lần tiếp theo',fmtDate(c.followup));localStorage.setItem(STORAGE_KEY,JSON.stringify(state));renderDetail();}}return ok;
  };
  // Log contact taps without changing the proven Android intents.
  document.addEventListener('click',e=>{const a=e.target.closest('.action-call,.action-zalo,.action-sms');if(!a)return;const c=getC(selectedCustomerId);if(!c)return;const type=a.classList.contains('action-call')?'call':a.classList.contains('action-zalo')?'zalo':'sms';logEvent(c,type,type==='call'?'Bắt đầu cuộc gọi':type==='zalo'?'Mở Zalo':'Mở SMS');localStorage.setItem(STORAGE_KEY,JSON.stringify(state));},true);
  document.addEventListener('change',e=>{const s=e.target.closest('[data-customer-level]');if(!s)return;const c=getC(s.dataset.customerLevel);if(c){c.level=s.value;logEvent(c,'note','Đổi mức độ khách',s.value);save();toast(`Đã chuyển thành ${s.value}`)}});
  document.addEventListener('click',e=>{const b=e.target.closest('[data-add-log-note]');if(!b)return;const c=getC(b.dataset.addLogNote),i=$('#ppQuickNote');if(c&&i?.value.trim()){logEvent(c,'note','Ghi chú chăm sóc',i.value.trim());save();toast('Đã thêm vào nhật ký')}});
  // Record call outcomes/status and follow-up changes after the original handler has run.
  document.addEventListener('click',e=>{const b=e.target.closest('button[data-status]');if(!b)return;setTimeout(()=>{const c=getC(b.dataset.id);if(c){logEvent(c,'call','Kết quả cuộc gọi',b.dataset.status);if(b.dataset.status==='Không nhu cầu')c.level='Không nhu cầu';localStorage.setItem(STORAGE_KEY,JSON.stringify(state));renderDetail();}},20)});
  // Smart next actions on dashboard.
  renderTodos=function(){const a=state.customers.filter(x=>x.followup&&(isToday(x.followup)||isOverdue(x.followup))).sort((x,y)=>new Date(x.followup)-new Date(y.followup));$('#todoCount').textContent=a.length;$('#todoList').innerHTML=a.length?a.slice(0,12).map(c=>{const msg=firstTemplateMessage(c);return `<div class="pp-todo"><div class="pp-todo-head" data-open-customer="${c.id}"><strong>${levelIcon(c.level)} ${esc(c.name)}</strong><span class="${isOverdue(c.followup)?'overdue':''}">${fmtDate(c.followup)}</span></div><div class="pp-todo-actions"><a href="${esc(telHref(c.phone))}" data-log-contact="call" data-log-id="${c.id}">📞 Gọi</a><a href="${esc(zaloHref(c.phone))}" data-log-contact="zalo" data-log-id="${c.id}">💬 Zalo</a><button data-smart-reschedule="${c.id}">⏰ Hẹn lại</button><button data-smart-done="${c.id}">✓ Xong</button></div></div>`}).join(''):'<div class="muted">Không có lịch cần xử lý.</div>'};
  document.addEventListener('click',e=>{const a=e.target.closest('[data-log-contact]');if(a){const c=getC(a.dataset.logId);if(c){logEvent(c,a.dataset.logContact,a.dataset.logContact==='call'?'Gọi từ Tổng quan':'Mở Zalo từ Tổng quan');localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}}const r=e.target.closest('[data-smart-reschedule]');if(r){const c=getC(r.dataset.smartReschedule);if(c){const raw=prompt('Hẹn lại (YYYY-MM-DD HH:MM):',toLocalInput(new Date(Date.now()+86400000)).replace('T',' '));if(raw){c.followup=raw.trim().replace(' ','T');c.status='Hẹn gọi lại';logEvent(c,'followup','Hẹn lại',fmtDate(c.followup));save();toast('Đã hẹn lại')}}}const d=e.target.closest('[data-smart-done]');if(d){const c=getC(d.dataset.smartDone);if(c){c.followup='';c.status='Hoàn tất';logEvent(c,'note','Hoàn tất xử lý');save();toast('Đã đánh dấu hoàn tất')}}});
  // Advanced customer filters.
  function ensureAdvancedFilters(){const f=$('#customersView .filters');if(!f||$('#ppLevelFilter'))return;f.insertAdjacentHTML('beforeend',`<select id="ppLevelFilter"><option value="">Tất cả mức độ</option>${LEVELS.map(x=>`<option>${x}</option>`).join('')}</select><select id="ppTimeFilter"><option value="">Mọi lịch hẹn</option><option value="overdue">Quá hạn</option><option value="today">Hôm nay</option><option value="uncalled">Chưa gọi</option><option value="potential">Tiềm năng</option></select>`);$('#ppLevelFilter').onchange=renderCustomers;$('#ppTimeFilter').onchange=renderCustomers}
  ensureAdvancedFilters();
  const oldCustomers=renderCustomers;
  renderCustomers=function(){oldCustomers();const lv=$('#ppLevelFilter')?.value||'',tf=$('#ppTimeFilter')?.value||'';$$('#customerList .customer-row').forEach(row=>{const c=getC(row.dataset.customerId);if(!c)return;let ok=!lv||c.level===lv;if(tf==='overdue')ok=ok&&isOverdue(c.followup);if(tf==='today')ok=ok&&isToday(c.followup);if(tf==='uncalled')ok=ok&&c.status==='Chưa gọi';if(tf==='potential')ok=ok&&['Tiềm năng'].includes(c.status);row.classList.toggle('hidden-by-setting',!ok)});};
  // Reports: day/week/month, derived from customer timeline + current customer state.
  function rangeStart(kind){const d=new Date();d.setHours(0,0,0,0);if(kind==='week'){const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day)}else if(kind==='month')d.setDate(1);return d}
  function renderReport(){const el=$('#ppReport');if(!el)return;const kind=$('#ppReportRange')?.value||state.settings.reportRange||'day',start=rangeStart(kind);let calls=0,heard=0,noAnswer=0;state.customers.forEach(c=>(c.timeline||[]).forEach(e=>{if(new Date(e.at)>=start){if(e.type==='call'&&(e.title==='Bắt đầu cuộc gọi'||e.title==='Kết quả cuộc gọi'))calls++;if(e.title==='Kết quả cuộc gọi'&&['Đang tư vấn','Tiềm năng','Hẹn gọi lại','Hoàn tất'].includes(e.detail))heard++;if(e.title==='Kết quả cuộc gọi'&&e.detail==='Không nghe')noAnswer++;}}));const pot=state.customers.filter(c=>c.status==='Tiềm năng').length,re=state.customers.filter(c=>c.status==='Hẹn gọi lại').length,done=state.customers.filter(c=>c.status==='Hoàn tất').length;el.querySelector('.pp-report-grid').innerHTML=[['📞','Đã gọi',calls],['👂','Nghe máy',heard],['📵','Không nghe',noAnswer],['🔥','Tiềm năng',pot],['⏰','Hẹn lại',re],['✅','Hoàn tất',done]].map(x=>`<div><span>${x[0]} ${x[1]}</span><strong>${x[2]}</strong></div>`).join('')}
  function ensureReport(){const dash=$('#dashboardView');if(!dash||$('#ppReport'))return;dash.insertAdjacentHTML('beforeend',`<section class="panel pp-report" id="ppReport"><div class="panel-head"><h3>📊 Báo cáo telesale</h3><select id="ppReportRange"><option value="day">Hôm nay</option><option value="week">Tuần này</option><option value="month">Tháng này</option></select></div><div class="pp-report-grid"></div></section>`);$('#ppReportRange').value=state.settings.reportRange||'day';$('#ppReportRange').onchange=e=>{state.settings.reportRange=e.target.value;localStorage.setItem(STORAGE_KEY,JSON.stringify(state));renderReport()};renderReport()}
  ensureReport();
  // Backup / restore entry in Settings.
  function ensureBackup(){const v=$('#settingsView');if(!v||$('#ppBackupCard'))return;v.insertAdjacentHTML('beforeend',`<section class="panel pp-backup" id="ppBackupCard"><h3>💾 Sao lưu & khôi phục</h3><p class="muted">Backup toàn bộ khách, timeline, lịch gửi, mẫu tin và cài đặt.</p><div class="row-actions"><button class="secondary" id="ppBackupNow">Tạo backup</button><button class="secondary" id="ppRestoreBackup">Khôi phục file</button></div><input type="file" id="ppRestoreInput" accept="application/json" hidden></section>`);$('#ppBackupNow').onclick=()=>$('#exportBtn').click();$('#ppRestoreBackup').onclick=()=>$('#ppRestoreInput').click();$('#ppRestoreInput').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const j=migrateState(JSON.parse(r.result));if(!j.customers)throw 0;state=j;ensureCRMData();selectedCustomerId=state.customers[0]?.id||null;save();toast('Đã khôi phục backup thành công')}catch{toast('Backup không hợp lệ')}};r.readAsText(f)};}
  ensureBackup();
  // Excel/CSV import is handled by AIPP V12 single import module below.
  // Refresh injected pieces after normal render.
  const oldAll=renderAll;renderAll=function(){ensureCRMData();oldAll();ensureAdvancedFilters();ensureReport();renderReport();ensureBackup();};renderAll();
})();


/* ===== AIPP PROFESSIONAL UI v6.2 ===== */
(()=>{
  const DASH_DEFAULTS={
    total:true,need:true,potential:true,zaloUnknown:true,due:true,
    todos:true,dueMessages:true,hot:true,report:true
  };
  function ensureAippPro(){
    state.settings=state.settings||{};
    state.settings.dashboardVisible={...DASH_DEFAULTS,...(state.settings.dashboardVisible||{})};
  }
  ensureAippPro();

  const dashLabels={
    total:'👥 Tổng khách',need:'📌 Cần xử lý',potential:'🔥 Tiềm năng',
    zaloUnknown:'💬 Chưa rõ Zalo',due:'📨 Tin đến lịch',
    todos:'⚡ Việc cần làm tiếp',dueMessages:'📨 Tin nhắn đến lịch',
    hot:'🔥 Khách tiềm năng',report:'📊 Báo cáo telesale'
  };

  function renderDashboardSettingToggles(){
    const el=document.querySelector('#aippDashboardToggleList'); if(!el)return;
    ensureAippPro();
    el.innerHTML=Object.entries(dashLabels).map(([k,label])=>`
      <label class="setting-row">
        <span>${label}</span>
        <input type="checkbox" data-aipp-dash="${k}" ${state.settings.dashboardVisible[k]?'checked':''}>
      </label>`).join('');
  }

  function applyDashboardVisibility(){
    ensureAippPro();
    const d=state.settings.dashboardVisible;
    const stats=document.querySelectorAll('#statsGrid .stat');
    const keys=['total','need','potential','zaloUnknown','due'];
    stats.forEach((el,i)=>{ if(keys[i]) el.style.display=d[keys[i]]?'':'none'; });
    const todo=document.querySelector('#todoList')?.closest('.panel');
    const due=document.querySelector('#dueMessageList')?.closest('.panel');
    const hot=document.querySelector('#hotList')?.closest('.panel');
    const report=document.querySelector('#ppReport');
    if(todo)todo.style.display=d.todos?'':'none';
    if(due)due.style.display=d.dueMessages?'':'none';
    if(hot)hot.style.display=d.hot?'':'none';
    if(report)report.style.display=d.report?'':'none';
  }

  document.addEventListener('change',e=>{
    const t=e.target.closest('[data-aipp-dash]'); if(!t)return;
    ensureAippPro(); state.settings.dashboardVisible[t.dataset.aippDash]=t.checked;
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    applyDashboardVisibility();
    toast('Đã cập nhật Tổng quan');
  });

  // Sticky customer identity: remains visible while scrolling customer details.
  function installStickyCustomer(){
    const p=document.querySelector('#detailPanel'); if(!p)return;
    const c=state.customers.find(x=>x.id===selectedCustomerId);
    let sticky=p.querySelector('.aipp-sticky-customer');
    if(!c){sticky?.remove();return}
    if(!sticky){
      sticky=document.createElement('div');
      sticky.className='aipp-sticky-customer';
      p.prepend(sticky);
    }
    sticky.innerHTML=`<div><strong>👤 ${esc(c.name)}</strong><span>${esc(c.phone)}</span></div>`;
  }

  // Clear status language for scheduled messaging.
  function decorateScheduleStatus(){
    const list=document.querySelector('#scheduleList'); if(!list)return;
    list.querySelectorAll('.schedule-row').forEach(row=>{
      const pill=row.querySelector('.mini-pill'); if(!pill)return;
      const txt=pill.textContent.trim().toLowerCase();
      row.classList.toggle('aipp-sent',txt.includes('đã gửi'));
      row.classList.toggle('aipp-failed',txt.includes('lỗi')||txt.includes('thất bại'));
      row.classList.toggle('aipp-waiting',txt.includes('lên lịch')||txt.includes('chờ'));
      row.classList.toggle('aipp-cancelled',txt.includes('hủy'));
    });
  }

  const _renderAll=renderAll;
  renderAll=function(){
    ensureAippPro(); _renderAll();
    renderDashboardSettingToggles();
    applyDashboardVisibility();
    installStickyCustomer();
    decorateScheduleStatus();
  };
  const _renderDetailPro=renderDetail;
  renderDetail=function(){_renderDetailPro();installStickyCustomer();};
  const _renderSchedulesPro=renderSchedules;
  renderSchedules=function(){_renderSchedulesPro();decorateScheduleStatus();};

  // Re-render after dynamically-created report/settings blocks exist.
  setTimeout(()=>{renderDashboardSettingToggles();applyDashboardVisibility();installStickyCustomer();decorateScheduleStatus();},100);
})();


/* ===== AIPP UX FIX v6.3 ===== */
(()=>{
  const saveA=()=>localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  function addTimelineA(c,type,text){
    c.timeline=Array.isArray(c.timeline)?c.timeline:[];
    c.timeline.unshift({id:uid(),type,text,at:new Date().toISOString()});
  }
  function goCustomers(filter={}){
    showView('customers');
    const s=document.querySelector('#globalSearch'); if(s && filter.search!==undefined){s.value=filter.search; searchText=filter.search}
    if(filter.status!==undefined){statusFilter=filter.status; const el=document.querySelector('#statusFilter');if(el)el.value=filter.status}
    if(filter.hot!==undefined){const el=document.querySelector('#ppLevelFilter');if(el){el.value=filter.hot;el.dispatchEvent(new Event('change',{bubbles:true}))}}
    renderCustomers();
    setTimeout(()=>document.querySelector('#customersView')?.scrollIntoView({behavior:'smooth',block:'start'}),30);
  }

  // Dashboard cards become real drill-down controls.
  document.addEventListener('click',e=>{
    const card=e.target.closest('#statsGrid .stat'); if(!card)return;
    const cards=[...document.querySelectorAll('#statsGrid .stat')],i=cards.indexOf(card);
    if(i===0)goCustomers({});
    else if(i===1)goCustomers({status:'Hẹn gọi lại'});
    else if(i===2)goCustomers({hot:'Nóng'});
    else if(i===3)goCustomers({search:''});
    else if(i===4)showView('automation');
  });

  // Replace Android select for lead level with four direct buttons.
  function installLevelButtons(){
    const p=document.querySelector('#detailPanel'); if(!p)return;
    const c=state.customers.find(x=>x.id===selectedCustomerId); if(!c)return;
    const sel=p.querySelector('#ppLevelSelect');
    if(sel){
      const wrap=document.createElement('div'); wrap.className='aipp-level-buttons';
      [['Nóng','🔥'],['Quan tâm','❤️'],['Lạnh','❄️'],['Không nhu cầu','⛔']].forEach(([v,ic])=>{
        const b=document.createElement('button'); b.type='button'; b.dataset.aippLevel=v;
        b.className=(c.leadLevel||'Quan tâm')===v?'active':'';
        b.textContent=`${ic} ${v}`; wrap.appendChild(b);
      });
      sel.closest('.pp-level-box')?.replaceWith(wrap);
    }
    // Remove broken actions entirely.
    [...p.querySelectorAll('button,a')].forEach(el=>{
      const t=(el.textContent||'').trim().toLowerCase();
      if(t.includes('tạo/copy tin')||t.includes('tra trạng thái zalo')) el.remove();
    });
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-aipp-level]'); if(!b)return;
    const c=state.customers.find(x=>x.id===selectedCustomerId); if(!c)return;
    c.leadLevel=b.dataset.aippLevel;
    if(c.leadLevel==='Không nhu cầu')c.status='Không nhu cầu';
    addTimelineA(c,'level',`Đổi mức độ: ${c.leadLevel}`);saveA();renderAll();toast(`Đã đổi mức độ: ${c.leadLevel}`);
  });

  // Sticky identity is fixed under app header while detail is in viewport.
  function stickyFixed(){
    const p=document.querySelector('#detailPanel'), c=state.customers.find(x=>x.id===selectedCustomerId);
    if(!p||!c)return;
    let bar=document.querySelector('#aippFixedCustomer');
    if(!bar){bar=document.createElement('div');bar.id='aippFixedCustomer';bar.className='aipp-fixed-customer';document.body.appendChild(bar)}
    bar.innerHTML=`<div><b>👤 ${esc(c.name)}</b><span>${esc(c.phone)} · ${esc(c.status||'Chưa gọi')}</span></div><button type="button" data-aipp-open-customer>Chi tiết</button>`;
    const update=()=>{const r=p.getBoundingClientRect();bar.classList.toggle('show',r.top<150&&r.bottom>130&&document.querySelector('#customersView')?.classList.contains('active'))};
    update(); window.addEventListener('scroll',update,{passive:true});
  }
  document.addEventListener('click',e=>{if(e.target.closest('[data-aipp-open-customer]'))document.querySelector('#detailPanel')?.scrollIntoView({behavior:'smooth',block:'start'})});

  // AIPP V12: duplicate global file-picker handler removed (iOS-safe).

  // V5.4.9: một module Dán duy nhất, không dùng delegated click toàn trang.
  function parsePastedCustomers(raw){
    const out=[]; let invalid=0;
    const lines=String(raw||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    for(const line of lines){
      // VN mobile/landline normalized by normalizePhone. Mỗi số = một khách.
      const rx=/(?:\+?84|0)(?:[ .-]?\d){9}/g;
      const matches=[...line.matchAll(rx)];
      if(!matches.length){ invalid++; continue; }
      const valid=[];
      for(const m of matches){
        const phone=normalizePhone(m[0]);
        if(classifyPhone(phone).valid && !valid.some(x=>x.phone===phone)) valid.push({phone,m});
      }
      if(!valid.length){ invalid++; continue; }
      // Chỉ gán tên khi dòng có đúng 1 SĐT. Nhiều SĐT => mỗi khách tên '.'.
      let name='.';
      if(valid.length===1){
        const m=valid[0].m;
        const before=line.slice(0,m.index).replace(/[\s,;|:\-]+$/g,'').trim();
        const after=line.slice((m.index||0)+m[0].length).replace(/^[\s,;|:\-]+/g,'').trim();
        const candidate=(before||after).replace(/[\t,;|]+/g,' ').trim();
        if(candidate && !/(?:\+?84|0)\d{8,10}/.test(candidate.replace(/[ .-]/g,''))) name=candidate;
      }
      for(const v of valid) out.push({name:name||'.',phone:v.phone});
    }
    return {rows:out,invalid,total:out.length+invalid};
  }

  function showPasteResult(stats){
    let d=document.querySelector('#aippPasteResult');
    if(!d){ d=document.createElement('dialog'); d.id='aippPasteResult'; document.body.appendChild(d); }
    d.innerHTML=`<div class="dialog-form"><div class="dialog-head"><h3>📋 Kết quả dán</h3></div>
      <div class="pp-import-summary"><div><strong>${stats.total}</strong><span>Tổng</span></div><div><strong>${stats.added}</strong><span>Đã nhập</span></div><div><strong>${stats.dup}</strong><span>Trùng SĐT</span></div><div><strong>${stats.invalid}</strong><span>Không hợp lệ</span></div></div>
      <p class="muted">1 SĐT = 1 khách. Không có tên sẽ tự đặt là <b>.</b>${stats.source?`<br>Nguồn: <b>${esc(stats.source)}</b>`:''}</p>
      <div class="dialog-actions"><button type="button" class="primary" id="aippPasteDone">Xong</button></div></div>`;
    d.querySelector('#aippPasteDone').onclick=()=>d.close();
    try{d.showModal()}catch{d.setAttribute('open','')}
  }

  function processPasteCustomers(){
    const raw=document.querySelector('#aippPasteText')?.value||'';
    const pastedSource=(document.querySelector('#aippPasteSource')?.value||'').trim()||'Dán danh sách';
    if(!raw.trim()){ toast('Hãy dán danh sách khách trước'); return; }
    const parsed=parsePastedCustomers(raw);
    const existing=new Set(state.customers.map(c=>normalizePhone(c.phone)).filter(Boolean));
    const batchSeen=new Set(); let added=0,dup=0,firstId=null;
    for(const x of parsed.rows){
      if(existing.has(x.phone)||batchSeen.has(x.phone)){ dup++; continue; }
      batchSeen.add(x.phone); existing.add(x.phone);
      const id=(globalThis.crypto?.randomUUID?.() || ('c_'+Date.now()+'_'+Math.random().toString(36).slice(2))); if(!firstId)firstId=id;
      const now=new Date().toISOString();
      state.customers.unshift({id,name:x.name||'.',phone:x.phone,source:pastedSource,need:'',status:'Chưa gọi',zalo:'unknown',zaloStatus:'unknown',note:'',nextFollowup:'',followup:'',createdAt:now,updatedAt:now,tags:[],pinned:false,leadLevel:'Quan tâm',level:'Quan tâm',timeline:[],profile:{},customFields:{},documents:{}});
      added++;
    }
    if(firstId) selectedCustomerId=firstId;
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    document.querySelector('#aippPasteDialog')?.close();
    renderAll();
    showPasteResult({total:parsed.total,added,dup,invalid:parsed.invalid,source:pastedSource});
  }

  function pasteGuide(){
    let d=document.querySelector('#aippPasteDialog');
    if(d) d.remove(); // luôn tạo mới để không giữ handler/UI cũ.
    d=document.createElement('dialog'); d.id='aippPasteDialog'; d.className='aipp-paste-dialog';
    d.innerHTML=`<div class="dialog-form"><div class="dialog-head"><h3>📋 Dán danh sách khách</h3></div>
      <p class="muted">Mỗi SĐT sẽ tạo thành 1 khách. Chỉ cần SĐT; thiếu tên AIPP tự đặt tên là <b>.</b></p>
      <div class="aipp-example">0912345678<br>Nguyễn Văn A | 0987654321<br>0336752151</div>
      <label class="field"><span>Nguồn khách (không bắt buộc)</span><input id="aippPasteSource" type="text" maxlength="80" placeholder="VD: Facebook, Data tháng 9, CRM..." autocomplete="off"></label>
      <p class="muted" style="margin-top:-4px">Để trống: AIPP sẽ dùng nguồn <b>Dán danh sách</b> như trước.</p>
      <textarea id="aippPasteText" rows="9" inputmode="text" placeholder="Dán SĐT hoặc Tên + SĐT vào đây..."></textarea>
      <div class="dialog-actions"><button type="button" id="aippPasteCancel" class="secondary">Hủy</button><button type="button" id="aippPasteProcess" class="primary">Kiểm tra & nhập</button></div></div>`;
    document.body.appendChild(d);
    d.querySelector('#aippPasteCancel').onclick=()=>d.close();
    d.querySelector('#aippPasteProcess').onclick=processPasteCustomers;
    try{d.showModal()}catch{d.setAttribute('open','')}
    setTimeout(()=>d.querySelector('#aippPasteText')?.focus(),80);
  }

  // Chỉ listener này mở popup. Nút xử lý bên trong dùng onclick trực tiếp.
  document.addEventListener('click',function aippPasteOpenHandler(e){
    const b=e.target.closest('#ppPasteBtn,[data-paste-customers]');
    if(!b)return;
    e.preventDefault(); e.stopPropagation();
    pasteGuide();
  },true);


  const rd=renderDetail;renderDetail=function(){rd();installLevelButtons();setTimeout(stickyFixed,0)};
  const ra=renderAll;renderAll=function(){ra();installLevelButtons();setTimeout(stickyFixed,0)};
  setTimeout(()=>{installLevelButtons();stickyFixed()},120);
})();





/* ===== AIPP EXCEL IMPORT V12 — SINGLE HANDLER / iOS SAFE ===== */
(()=>{
  const q=s=>document.querySelector(s);
  const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let busy=false;
  function progress(show,pct=0,text=''){
    let el=q('#aippImportProgress');
    if(!el){el=document.createElement('div');el.id='aippImportProgress';el.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.38);z-index:99999;display:none;align-items:center;justify-content:center;padding:20px';el.innerHTML='<div style="width:min(430px,100%);background:white;border-radius:18px;padding:20px;box-shadow:0 20px 60px #0003"><b id="aippImportProgressText">Đang xử lý...</b><div style="height:12px;background:#e5e7eb;border-radius:99px;overflow:hidden;margin:14px 0 8px"><div id="aippImportProgressBar" style="height:100%;width:0;background:#2563eb;transition:width .15s"></div></div><div id="aippImportProgressPct" style="font-weight:800;text-align:right">0%</div></div>';document.body.appendChild(el)}
    el.style.display=show?'flex':'none';if(!show)return;
    pct=Math.max(0,Math.min(100,Math.round(pct)));q('#aippImportProgressText').textContent=text||'Đang xử lý...';q('#aippImportProgressBar').style.width=pct+'%';q('#aippImportProgressPct').textContent=pct+'%';
  }
  function error(title,msg){progress(false);busy=false;let d=q('#aippImportError');if(!d){d=document.createElement('dialog');d.id='aippImportError';document.body.appendChild(d)}d.innerHTML=`<div class="dialog-form"><div class="dialog-head"><h3>❌ ${E(title)}</h3></div><p>${E(msg)}</p><div class="dialog-actions"><button type="button" class="primary" id="aippImportErrClose">Đóng</button></div></div>`;try{d.showModal()}catch{d.setAttribute('open','')}q('#aippImportErrClose').onclick=()=>d.close();}
  function phone(v){let p=normalizePhone(String(v??'').trim());if(/^\d{9}$/.test(p))p='0'+p;return p}
  function isHeader(r){const a=String(r?.[0]??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]/g,''),b=String(r?.[1]??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]/g,'');return /^(hoten|ten|tenkhachhang|name|customername)$/.test(a)||/^(sodienthoai|sdt|dienthoai|phone|mobile|phonenumber)$/.test(b)}
  function csv(text){const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());if(!lines.length)return[];const sep=(lines[0].match(/;/g)||[]).length>(lines[0].match(/,/g)||[]).length?';':',';return lines.map(line=>{const out=[];let cur='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){cur+='"';i++}else quoted=!quoted}else if(c===sep&&!quoted){out.push(cur.trim());cur=''}else cur+=c}out.push(cur.trim());return out})}
  function build(rows,fileName){const clean=(rows||[]).filter(r=>Array.isArray(r)&&r.some(v=>String(v??'').trim()));if(!clean.length)throw new Error('File không có dữ liệu.');const header=isHeader(clean[0]),heads=header?clean[0].map(v=>String(v??'').trim()):[],data=header?clean.slice(1):clean,existing=new Set(state.customers.map(c=>normalizePhone(c.phone))),seen=new Set(),items=[];data.forEach((r,i)=>{const row=i+(header?2:1),name=String(r[0]??'').trim(),p=phone(r[1]??''),notes=[];for(let c=2;c<r.length;c++){const v=String(r[c]??'').trim();if(v)notes.push(`${heads[c]||'Cột '+(c+1)}: ${v}`)}let status='success',reason='Hợp lệ';if(!p){status='failed';reason='Thiếu số điện thoại'}else if(!classifyPhone(p).valid){status='failed';reason=`SĐT không hợp lệ: ${String(r[1]??'').trim()||'(trống)'}`}else if(existing.has(p)){status='duplicate';reason='SĐT đã tồn tại trong AIPP'}else if(seen.has(p)){status='duplicate';reason='SĐT bị trùng trong file'}else seen.add(p);items.push({row,name:name||'.',phone:p,note:notes.join(' | '),status,reason})});return{fileName,header,items}}
  function preview(pack){progress(false);busy=false;const ok=pack.items.filter(x=>x.status==='success'),dups=pack.items.filter(x=>x.status==='duplicate'),bad=pack.items.filter(x=>x.status==='failed');let d=q('#ppImportDialog');if(!d){d=document.createElement('dialog');d.id='ppImportDialog';document.body.appendChild(d)}const rows=pack.items.slice(0,12).map(x=>`<tr><td>${x.row}</td><td>${E(x.name||'—')}</td><td>${E(x.phone||'—')}</td><td>${x.status==='success'?'✅ Thành công':x.status==='duplicate'?'⚠️ Trùng':'❌ Thất bại'}<br><small>${E(x.reason)}</small></td></tr>`).join(''),problems=[...dups,...bad];d.innerHTML=`<div class="dialog-form" style="max-width:780px"><div class="dialog-head"><h3>📥 Xem trước dữ liệu</h3><button type="button" class="icon-btn" id="aippImportClose">✕</button></div><div style="padding:12px;border-radius:12px;background:#eff6ff;margin-bottom:12px"><b>Quy tắc:</b> Cột 1 = Tên · Cột 2 = SĐT · Cột 3 trở đi = Ghi chú.<br><small>${pack.header?'Đã bỏ qua dòng tiêu đề.':'Không phát hiện tiêu đề; đọc từ dòng 1.'}</small></div><div class="pp-import-summary"><div><strong>${pack.items.length}</strong><span>Tổng</span></div><div><strong>${ok.length}</strong><span>Thành công</span></div><div><strong>${dups.length}</strong><span>Trùng</span></div><div><strong>${bad.length}</strong><span>Thất bại</span></div></div><p class="muted">${E(pack.fileName)}</p><div style="overflow:auto;max-height:300px"><table style="width:100%;font-size:13px"><thead><tr><th>Dòng</th><th>Tên</th><th>SĐT</th><th>Kết quả</th></tr></thead><tbody>${rows}</tbody></table></div>${problems.length?`<details style="margin-top:12px"><summary><b>Lý do trùng/thất bại (${problems.length})</b></summary><div style="max-height:220px;overflow:auto">${problems.slice(0,100).map(x=>`<div style="padding:7px 0;border-bottom:1px solid #eee"><b>Dòng ${x.row}</b>: ${E(x.reason)}</div>`).join('')}</div></details>`:''}<div class="dialog-actions"><button type="button" class="secondary" id="aippImportCancel">Hủy</button><button type="button" class="primary" id="aippImportConfirm" ${ok.length?'':'disabled'}>Nhập ${ok.length} khách</button></div></div>`;try{d.showModal()}catch{d.setAttribute('open','')}q('#aippImportClose').onclick=q('#aippImportCancel').onclick=()=>d.close();q('#aippImportConfirm').onclick=()=>commit(pack,d)}
  function commit(pack,d){const valid=pack.items.filter(x=>x.status==='success');let i=0,added=0,first=null;busy=true;progress(true,0,`Đang nhập 0/${valid.length} khách...`);const run=()=>{try{const stop=Math.min(i+60,valid.length);for(;i<stop;i++){const x=valid[i],id=crypto.randomUUID();if(!first)first=id;state.customers.unshift({id,name:x.name,phone:x.phone,source:'',product:'',status:'Chưa gọi',followup:'',note:x.note,zaloStatus:'unknown',level:'Quan tâm',timeline:[{id:crypto.randomUUID(),at:new Date().toISOString(),type:'note',title:'Nhập từ Excel/CSV',detail:`Dòng ${x.row}`}],profile:{},customFields:{},documents:{},updatedAt:new Date().toISOString()});added++}progress(true,valid.length?i/valid.length*100:100,`Đang nhập ${i}/${valid.length} khách...`);if(i<valid.length)return setTimeout(run,0);if(first)selectedCustomerId=first;localStorage.setItem(STORAGE_KEY,JSON.stringify(state));d.close();showView('customers');renderAll();progress(false);busy=false;result(added,pack)}catch(e){error('Không thể lưu dữ liệu',e.message||String(e))}};setTimeout(run,30)}
  function result(added,pack){const dup=pack.items.filter(x=>x.status==='duplicate'),bad=pack.items.filter(x=>x.status==='failed'),problems=[...dup,...bad];let d=q('#aippImportResult');if(!d){d=document.createElement('dialog');d.id='aippImportResult';document.body.appendChild(d)}d.innerHTML=`<div class="dialog-form"><div class="dialog-head"><h3>📊 Kết quả nhập</h3></div><div class="pp-import-summary"><div><strong>${added}</strong><span>Thành công</span></div><div><strong>${dup.length}</strong><span>Trùng</span></div><div><strong>${bad.length}</strong><span>Thất bại</span></div></div>${problems.length?`<div style="max-height:300px;overflow:auto">${problems.slice(0,100).map(x=>`<div style="padding:7px 0;border-bottom:1px solid #eee"><b>Dòng ${x.row}</b> · ${E(x.name||'—')} · ${E(x.phone||'—')}<br><span>${E(x.reason)}</span></div>`).join('')}</div>`:'<p>Toàn bộ dữ liệu hợp lệ đã được nhập thành công.</p>'}<div class="dialog-actions"><button type="button" class="primary" id="aippImportDone">Xong</button></div></div>`;try{d.showModal()}catch{d.setAttribute('open','')}q('#aippImportDone').onclick=()=>d.close()}
  function read(file){if(busy)return;busy=true;progress(true,1,`Đã nhận file: ${file.name}`);const ext=(file.name.split('.').pop()||'').toLowerCase();if(!['xlsx','xls','csv'].includes(ext))return error('Sai định dạng','Chỉ hỗ trợ .xlsx, .xls hoặc .csv');if(ext!=='csv'&&typeof XLSX==='undefined')return error('Thiếu bộ đọc Excel','Thư viện XLSX chưa tải được. Hãy kiểm tra kết nối Internet và tải lại AIPP.');const r=new FileReader();r.onerror=()=>error('Không mở được file',r.error?.message||'iPhone/Safari không đọc được file đã chọn.');r.onabort=()=>error('Đã hủy đọc file','FileReader bị hủy trước khi đọc xong.');r.onprogress=e=>{if(e.lengthComputable)progress(true,5+(e.loaded/e.total)*50,`Đang đọc file... ${Math.round(e.loaded/e.total*100)}%`)};r.onload=()=>{try{progress(true,62,'Đã đọc file · đang mở dữ liệu...');let rows;if(ext==='csv')rows=csv(r.result);else{const wb=XLSX.read(r.result,{type:'array',cellDates:false});if(!wb.SheetNames?.length)throw new Error('Không tìm thấy sheet trong Excel');progress(true,76,`Đang đọc sheet ${wb.SheetNames[0]}...`);rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:'',raw:false,blankrows:false})}progress(true,90,'Đang kiểm tra dữ liệu và số trùng...');const pack=build(rows,file.name);progress(true,100,'Hoàn tất · đang mở xem trước...');setTimeout(()=>preview(pack),150)}catch(e){error('Không đọc được dữ liệu',e.message||String(e))}};ext==='csv'?r.readAsText(file):r.readAsArrayBuffer(file)}
  window.aippNativeRows=(name,rowsJson)=>{try{busy=true;progress(true,70,'Đã đọc Excel offline · đang kiểm tra dữ liệu...');const rows=JSON.parse(rowsJson||'[]');const pack=build(rows,name||'import.xlsx');progress(true,100,'Hoàn tất · đang mở xem trước...');setTimeout(()=>preview(pack),100)}catch(e){error('Không đọc được Excel',e.message||String(e))}};
  window.aippNativeImport=(name,b64)=>{try{const bin=atob(b64),u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);const f=new File([u8],name||'import.csv');read(f)}catch(e){error('Không đọc được file',e.message||String(e))}};
  window.aippNativeImportError=(msg)=>error('Không mở được file',msg||'Android không thể mở file đã chọn.');
  window.aippNativeImportCancelled=()=>{};
  function install(){const old=q('#importInput');if(!old)return;const fresh=old.cloneNode(true);fresh.value='';old.replaceWith(fresh);fresh.accept='.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv';fresh.addEventListener('change',e=>{const f=e.currentTarget.files?.[0];if(f)read(f);e.currentTarget.value=''});const btn=q('#ppImportBtn');if(btn){btn.onclick=e=>{e.preventDefault();if(busy)return;try{if(window.AippAndroid&&typeof AippAndroid.openImportPicker==='function'){AippAndroid.openImportPicker();return}}catch(_){}fresh.value='';fresh.click()};btn.title='Cột 1: Tên · Cột 2: SĐT · Cột 3+: Ghi chú'} }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();


/* ===== AIPP V13 - GLOBAL BACK TO TOP ===== */
(()=>{
  const btn=document.querySelector('#aippBackToTop');
  if(!btn)return;
  const update=()=>btn.classList.toggle('show',window.scrollY>320);
  window.addEventListener('scroll',update,{passive:true});
  btn.addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
  update();
})();


/* =========================================================
   AIPP V12.1 - CUSTOMER CARD QUICK ACTIONS / MOBILE LAYOUT
   - Move Nhắc/Gửi sau + Xóa to customer card
   - Keep Sửa in detail
   - Prevent mobile detail text from collapsing vertically
   ========================================================= */
(()=>{
  const prevRenderCustomersAippCard=renderCustomers;
  renderCustomers=function(){
    prevRenderCustomersAippCard();
    $$('#customerList .customer-row').forEach(row=>{
      const id=row.dataset.customerId;
      const c=state.customers.find(x=>x.id===id);
      if(!c || row.querySelector('.aipp-card-actions'))return;

      // Preserve the original customer information block and status, then add compact actions.
      const actions=document.createElement('div');
      actions.className='aipp-card-actions';
      actions.innerHTML=`
        <button type="button" class="secondary small aipp-card-schedule" data-card-schedule="${esc(id)}" title="Nhắc hoặc gửi sau">🗓 <span>Nhắc/Gửi sau</span></button>
        <button type="button" class="danger small aipp-card-delete" data-delete="${esc(id)}" title="Xóa khách">🗑 <span>Xóa</span></button>
        <button type="button" class="secondary small aipp-card-detail" data-card-detail="${esc(id)}" title="Xem chi tiết">Chi tiết</button>`;
      row.appendChild(actions);
    });
  };

  const prevRenderDetailAippCard=renderDetail;
  renderDetail=function(){
    prevRenderDetailAippCard();
    const panel=$('#detailPanel');
    if(!panel)return;
    // Requested: these two actions live on the customer card, not in detail.
    panel.querySelector('.customer-head-actions [data-schedule-customer]')?.remove();
    panel.querySelector('.customer-head-actions [data-delete]')?.remove();
  };

  // Capture quick actions before the customer-row click handler can open/return first.
  document.addEventListener('click',e=>{
    const schedule=e.target.closest('[data-card-schedule]');
    if(schedule){
      e.preventDefault(); e.stopImmediatePropagation();
      selectedCustomerId=schedule.dataset.cardSchedule;
      renderCustomers(); renderDetail();
      openScheduleDialog(selectedCustomerId);
      return;
    }
    const detail=e.target.closest('[data-card-detail]');
    if(detail){
      e.preventDefault(); e.stopImmediatePropagation();
      selectedCustomerId=detail.dataset.cardDetail;
      renderCustomers(); renderDetail();
      if(window.innerWidth<=920)setTimeout(()=>$('#detailPanel')?.scrollIntoView({behavior:'smooth',block:'start'}),60);
      return;
    }
  },true);

  if(!document.querySelector('#aippCustomerCardActionStyle')){
    const style=document.createElement('style');
    style.id='aippCustomerCardActionStyle';
    style.textContent=`
      #customerList .customer-row{position:relative;gap:10px;align-items:center;min-width:0}
      #customerList .customer-row>div:first-child{min-width:0;flex:1 1 auto}
      #customerList .customer-row>div:first-child strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #customerList .customer-row>.status-pill{flex:0 0 auto}
      .aipp-card-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex:0 0 auto}
      .aipp-card-actions button{margin:0;white-space:nowrap;min-width:0}
      .aipp-card-detail{font-weight:800}
      #detailPanel .customer-summary{display:flex;align-items:flex-start;gap:10px;min-width:0}
      #detailPanel .customer-summary-main{min-width:0;flex:1 1 auto;width:auto!important}
      #detailPanel .customer-summary-main h3,#detailPanel .customer-summary-main .phone{word-break:normal!important;overflow-wrap:normal!important;white-space:normal}
      #detailPanel .customer-head-actions{flex:0 0 auto;width:auto!important;min-width:max-content}
      @media(max-width:920px){
        #customerList .customer-row{display:grid!important;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:'info detail' 'actions actions';padding:12px!important}
        #customerList .customer-row>div:first-child{grid-area:info}
        #customerList .customer-row>.status-pill{display:none!important}
        .aipp-card-actions{grid-area:actions;width:100%;display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,.72fr) minmax(0,.8fr);gap:6px;margin-top:8px}
        .aipp-card-actions button{width:100%;padding:9px 7px!important;font-size:13px!important;border-radius:12px!important}
        .aipp-card-actions button span{display:inline}
        #detailPanel .customer-summary{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;width:100%!important}
        #detailPanel .customer-summary-main{width:100%!important;max-width:none!important}
        #detailPanel .customer-head-actions{width:auto!important;display:flex!important;align-items:flex-start!important}
        #detailPanel .customer-head-actions button{width:auto!important;min-width:76px!important}
      }
      @media(max-width:390px){
        .aipp-card-actions{grid-template-columns:minmax(0,1.25fr) minmax(0,.62fr) minmax(0,.72fr)}
        .aipp-card-actions button{font-size:12px!important;padding:8px 5px!important}
      }
    `;
    document.head.appendChild(style);
  }

  renderCustomers();
  renderDetail();
})();

/* ===== AIPP V13.1 - STICKY CUSTOMER ACTIONS + BACK TO TOP ===== */
(()=>{
  let stickyScrollBound=false;

  function ensureBackToTop(){
    let btn=document.querySelector('#aippBackToTop');
    if(!btn){
      btn=document.createElement('button');
      btn.id='aippBackToTop';
      btn.type='button';
      btn.setAttribute('aria-label','Lên đầu trang');
      btn.title='Lên đầu trang';
      btn.innerHTML='⬆️';
      document.body.appendChild(btn);
      btn.addEventListener('click',e=>{e.preventDefault();window.scrollTo({top:0,behavior:'smooth'});});
    }
    const update=()=>btn.classList.toggle('show',window.scrollY>220);
    if(!btn.dataset.aippScrollBound){
      btn.dataset.aippScrollBound='1';
      window.addEventListener('scroll',update,{passive:true});
    }
    update();
  }

  function renderStickyActions(){
    const panel=document.querySelector('#detailPanel');
    const view=document.querySelector('#customersView');
    const c=state.customers.find(x=>x.id===selectedCustomerId);
    let bar=document.querySelector('#aippFixedCustomer');
    if(!panel||!view||!c){bar?.classList.remove('show');return;}
    if(!bar){
      bar=document.createElement('div');
      bar.id='aippFixedCustomer';
      bar.className='aipp-fixed-customer';
      document.body.appendChild(bar);
    }
    bar.innerHTML=`
      <div class="aipp-fixed-info" data-aipp-open-customer>
        <b>👤 ${esc(c.name)}</b>
        <span>${esc(c.phone)} · ${esc(c.status||'Chưa gọi')}</span>
      </div>
      <div class="aipp-fixed-actions">
        <button type="button" class="secondary" data-schedule-customer="${esc(c.id)}" title="Nhắc hoặc gửi sau">🗓 <span>Nhắc/Gửi sau</span></button>
        <button type="button" class="danger" data-delete="${esc(c.id)}" title="Xóa khách">🗑 <span>Xóa</span></button>
        <button type="button" class="secondary aipp-fixed-detail" data-aipp-open-customer title="Chi tiết">Chi tiết</button>
      </div>`;

    const update=()=>{
      const r=panel.getBoundingClientRect();
      const active=view.classList.contains('active');
      bar.classList.toggle('show',active && r.top<155 && r.bottom>125);
    };
    update();
    if(!stickyScrollBound){
      stickyScrollBound=true;
      window.addEventListener('scroll',()=>{
        const b=document.querySelector('#aippFixedCustomer');
        const p=document.querySelector('#detailPanel');
        const v=document.querySelector('#customersView');
        if(!b||!p||!v)return;
        const r=p.getBoundingClientRect();
        b.classList.toggle('show',v.classList.contains('active') && r.top<155 && r.bottom>125);
      },{passive:true});
    }
  }

  document.addEventListener('click',e=>{
    const open=e.target.closest('[data-aipp-open-customer]');
    if(open){
      e.preventDefault();
      document.querySelector('#detailPanel')?.scrollIntoView({behavior:'smooth',block:'start'});
    }
  });

  if(!document.querySelector('#aippStickyActionStyle')){
    const style=document.createElement('style');
    style.id='aippStickyActionStyle';
    style.textContent=`
      #aippFixedCustomer.aipp-fixed-customer{
        position:fixed;left:50%;transform:translateX(-50%) translateY(-12px);
        top:max(8px,env(safe-area-inset-top));z-index:9990;
        width:min(760px,calc(100% - 24px));box-sizing:border-box;
        display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;
        padding:10px 12px;background:linear-gradient(135deg,rgba(255,255,255,.99),rgba(253,242,248,.99));border:1.5px solid rgba(219,39,119,.34);border-left:5px solid #DB2777;
        border-radius:18px;box-shadow:0 10px 30px rgba(219,39,119,.16),0 3px 10px rgba(15,23,42,.10);
        opacity:0;pointer-events:none;transition:.18s ease;
      }
      #aippFixedCustomer.show{opacity:1;pointer-events:auto;transform:translateX(-50%) translateY(0)}
      #aippFixedCustomer .aipp-fixed-info{min-width:0;cursor:pointer}
      #aippFixedCustomer .aipp-fixed-info b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:16px;color:#111827;font-weight:900}
      #aippFixedCustomer .aipp-fixed-info span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:#9d174d;margin-top:3px;font-weight:700}
      #aippFixedCustomer .aipp-fixed-actions{display:flex;gap:5px;align-items:center}
      #aippFixedCustomer .aipp-fixed-actions button{margin:0!important;white-space:nowrap;padding:8px 9px!important;border-radius:11px!important;font-size:12px!important;font-weight:800!important;min-width:0!important;border:1px solid rgba(219,39,119,.12)!important}
      #aippBackToTop{
        position:fixed;right:14px;top:calc(max(8px,env(safe-area-inset-top)) + 92px);z-index:9989;
        width:44px;height:44px;border:0;border-radius:50%;background:#111827;color:#fff;
        box-shadow:0 6px 20px rgba(15,23,42,.25);font-size:20px;display:flex;align-items:center;justify-content:center;
        opacity:0;pointer-events:none;transform:translateY(-8px);transition:.18s ease;
      }
      #aippBackToTop.show{opacity:.94;pointer-events:auto;transform:translateY(0)}
      @media(max-width:920px){
        #aippFixedCustomer.aipp-fixed-customer{width:calc(100% - 16px);grid-template-columns:minmax(0,1fr);gap:6px;padding:8px}
        #aippFixedCustomer .aipp-fixed-actions{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,.72fr) minmax(0,.8fr);width:100%}
        #aippFixedCustomer .aipp-fixed-actions button{width:100%;padding:7px 5px!important;font-size:11px!important}
        #aippFixedCustomer .aipp-fixed-info b{font-size:14px}
        #aippBackToTop{right:10px;top:calc(max(8px,env(safe-area-inset-top)) + 118px);width:40px;height:40px;font-size:18px}
      }
      @media(max-width:380px){
        #aippFixedCustomer .aipp-fixed-actions button span{font-size:10px}
      }
    `;
    document.head.appendChild(style);
  }

  const prevRenderDetailSticky=renderDetail;
  renderDetail=function(){prevRenderDetailSticky();renderStickyActions();ensureBackToTop();};
  const prevRenderAllSticky=renderAll;
  renderAll=function(){prevRenderAllSticky();renderStickyActions();ensureBackToTop();};

  ensureBackToTop();
  renderStickyActions();
})();

/* ===== AIPP V6.2.0 - SMART CARE GLOBAL HELPERS ===== */
window.aippSmsDuplicateDays=function(){
  try{const n=Number(state?.settings?.smsDuplicateDays||30);return Math.max(1,Math.min(180,Math.round(n||30)));}catch(_){return 30;}
};
window.aippSmsDuplicateWindowMs=function(){return window.aippSmsDuplicateDays()*86400000;};
window.aippStaleCustomerDays=function(){
  try{const n=Number(state?.settings?.staleCustomerDays||7);return Math.max(1,Math.min(90,Math.round(n||7)));}catch(_){return 7;}
};

/* ===== AIPP V6.1.27 - EARLY SAFE SMS HELPERS ===== */
window.aipp127DaysAgo=function(at){
  const t=new Date(at||'').getTime();
  if(!Number.isFinite(t)||t<=0)return '';
  const n=Math.max(0,Math.floor((Date.now()-t)/86400000));
  return n===0?'hôm nay':n===1?'1 ngày trước':`${n} ngày trước`;
};
window.aipp127FriendlySmsError=function(raw){
  const msg=String(raw||'').trim(), low=msg.toLowerCase();
  if(!msg)return 'Không xác định được nguyên nhân lỗi.';
  if(low.includes('aipp126nativeschedule')&&low.includes('not a function'))return 'Bộ lập lịch SMS của bản cũ chưa được khởi tạo. Bản 6.1.27 đã sửa lỗi này; hãy bấm “Gửi lại SMS”.';
  if(low.includes('chưa cấp quyền sms')||low.includes('send_sms'))return 'AIPP chưa được cấp quyền gửi SMS. Vào Cài đặt Android → Ứng dụng → AIPP → Quyền → cho phép SMS.';
  if(low.includes('báo thức')||low.includes('exact alarm')||low.includes('exactalarm'))return 'AIPP chưa được phép đặt lịch chính xác. Hãy bật quyền “Báo thức & lời nhắc” cho AIPP rồi bấm Gửi lại SMS.';
  if(low.includes('không tìm thấy bộ gửi sms android')||low.includes('aippandroid'))return 'Không kết nối được bộ gửi SMS Android. Hãy mở đúng ứng dụng AIPP và bấm Gửi lại SMS.';
  if(low.includes('securityexception'))return 'Android từ chối quyền gửi/lên lịch SMS. Kiểm tra quyền SMS và quyền Báo thức & lời nhắc.';
  if(low.includes('blocked')||low.includes('chặn gửi trùng'))return `Đã chặn để tránh gửi trùng trong vòng ${window.aippSmsDuplicateDays()} ngày.`;
  return msg.replace(/^Lỗi Android:\s*/i,'');
};
window.aipp127NativeLastSent=function(phone){
  try{
    if(window.AippAndroid&&typeof window.AippAndroid.getSmsLastSent==='function'){
      const n=Number(window.AippAndroid.getSmsLastSent(normalizePhone(phone))||0);
      return Number.isFinite(n)&&n>0?n:0;
    }
  }catch(_){ }
  return 0;
};
window.aipp127LastSentInfo=function(customerId,excludeId=''){
  try{
    const c=state.customers.find(x=>String(x.id)===String(customerId));
    if(!c)return null;
    const p=normalizePhone(c.phone||'');
    const sent=state.schedules.filter(s=>String(s.id)!==String(excludeId)&&s.status==='sent').filter(s=>{
      if(String(s.customerId)===String(customerId))return true;
      const sc=state.customers.find(x=>String(x.id)===String(s.customerId));
      return !!p&&!!sc&&normalizePhone(sc.phone||'')===p;
    }).map(s=>({at:new Date(s.sentAt||s.sendAt||'').getTime(),schedule:s})).filter(x=>Number.isFinite(x.at)&&x.at>0).sort((a,b)=>b.at-a.at);
    let at=sent[0]?.at||0, schedule=sent[0]?.schedule||null;
    const nativeAt=window.aipp127NativeLastSent(c.phone);
    if(nativeAt>at){at=nativeAt;schedule=null;}
    if(!at)return null;
    return {at,schedule,date:new Date(at).toISOString(),daysText:window.aipp127DaysAgo(at),days:Math.max(0,Math.floor((Date.now()-at)/86400000)),recent:Date.now()-at<=window.aippSmsDuplicateWindowMs()};
  }catch(_){return null;}
};
window.aipp127NativeSchedule=function(id,phone,message,at,customerId,explicitAllow){
  try{
    if(!window.AippAndroid||typeof window.AippAndroid.scheduleSms!=='function')return JSON.stringify({ok:false,message:'Không tìm thấy bộ gửi SMS Android'});
    let allow=!!explicitAllow;
    try{allow=allow||!!(window.__aipp126DuplicateOverrides&&window.__aipp126DuplicateOverrides[id]);}catch(_){ }
    let lastAt=0;
    try{
      const prior=customerId?window.aipp127LastSentInfo(customerId,id):null;
      lastAt=prior?.at||0;
      if(typeof window.AippAndroid.syncSmsLastSent==='function'&&lastAt>0)window.AippAndroid.syncSmsLastSent(normalizePhone(phone),lastAt);
      if(typeof window.AippAndroid.setSmsDuplicateDays==='function')window.AippAndroid.setSmsDuplicateDays(window.aippSmsDuplicateDays());
      if(typeof window.AippAndroid.setSmsDuplicateOverride==='function')window.AippAndroid.setSmsDuplicateOverride(String(id),allow);
    }catch(_){ }
    return window.AippAndroid.scheduleSms(String(id),normalizePhone(phone),String(message||''),Number(at));
  }catch(e){
    return JSON.stringify({ok:false,message:'Lỗi Android: '+(e?.message||String(e))});
  }
};
window.aipp126NativeSchedule=window.aipp127NativeSchedule;

/* =========================================================
   AIPP ANDROID NATIVE SMS SCHEDULER
   ========================================================= */
(() => {
  const nativeSms = () => !!window.AippAndroid;
  const oldSaveSchedule = saveSchedule;
  saveSchedule = async function(){
    const ok = await oldSaveSchedule();
    if(!ok) return false;
    const id=$('#scheduleId').value;
    const s=state.schedules.find(x=>x.id===id) || [...state.schedules].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0];
    if(s && nativeSms()){
      const c=state.customers.find(x=>x.id===s.customerId), t=state.templates.find(x=>x.id===s.templateId);
      if(c&&t){
        s.channel='sms'; s.serverId=''; s.status='scheduled'; s.lastError='';
        const msg=compileTemplate(t.text,c);
        try{
          const result=JSON.parse(window.aipp127NativeSchedule(s.id,normalizePhone(c.phone),msg,new Date(s.sendAt).getTime(),c.id,!!s.duplicateOverride));
          if(!result.ok){s.status='failed';s.lastError=result.message||'Android không lên lịch được';}
          else toast('📱 Đã lên lịch SMS trên Android');
        }catch(e){s.status='failed';s.lastError='Lỗi Android: '+e.message;}
        save();
      }
    }
    return true;
  };

  const oldCancel=cancelSchedule;
  cancelSchedule=async function(s){
    if(nativeSms()&&s){try{window.AippAndroid.cancelSms(s.id)}catch{}}
    s.status='cancelled';s.serverId='';save();toast('Đã hủy lịch SMS');
  };

  async function syncNativeSmsEvents(){
    if(!nativeSms())return;
    try{
      const events=JSON.parse(window.AippAndroid.getSmsEvents()||'[]');
      let changed=false;
      for(const e of events){
        const s=state.schedules.find(x=>x.id===e.id); if(!s)continue;
        if(e.status==='sent'){s.status='sent';s.sentAt=e.at;s.sentChannel='sms';s.lastError='';const c=state.customers.find(x=>x.id===s.customerId);if(c){c.status='Đã gửi SMS';c.updatedAt=new Date().toISOString();c.timeline=Array.isArray(c.timeline)?c.timeline:[];c.timeline.unshift({id:crypto.randomUUID(),at:e.at||new Date().toISOString(),type:'sms',title:'Đã gửi SMS tự động',detail:'Gửi thành công theo lịch'});}}
        if(e.status==='failed'){s.status='failed';s.lastError=e.error||'Android gửi SMS thất bại';}
        if(e.status==='blocked'){s.status='blocked';s.blockedAt=e.at||new Date().toISOString();s.lastError=e.error||`Đã chặn vì khách đã được gửi trong ${window.aippSmsDuplicateDays()} ngày gần nhất`;}
        changed=true;
      }
      if(events.length)window.AippAndroid.clearSmsEvents();
      if(changed)save();
    }catch(e){console.warn('Native SMS sync',e)}
  }

  // Native Android handles due schedules; prevent backend scheduler from taking over.
  if(nativeSms()){
    state.settings.backendBaseUrl=''; state.settings.backendApiKey='';
    state.schedules.forEach(s=>{if(s.status==='scheduled')s.channel='sms'}); save({render:false});
    const channel=$('#scheduleChannelInput');if(channel){channel.innerHTML='<option value="sms">SMS bằng SIM Android</option>';channel.value='sms';}

    function nativeAutoNote(){
      const note=$('#automationView .automation-state-note');
      if(!note)return;
      const on=!!state.settings.autoSendEnabled;
      const pending=state.schedules.filter(s=>s.status==='scheduled').length;
      note.classList.toggle('good',on);
      note.textContent=on?`✓ SMS Android đang bật • ${pending} lịch đang chờ gửi. Android sẽ giữ lịch và gửi bằng SIM khi đến giờ.`:'⏸ SMS Android đang tắt. Bật “Tự động gửi SMS theo lịch” trong Cài đặt.';
    }
    async function registerFutureSchedules(){
      if(!state.settings.autoSendEnabled)return;
      const now=Date.now();
      for(const s of state.schedules){
        if(s.status!=='scheduled'||new Date(s.sendAt).getTime()<=now)continue;
        const c=state.customers.find(x=>x.id===s.customerId),t=state.templates.find(x=>x.id===s.templateId);if(!c||!t)continue;
        try{const r=JSON.parse(window.aipp127NativeSchedule(s.id,normalizePhone(c.phone),compileTemplate(t.text,c),new Date(s.sendAt).getTime(),c.id,!!s.duplicateOverride));if(!r.ok){s.status='failed';s.lastError=r.message||'Android không lên lịch được';}}catch(e){s.status='failed';s.lastError='Lỗi Android: '+e.message;}
      }
      save(); nativeAutoNote();
    }
    const toggle=$('#autoSendToggle');
    if(toggle){toggle.checked=!!state.settings.autoSendEnabled;toggle.addEventListener('change',()=>{state.settings.autoSendEnabled=!!toggle.checked;save({render:false});if(state.settings.autoSendEnabled){registerFutureSchedules();toast('📱 Đã bật tự động gửi SMS Android');}else{toast('Đã tắt tự động gửi SMS Android');}nativeAutoNote();renderSchedules();});}
    const prevNativeRenderSchedules=renderSchedules;
    renderSchedules=function(){prevNativeRenderSchedules();nativeAutoNote();};
    syncNativeSmsEvents(); nativeAutoNote();
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){syncNativeSmsEvents();nativeAutoNote();}});
    window.addEventListener('focus',()=>{syncNativeSmsEvents();nativeAutoNote();});
    document.addEventListener('click',e=>{
      const edit=e.target.closest('[data-edit-schedule]');
      if(edit){openScheduleDialog(null,edit.dataset.editSchedule);return;}
      const retry=e.target.closest('[data-retry-native-sms]');
      if(retry){
        const s=state.schedules.find(x=>x.id===retry.dataset.retryNativeSms); if(!s)return;
        const c=state.customers.find(x=>x.id===s.customerId),t=state.templates.find(x=>x.id===s.templateId); if(!c||!t){toast('Không tìm thấy khách hoặc mẫu tin');return;}
        if(s.status==='blocked'){
          const prior=window.aipp127LastSentInfo?.(c.id,s.id);
          const detail=prior?`\nLần gửi gần nhất: ${fmtDate(prior.date)} (${prior.daysText})`:'\nChưa tìm thấy thời gian gửi gần nhất trong lịch sử.';
          if(!confirm(`Khách ${c.name} đã được chặn để tránh gửi trùng trong ${window.aippSmsDuplicateDays()} ngày.${detail}\n\nBạn có chắc muốn cho phép GỬI LẠI SMS?`))return;
          s.duplicateOverride=true;s.duplicateWarningConfirmedAt=new Date().toISOString();
        }
        try{
          const at=Date.now()+3000;
          const r=JSON.parse(window.aipp127NativeSchedule(s.id,normalizePhone(c.phone),compileTemplate(t.text,c),at,c.id,!!s.duplicateOverride));
          if(r.ok){s.status='scheduled';s.sendAt=new Date(at).toISOString().slice(0,16);s.lastError='';save();toast('↻ Sẽ gửi lại SMS sau vài giây');}
          else toast(r.message||'Không thể gửi lại SMS');
        }catch(err){toast('Lỗi gửi lại: '+err.message);}
      }
    });
  }
})();


/* =========================================================
   PHUC.PINK V5.4.3 - MULTI TEMPLATE RANDOM PREVIEW
   Built on the known-working V5.3 native SMS scheduler.
   ========================================================= */
(() => {
  const selected = new Set();
  const selectedTemplates = new Set();
  let previewPlan = null;
  const el = id => document.getElementById(id);
  const val = v => String(v ?? '').trim();
  const customerLevel = c => val(c.leadLevel || c.level || 'Quan tâm');
  const customerSource = c => val(c.source || 'Không rõ nguồn');
  const customerStatus = c => val(c.status || 'Chưa gọi');
  const customerGender = c => val(c.gender || 'unknown');
  const customerZalo = c => val(c.zaloStatus || 'unknown');
  const uniq = fn => [...new Set(state.customers.map(fn).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi'));
  const optionHtml = (items,label) => `<option value="">${label}</option>`+items.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
  const invalidatePreview = () => { previewPlan=null; if(el('bulkPreviewPanel'))el('bulkPreviewPanel').hidden=true; if(el('bulkCreateBtn'))el('bulkCreateBtn').hidden=true; if(el('bulkPreviewBtn'))el('bulkPreviewBtn').hidden=false; };

  function getFiltered(){
    const src=val(el('bulkSourceFilter')?.value),st=val(el('bulkStatusFilter')?.value),lv=val(el('bulkLevelFilter')?.value),g=val(el('bulkGenderFilter')?.value),z=val(el('bulkZaloFilter')?.value),carrier=val(el('bulkCarrierFilter')?.value),q=val(el('bulkSearchFilter')?.value).toLowerCase(),qn=normalizePhone(q);
    return state.customers.filter(c=>(!src||customerSource(c)===src)&&(!st||customerStatus(c)===st)&&(!lv||customerLevel(c)===lv)&&(!g||customerGender(c)===g)&&(!z||customerZalo(c)===z)&&carrierMatches(c.phone,carrier)&&(!q||String(c.name||'').toLowerCase().includes(q)||normalizePhone(c.phone||'').includes(qn)));
  }
  function updateSummary(list){
    list=list||getFiltered(); const count=selected.size;
    if(el('bulkSelectedCount'))el('bulkSelectedCount').textContent=`Đã chọn: ${count} khách`;
    if(el('bulkFoundCount'))el('bulkFoundCount').textContent=`Tìm thấy: ${list.length}/${state.customers.length} khách`;
    const gapField=el('bulkGapField');if(gapField)gapField.hidden=count<2;
    const btn=el('bulkSelectAllBtn');if(btn){const all=list.length>0&&list.every(c=>selected.has(String(c.id)));btn.textContent=all?'Bỏ chọn tất cả':'Chọn tất cả';}
    if(el('bulkReviewText')){const names=[...selected].map(id=>state.customers.find(c=>String(c.id)===id)?.name).filter(Boolean);el('bulkReviewText').textContent=count?`${count} người nhận: ${names.slice(0,4).join(', ')}${count>4?` +${count-4} khách`:''}`:'Chưa chọn khách.';}
  }
  function renderList(){
    const list=getFiltered(),box=el('bulkCustomerList');if(!box)return;
    box.innerHTML=list.length?list.map(c=>{const id=String(c.id),checked=selected.has(id)?'checked':'',prior=window.aipp127LastSentInfo?.(c.id),sent=prior?`<em class="aipp127-bulk-sent ${prior.recent?'recent':''}">✅ SMS gần nhất: ${esc(fmtDate(prior.date))} · ${esc(prior.daysText)}</em>`:'';return `<label class="bulk-customer-row"><input type="checkbox" class="bulk-customer-check" data-bulk-id="${esc(id)}" ${checked}><span><strong>${esc(c.name||'Chưa có tên')}</strong><small>${esc(c.phone||'')} · ${esc(customerSource(c))} · ${esc(customerStatus(c))} · ${esc(customerLevel(c))} · ${esc(genderLabel(c.gender))} · ${esc(zaloLabel(c.zaloStatus))} · ${carrierSymbol(classifyPhone(c.phone).origin)}</small>${sent}</span></label>`;}).join(''):'<div class="bulk-empty">Không có khách phù hợp bộ lọc.</div>';
    box.querySelectorAll('.bulk-customer-check').forEach(cb=>cb.onchange=()=>{const id=String(cb.dataset.bulkId);cb.checked?selected.add(id):selected.delete(id);invalidatePreview();updateSummary();});
    updateSummary(list);
  }
  function renderTemplates(){
    const box=el('bulkTemplateList');if(!box)return;
    box.innerHTML=state.templates.map(t=>`<label class="bulk-template-row"><input type="checkbox" class="bulk-template-check" data-template-id="${esc(t.id)}" ${selectedTemplates.has(String(t.id))?'checked':''}><span><strong>${esc(t.name)}</strong><small>${esc(t.text.slice(0,90))}${t.text.length>90?'…':''}</small></span></label>`).join('');
    box.querySelectorAll('.bulk-template-check').forEach(cb=>cb.onchange=()=>{const id=String(cb.dataset.templateId);cb.checked?selectedTemplates.add(id):selectedTemplates.delete(id);invalidatePreview();updateTemplateCount();});
    updateTemplateCount();
  }
  function updateTemplateCount(){if(el('bulkTemplateCount'))el('bulkTemplateCount').textContent=`Đã chọn ${selectedTemplates.size}/${state.templates.length} mẫu`;}
  function toggleVisibleSelection(){const list=getFiltered(),all=list.length>0&&list.every(c=>selected.has(String(c.id)));if(all)selected.clear();else list.forEach(c=>selected.add(String(c.id)));invalidatePreview();renderList();}
  function toggleAllTemplates(){const all=state.templates.length>0&&state.templates.every(t=>selectedTemplates.has(String(t.id)));selectedTemplates.clear();if(!all)state.templates.forEach(t=>selectedTemplates.add(String(t.id)));invalidatePreview();renderTemplates();if(el('bulkTemplateToggleBtn'))el('bulkTemplateToggleBtn').textContent=all?'Chọn tất cả mẫu':'Bỏ chọn tất cả mẫu';}
  function buildPreview(){
    const ids=[...selected],templateIds=[...selectedTemplates],sendAt=el('bulkScheduleTime')?.value;
    if(!ids.length){toast('Hãy chọn ít nhất 1 khách');return;}
    if(!templateIds.length){toast('Hãy chọn ít nhất 1 mẫu tin');return;}
    if(!sendAt){toast('Chọn thời gian gửi');return;}
    const startAt=new Date(sendAt).getTime();if(!Number.isFinite(startAt)||startAt<=Date.now()){toast('Thời gian gửi phải ở tương lai');return;}
    const gap=ids.length>=2?parseInt(el('bulkGapMinutes')?.value||'3',10):0;if(ids.length>=2&&(!Number.isFinite(gap)||gap<1||gap>1440)){toast('Khoảng cách SMS phải từ 1 đến 1440 phút');return;}
    const pool=templateIds.map(id=>state.templates.find(t=>String(t.id)===id)).filter(Boolean);if(!pool.length){toast('Không tìm thấy mẫu tin đã chọn');return;}
    previewPlan=ids.map((customerId,index)=>{const c=state.customers.find(x=>String(x.id)===customerId);const t=pool[Math.floor(Math.random()*pool.length)];const at=startAt+index*gap*60000;return c&&t?{customerId:c.id,templateId:t.id,customerName:c.name||'Chưa có tên',phone:c.phone||'',templateName:t.name,sendAt:new Date(at).toISOString(),sendAtMs:at,message:compileTemplate(t.text,c)}:null;}).filter(Boolean);
    const panel=el('bulkPreviewPanel'),list=el('bulkPreviewList');
    list.innerHTML=previewPlan.map((p,i)=>{const dup=window.aipp126DuplicateCheck?.(p.customerId);return `<div class="bulk-preview-row"><div><strong>${i+1}. ${esc(p.customerName)}</strong><small>${esc(p.phone)} · ${new Date(p.sendAtMs).toLocaleString('vi-VN',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'})} · ${esc(p.templateName)}</small>${dup?.recent?`<div class="aipp126-bulk-warning">⚠ Đã gửi gần nhất: ${esc(fmtDate(dup.recent.sentAt||dup.recent.sendAt))} · ${esc(window.aipp127DaysAgo(dup.recent.sentAt||dup.recent.sendAt))}</div>`:''}<p>${esc(p.message)}</p></div></div>`}).join('');
    panel.hidden=false;el('bulkPreviewBtn').hidden=true;el('bulkCreateBtn').hidden=false;panel.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  async function createBulk(){
    if(!previewPlan?.length){toast('Hãy bấm Xem trước trước khi xác nhận');return false;}
    let ok=0,fail=0,skippedRecent=0;
    const recentRows=previewPlan.filter(p=>window.aipp126DuplicateCheck?.(p.customerId)?.recent);
    let allowRecent=false;
    if(recentRows.length){
      allowRecent=confirm(`⚠ Có ${recentRows.length} khách đã được gửi tin trong ${window.aippSmsDuplicateDays()} ngày gần nhất.\n\nOK: vẫn tạo lịch cho các khách này.\nHủy: bỏ qua khách đã gửi gần đây và vẫn tạo lịch cho khách còn lại.`);
    }
    const created=[];
    for(const p of previewPlan){
      const c=state.customers.find(x=>String(x.id)===String(p.customerId));
      const t=state.templates.find(x=>String(x.id)===String(p.templateId));
      if(!c||!t){fail++;continue;}
      const dup=window.aipp126DuplicateCheck?.(c.id);
      if(dup?.recent&&!allowRecent){skippedRecent++;continue;}
      const s={id:crypto.randomUUID(),customerId:c.id,templateId:t.id,channel:'sms',sendAt:new Date(p.sendAtMs).toISOString(),status:'scheduled',createdAt:new Date().toISOString(),lastError:'',serverId:'',duplicateOverride:!!(dup?.recent&&allowRecent),duplicateWarningConfirmedAt:(dup?.recent&&allowRecent)?new Date().toISOString():''};
      try{
        if(window.AippAndroid && typeof window.AippAndroid.scheduleSms==='function'){
          const raw=window.aipp127NativeSchedule(s.id,normalizePhone(c.phone),p.message,Number(p.sendAtMs),c.id,!!s.duplicateOverride);
          const r=typeof raw==='string'?JSON.parse(raw):raw;
          if(r&&r.ok){ok++;}else{s.status='failed';s.lastError=(r&&r.message)||'Thiết bị không lên lịch được';fail++;}
        }else{
          // PWA/iOS: lưu lịch trong AIPP. Khi đến hạn app sẽ yêu cầu gửi thủ công hoặc dùng backend nếu đã cấu hình.
          s.status='scheduled'; s.lastError=''; ok++;
        }
      }catch(e){s.status='failed';s.lastError='Lỗi lên lịch: '+(e?.message||String(e));fail++;}
      state.schedules.push(s);created.push(s);
    }
    save({render:false});
    renderSchedules();
    renderStats();
    const parts=[`Đã tạo ${ok} lịch gửi`];if(skippedRecent)parts.push(`bỏ qua ${skippedRecent} khách đã gửi <${window.aippSmsDuplicateDays()} ngày`);if(fail)parts.push(`${fail} lịch lỗi`);toast(parts.join(' • '),5200);
    previewPlan=null;
    return created.length>0;
  }
  function bindDirect(){
    ['bulkSourceFilter','bulkStatusFilter','bulkLevelFilter','bulkGenderFilter','bulkZaloFilter','bulkCarrierFilter','bulkSearchFilter'].forEach(id=>{const x=el(id);if(x){x.onchange=()=>{invalidatePreview();renderList();};x.oninput=x.onchange;}});
    if(el('bulkSelectAllBtn'))el('bulkSelectAllBtn').onclick=toggleVisibleSelection;
    if(el('bulkTemplateToggleBtn'))el('bulkTemplateToggleBtn').onclick=toggleAllTemplates;
    if(el('bulkPreviewBtn'))el('bulkPreviewBtn').onclick=(e)=>{e.preventDefault();e.stopPropagation();buildPreview();};
    if(el('bulkCreateBtn'))el('bulkCreateBtn').onclick=async(e)=>{e.preventDefault();e.stopPropagation();const btn=el('bulkCreateBtn');if(btn){btn.disabled=true;btn.textContent='Đang tạo lịch...';}try{const made=await createBulk();if(made){el('bulkScheduleDialog').close();renderSchedules();}}finally{if(btn){btn.disabled=false;btn.textContent='Xác nhận tạo lịch';}}};
    ['bulkGapMinutes','bulkScheduleTime'].forEach(id=>{const x=el(id);if(x){x.oninput=invalidatePreview;x.onchange=invalidatePreview;}});
  }
  function openBulk(){
    if(!state.customers.length){toast('Chưa có khách hàng');return;}if(!state.templates.length){toast('Cần có ít nhất 1 mẫu tin');return;}
    selected.clear();selectedTemplates.clear();previewPlan=null;
    el('bulkSourceFilter').innerHTML=optionHtml(uniq(customerSource),'Tất cả nguồn');el('bulkStatusFilter').innerHTML=optionHtml(uniq(customerStatus),'Tất cả trạng thái');el('bulkLevelFilter').innerHTML=optionHtml(uniq(customerLevel),'Tất cả mức độ');
    el('bulkScheduleTime').value=nextLocalDate(0,new Date().getHours()+1,0);if(el('bulkGapMinutes'))el('bulkGapMinutes').value='3';if(el('bulkGapField'))el('bulkGapField').hidden=true;
    invalidatePreview();bindDirect();renderList();renderTemplates();if(el('bulkTemplateToggleBtn'))el('bulkTemplateToggleBtn').textContent='Chọn tất cả mẫu';el('bulkScheduleDialog').showModal();
  }
  const openBtn=el('bulkScheduleBtn');if(openBtn)openBtn.onclick=openBulk;
  const form=el('bulkScheduleForm');if(form)form.onsubmit=e=>{e.preventDefault();e.stopPropagation();return false;};
})();

/* ===== AIPP V5.5 ALL-IN-ONE TOOLS ===== */
(()=>{
 const q=s=>document.querySelector(s), qa=s=>[...document.querySelectorAll(s)];
 const rid=()=>globalThis.crypto?.randomUUID?.()||('id_'+Date.now()+'_'+Math.random().toString(36).slice(2));
 const safe=s=>esc(String(s??''));
 function initData(){
  state.customLists=Array.isArray(state.customLists)?state.customLists:[];
  state.toolSettings=state.toolSettings||{autoBackup:true,lastBackupAt:'',backups:[]};
  state.toolSettings.backups=Array.isArray(state.toolSettings.backups)?state.toolSettings.backups:[];
  state.customers.forEach(c=>{c.tags=Array.isArray(c.tags)?c.tags:[];c.createdAt=c.createdAt||c.updatedAt||new Date().toISOString();c.profile=c.profile||{};c.documents=c.documents||{};c.timeline=Array.isArray(c.timeline)?c.timeline:[];});
 }
 function persist(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}
 function lastContact(c){const a=(c.timeline||[]).map(x=>new Date(x.at).getTime()).filter(Number.isFinite);return a.length?Math.max(...a):new Date(c.updatedAt||c.createdAt||0).getTime();}
 function daysOld(c){const t=lastContact(c);return t?Math.floor((Date.now()-t)/86400000):9999;}
 function smsState(c){const ss=state.schedules.filter(s=>s.customerId===c.id);if(!ss.length)return'none';if(ss.some(s=>s.status==='sent'))return'sent';if(ss.some(s=>s.status==='scheduled'))return'waiting';return'other';}
 function addUI(){
  if(q('#toolsView'))return;
  const settingsBtn=q('.nav-btn[data-view="settings"]');
  const b=document.createElement('button');b.className='nav-btn';b.dataset.view='tools';b.innerHTML='🧰 <span>Công cụ</span>';settingsBtn?.parentNode.insertBefore(b,settingsBtn);
  b.onclick=()=>{showView('tools');q('#pageTitle').textContent='Công cụ AIPP';renderTools();};
  const sec=document.createElement('section');sec.id='toolsView';sec.className='view';sec.innerHTML=`
   <div class="aipp-tool-tabs"><button class="secondary active" data-tool-tab="customers">👥 Khách</button><button class="secondary" data-tool-tab="data">📥 Dữ liệu</button><button class="secondary" data-tool-tab="profile">📇 Hồ sơ</button><button class="secondary" data-tool-tab="loan">🧮 Khoản vay</button><button class="secondary" data-tool-tab="backup">💾 Backup</button></div>
   <div id="toolCustomers" class="aipp-tools-grid aipp-tool-section active">
    <section class="panel aipp-tool-card wide"><h3>🔍 Tìm kiếm nâng cao</h3><div class="aipp-filter-grid"><input id="tfText" placeholder="Tên / SĐT / Tag"><select id="tfSource"><option value="">Tất cả nguồn</option></select><select id="tfStatus"><option value="">Tất cả trạng thái</option></select><select id="tfLevel"><option value="">Tất cả mức độ</option></select><input id="tfAddedFrom" type="date" title="Ngày thêm từ"><input id="tfAddedTo" type="date" title="Ngày thêm đến"><input id="tfFollowFrom" type="date" title="Ngày hẹn từ"><input id="tfFollowTo" type="date" title="Ngày hẹn đến"><select id="tfSms"><option value="">SMS: tất cả</option><option value="sent">Đã SMS</option><option value="waiting">Đang chờ SMS</option><option value="none">Chưa SMS</option></select></div><div class="tool-row"><button class="primary" id="tfRun">Tìm khách</button><button class="secondary" id="tfClear">Xóa lọc</button><button class="secondary" id="tfSaveList">Lưu thành danh sách</button></div><div id="tfResult" class="aipp-result-list"></div></section>
    <section class="panel aipp-tool-card"><h3>📆 Lâu chưa chăm sóc</h3><p class="muted">Tính từ tương tác gần nhất.</p><div class="tool-row">${[3,7,14,30].map(n=>`<button class="secondary" data-stale="${n}">${n} ngày</button>`).join('')}</div><div id="staleSummary" class="muted"></div></section>
    <section class="panel aipp-tool-card"><h3>♻️ Chăm sóc lại</h3><p class="muted">Khách cũ đã gửi tin, hoàn tất hoặc lâu chưa tương tác.</p><div class="tool-row"><button class="primary" id="remarketingBtn">Tạo danh sách remarketing</button></div><div id="remarketingSummary" class="muted"></div></section>
    <section class="panel aipp-tool-card"><h3>🏷️ Tag khách hàng</h3><input id="tagCustomerSearch" placeholder="Tìm tên/SĐT"><input id="tagValue" placeholder="Tag: Lương cao, Cần gấp..."><div class="tool-row"><button class="primary" id="tagAddBtn">Thêm tag cho khách đang chọn</button></div><div id="tagCurrent"></div></section>
    <section class="panel aipp-tool-card"><h3>👥 Danh sách tùy chỉnh</h3><div class="tool-row"><button class="secondary" id="newEmptyList">+ Danh sách mới</button></div><div id="customLists"></div></section>
   </div>
   <div id="toolData" class="aipp-tools-grid aipp-tool-section">
    <section class="panel aipp-tool-card"><h3>📥 Trung tâm nhập dữ liệu</h3><p class="muted">Dùng lại bộ Nhập/Dán đã ổn định của AIPP.</p><div class="tool-row"><button class="primary" id="toolImport">Nhập Excel/CSV</button><button class="secondary" id="toolPaste">Dán danh sách</button></div></section>
    <section class="panel aipp-tool-card"><h3>📤 Xuất dữ liệu</h3><p class="muted">CSV hoặc Excel-compatible (.xls), toàn bộ hoặc kết quả tìm kiếm hiện tại.</p><div class="tool-row"><button class="secondary" data-export-kind="csv">CSV toàn bộ</button><button class="secondary" data-export-kind="xls">Excel toàn bộ</button><button class="secondary" data-export-kind="csv-filter">CSV đang lọc</button></div></section>
   </div>
   <div id="toolProfile" class="aipp-tools-grid aipp-tool-section">
    <section class="panel aipp-tool-card"><h3>📇 Hồ sơ khách mở rộng</h3><p class="muted">Công ty, nghề nghiệp, thu nhập, khu vực, sản phẩm quan tâm và trường tùy chỉnh đã được tích hợp trong hồ sơ khách.</p><div class="tool-row"><button class="primary" id="openProfileSettings">Cài trường hồ sơ</button><button class="secondary" id="openSelectedCustomer">Mở khách đang chọn</button></div></section>
    <section class="panel aipp-tool-card"><h3>📋 Checklist hồ sơ</h3><p class="muted">Bật/tắt loại giấy tờ trong Cài đặt; đánh dấu trực tiếp tại hồ sơ từng khách.</p><div class="tool-row"><button class="primary" id="openDocSettings">Cài checklist</button></div></section>
   </div>
   <div id="toolLoan" class="aipp-tools-grid aipp-tool-section">
    <section class="panel aipp-tool-card wide"><h3>🧮 Công cụ tính khoản vay</h3><div class="aipp-filter-grid"><label class="field"><span>Số tiền vay</span><input id="loanAmount" type="number" value="100000000" min="0"></label><label class="field"><span>Thời hạn (tháng)</span><input id="loanMonths" type="number" value="24" min="1"></label><label class="field"><span>Lãi suất (%/năm)</span><input id="loanRate" type="number" value="12" min="0" step="0.01"></label><label class="field"><span>Cách tính</span><select id="loanMode"><option value="annuity">Trả góp đều (ước tính)</option><option value="flat">Lãi phẳng (ước tính)</option></select></label></div><div class="tool-row"><button class="primary" id="loanCalc">Tính khoản vay</button></div><div id="loanResult" class="aipp-summary"></div><p class="muted">Kết quả chỉ là ước tính, không thay thế bảng tính/lịch trả nợ chính thức của đơn vị cho vay.</p></section>
   </div>
   <div id="toolBackup" class="aipp-tools-grid aipp-tool-section">
    <section class="panel aipp-tool-card"><h3>💾 Backup tự động nội bộ</h3><label class="toggle-row"><div><strong>Tự tạo snapshot mỗi ngày</strong><p>Lưu tối đa 5 bản gần nhất trong bộ nhớ AIPP.</p></div><input id="autoBackupToggle" type="checkbox"></label><div class="tool-row"><button class="primary" id="backupNow2">Tạo snapshot ngay</button><button class="secondary" id="restoreLatest">Khôi phục bản gần nhất</button></div><div id="backupInfo" class="muted"></div></section>
    <section class="panel aipp-tool-card"><h3>📲 Chuyển dữ liệu máy</h3><p class="muted">Xuất file backup toàn bộ hoặc nhập lại file JSON trên máy mới.</p><div class="tool-row"><button class="primary" id="transferExport">Xuất file chuyển máy</button><button class="secondary" id="transferImport">Nhập file backup</button></div></section>
   </div>`;
  q('main.main')?.appendChild(sec);
  qa('[data-tool-tab]').forEach(x=>x.onclick=()=>{qa('[data-tool-tab]').forEach(y=>y.classList.toggle('active',y===x));qa('.aipp-tool-section').forEach(y=>y.classList.remove('active'));q('#tool'+x.dataset.toolTab[0].toUpperCase()+x.dataset.toolTab.slice(1))?.classList.add('active');});
 }
 let lastFiltered=[];
 function populateFilters(){
  const set=(id,arr,label)=>{const e=q(id);if(!e)return;const old=e.value;e.innerHTML=`<option value="">${label}</option>`+[...new Set(arr.filter(Boolean))].sort().map(v=>`<option value="${safe(v)}">${safe(v)}</option>`).join('');e.value=old;};
  set('#tfSource',state.customers.map(c=>c.source),'Tất cả nguồn');set('#tfStatus',state.customers.map(c=>c.status),'Tất cả trạng thái');set('#tfLevel',state.customers.map(c=>c.level||c.leadLevel),'Tất cả mức độ');
 }
 function filtered(){
  const text=(q('#tfText')?.value||'').trim().toLowerCase(),src=q('#tfSource')?.value||'',st=q('#tfStatus')?.value||'',lv=q('#tfLevel')?.value||'',af=q('#tfAddedFrom')?.value,at=q('#tfAddedTo')?.value,ff=q('#tfFollowFrom')?.value,ft=q('#tfFollowTo')?.value,sm=q('#tfSms')?.value||'';
  return state.customers.filter(c=>{const hay=[c.name,c.phone,...(c.tags||[])].join(' ').toLowerCase();const cd=(c.createdAt||'').slice(0,10),fd=(c.followup||'').slice(0,10);return(!text||hay.includes(text))&&(!src||c.source===src)&&(!st||c.status===st)&&(!lv||(c.level||c.leadLevel)===lv)&&(!af||cd>=af)&&(!at||cd<=at)&&(!ff||fd>=ff)&&(!ft||fd<=ft)&&(!sm||smsState(c)===sm);});
 }
 function renderResult(list){lastFiltered=list;const e=q('#tfResult');if(!e)return;e.innerHTML=`<div class="muted" style="padding:8px 0">Tìm thấy <b>${list.length}</b> khách</div>`+(list.length?list.slice(0,300).map(c=>`<div class="aipp-result-item"><div><strong>${safe(c.name)}</strong><small>${safe(c.phone)} • ${safe(c.source||'Không nguồn')} • ${safe(c.status||'')}</small><div class="aipp-tags">${(c.tags||[]).map(t=>`<span class="aipp-tag">${safe(t)}</span>`).join('')}</div></div><button class="secondary small" data-tool-open="${c.id}">Mở</button></div>`).join(''):'');}
 function saveList(name,ids){if(!name)return;state.customLists.push({id:rid(),name,customerIds:[...new Set(ids)],createdAt:new Date().toISOString()});persist();renderLists();toast('Đã lưu danh sách');}
 function renderLists(){const e=q('#customLists');if(!e)return;e.innerHTML=state.customLists.length?state.customLists.map(l=>`<div class="aipp-list-name"><div><strong>${safe(l.name)}</strong><small>${l.customerIds.length} khách</small></div><div><button class="secondary small" data-list-open="${l.id}">Xem</button> <button class="danger small" data-list-del="${l.id}">×</button></div></div>`).join(''):'<div class="muted">Chưa có danh sách.</div>';}
 function selected(){return state.customers.find(c=>c.id===selectedCustomerId);}
 function renderTags(){const c=selected(),e=q('#tagCurrent');if(e)e.innerHTML=c?`<p class="muted">Đang chọn: <b>${safe(c.name)}</b></p><div class="aipp-tags">${(c.tags||[]).map(t=>`<button class="aipp-tag" data-tag-remove="${safe(t)}">${safe(t)} ×</button>`).join('')||'<span class="muted">Chưa có tag</span>'}</div>`:'<div class="muted">Chưa chọn khách.</div>';}
 function download(name,type,text){const a=document.createElement('a'),u=URL.createObjectURL(new Blob([text],{type}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
 function rowsFor(list){return list.map(c=>({Tên:c.name,SĐT:c.phone,Nguồn:c.source||'',Trạng_thái:c.status||'',Mức_độ:c.level||c.leadLevel||'',Ngày_thêm:(c.createdAt||'').slice(0,10),Ngày_hẹn:(c.followup||'').slice(0,16),Tags:(c.tags||[]).join(';'),Công_ty:c.profile?.company||'',Nghề_nghiệp:c.profile?.occupation||'',Thu_nhập:c.profile?.income||'',Khu_vực:c.profile?.area||c.profile?.region||'',Sản_phẩm:c.product||c.profile?.product||''}));}
 function csv(list){const r=rowsFor(list),keys=Object.keys(r[0]||{Tên:'',SĐT:''});const cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';return '\ufeff'+[keys.map(cell).join(','),...r.map(x=>keys.map(k=>cell(x[k])).join(','))].join('\r\n');}
 function xls(list){const r=rowsFor(list),keys=Object.keys(r[0]||{Tên:'',SĐT:''});return `<html><head><meta charset="utf-8"></head><body><table><tr>${keys.map(k=>`<th>${safe(k)}</th>`).join('')}</tr>${r.map(x=>`<tr>${keys.map(k=>`<td>${safe(x[k])}</td>`).join('')}</tr>`).join('')}</table></body></html>`;}
 function snapshot(manual=false){initData();const copy=JSON.stringify({...state,toolSettings:{...state.toolSettings,backups:[]}});state.toolSettings.backups.unshift({at:new Date().toISOString(),data:copy});state.toolSettings.backups=state.toolSettings.backups.slice(0,5);state.toolSettings.lastBackupAt=new Date().toISOString();persist();if(manual)toast('Đã tạo snapshot nội bộ');renderBackup();}
 function renderBackup(){const s=state.toolSettings,e=q('#backupInfo');if(q('#autoBackupToggle'))q('#autoBackupToggle').checked=!!s.autoBackup;if(e)e.textContent=s.backups.length?`${s.backups.length} bản • Gần nhất ${new Date(s.backups[0].at).toLocaleString('vi-VN')}`:'Chưa có snapshot.';}
 function autoBackup(){initData();if(!state.toolSettings.autoBackup)return;const last=new Date(state.toolSettings.lastBackupAt||0).getTime();if(!last||Date.now()-last>=86400000)snapshot(false);}
 function renderTools(){initData();populateFilters();renderResult(lastFiltered.length?lastFiltered:state.customers);renderLists();renderTags();renderBackup();}
 function bind(){
  q('#tfRun').onclick=()=>renderResult(filtered());q('#tfClear').onclick=()=>{qa('#toolCustomers input,#toolCustomers select').forEach(x=>x.value='');renderResult(state.customers);};q('#tfSaveList').onclick=()=>{const n=prompt('Tên danh sách:','Danh sách '+new Date().toLocaleDateString('vi-VN'));if(n)saveList(n,(lastFiltered.length?lastFiltered:filtered()).map(c=>c.id));};
  qa('[data-stale]').forEach(b=>b.onclick=()=>{const n=+b.dataset.stale,l=state.customers.filter(c=>daysOld(c)>=n);renderResult(l);q('#staleSummary').textContent=`${l.length} khách từ ${n} ngày chưa tương tác`;});
  q('#remarketingBtn').onclick=()=>{const l=state.customers.filter(c=>daysOld(c)>=14||['Đã gửi SMS','Đã gửi Zalo','Hoàn tất','Không nhu cầu'].includes(c.status));const n='Chăm sóc lại - '+new Date().toLocaleDateString('vi-VN');saveList(n,l.map(c=>c.id));q('#remarketingSummary').textContent=`Đã tạo ${l.length} khách`;};
  q('#tagAddBtn').onclick=()=>{const c=selected(),v=q('#tagValue').value.trim();if(!c)return toast('Hãy chọn một khách trước');if(!v)return toast('Nhập tên tag');c.tags=c.tags||[];if(!c.tags.includes(v))c.tags.push(v);persist();q('#tagValue').value='';renderTags();renderResult(lastFiltered);};
  q('#newEmptyList').onclick=()=>{const n=prompt('Tên danh sách:');if(n)saveList(n,[]);};
  q('#toolImport').onclick=()=>{const b=q('#importInput');if(b)b.click();};q('#toolPaste').onclick=()=>{const b=q('#ppPasteBtn')||q('[data-paste-customers]');if(b)b.click();else toast('Không tìm thấy công cụ Dán');};
  qa('[data-export-kind]').forEach(b=>b.onclick=()=>{const k=b.dataset.exportKind,list=k.endsWith('filter')?lastFiltered:state.customers,date=new Date().toISOString().slice(0,10);if(k.startsWith('csv'))download(`AIPP-khach-${date}.csv`,'text/csv;charset=utf-8',csv(list));else download(`AIPP-khach-${date}.xls`,'application/vnd.ms-excel',xls(list));});
  q('#openProfileSettings').onclick=q('#openDocSettings').onclick=()=>{showView('settings');q('#pageTitle').textContent='Cài đặt';};q('#openSelectedCustomer').onclick=()=>{if(!selected())return toast('Chưa chọn khách');showView('customers');renderAll();};
  q('#loanCalc').onclick=()=>{const P=+q('#loanAmount').value||0,n=Math.max(1,+q('#loanMonths').value||1),annual=+q('#loanRate').value||0,mode=q('#loanMode').value;let pay,total,interest;if(mode==='flat'){interest=P*(annual/100)*(n/12);total=P+interest;pay=total/n;}else{const r=annual/1200;pay=r?P*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1):P/n;total=pay*n;interest=total-P;}q('#loanResult').innerHTML=`<div><span>Trả/tháng</span><strong>${Math.round(pay).toLocaleString('vi-VN')}đ</strong></div><div><span>Tổng trả</span><strong>${Math.round(total).toLocaleString('vi-VN')}đ</strong></div><div><span>Tổng lãi</span><strong>${Math.round(interest).toLocaleString('vi-VN')}đ</strong></div><div><span>Thời hạn</span><strong>${n} tháng</strong></div>`;};
  q('#autoBackupToggle').onchange=e=>{state.toolSettings.autoBackup=e.target.checked;persist();renderBackup();};q('#backupNow2').onclick=()=>snapshot(true);q('#restoreLatest').onclick=()=>{const b=state.toolSettings.backups[0];if(!b)return toast('Chưa có snapshot');if(!confirm('Khôi phục snapshot gần nhất?'))return;try{state=migrateState(JSON.parse(b.data));initData();selectedCustomerId=state.customers[0]?.id||null;save();toast('Đã khôi phục snapshot')}catch{toast('Snapshot bị lỗi')}};
  q('#transferExport').onclick=()=>download(`AIPP-transfer-${new Date().toISOString().slice(0,10)}.json`,'application/json',JSON.stringify(state,null,2));q('#transferImport').onclick=()=>q('#ppRestoreInput')?.click();
  document.addEventListener('click',e=>{const o=e.target.closest('[data-tool-open]');if(o){selectedCustomerId=o.dataset.toolOpen;showView('customers');renderAll();return}const lr=e.target.closest('[data-list-open]');if(lr){const l=state.customLists.find(x=>x.id===lr.dataset.listOpen);if(l)renderResult(l.customerIds.map(id=>state.customers.find(c=>c.id===id)).filter(Boolean));return}const ld=e.target.closest('[data-list-del]');if(ld){state.customLists=state.customLists.filter(x=>x.id!==ld.dataset.listDel);persist();renderLists();return}const tr=e.target.closest('[data-tag-remove]');if(tr){const c=selected();if(c){c.tags=(c.tags||[]).filter(x=>x!==tr.dataset.tagRemove);persist();renderTags();renderResult(lastFiltered);}return}});
 }
 initData();addUI();bind();autoBackup();renderTools();
 const oldRenderAll=renderAll;renderAll=function(){oldRenderAll();initData();if(q('#toolsView')?.classList.contains('active'))renderTools();};
})();

/* ===== AIPP V5.6.1: linked phones + customer documents (direct detail integration) ===== */
(()=>{
  const baseRenderDetail=renderDetail;
  const phoneNorm=v=>normalizePhone(String(v||''));
  const customerByAnyPhone=(p,except='')=>{const n=phoneNorm(p);return state.customers.find(c=>c.id!==except&&(phoneNorm(c.phone)===n||(c.extraPhones||[]).some(x=>phoneNorm(x)===n)));};
  const v561Persist=()=>localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  function phoneSection(c){
    const extras=(c.extraPhones||[]).filter(Boolean);
    return `<div class="aipp-v561-block"><div class="aipp-v561-head"><b>📱 Số điện thoại</b><button type="button" class="secondary small" data-v561-add-phone="${esc(c.id)}">+ Thêm SĐT</button></div>
      <div class="aipp-v561-phone"><div><strong>${esc(c.phone)}</strong><div class="meta">SĐT chính</div></div><div class="aipp-v561-actions"><a class="secondary small" href="${esc(telHref(c.phone))}">📞</a><a class="secondary small" href="${esc(smsHref(c.phone,''))}">✉️</a></div></div>
      ${extras.length?extras.map(p=>`<div class="aipp-v561-phone"><div><strong>${esc(p)}</strong><div class="meta">SĐT phụ</div></div><div class="aipp-v561-actions"><a class="secondary small" href="${esc(telHref(p))}">📞</a><a class="secondary small" href="${esc(smsHref(p,''))}">✉️</a><button type="button" class="secondary small" data-v561-primary="${esc(p)}">Đặt chính</button><button type="button" class="danger small" data-v561-del-phone="${esc(p)}">Xóa</button></div></div>`).join(''):'<div class="muted">Chưa có SĐT phụ.</div>'}
    </div>`;
  }
  function docSection(c){
    const docs=c.legacyDocuments||[];
    return `<div class="aipp-v561-block"><div class="aipp-v561-head"><b>📎 Tài liệu khách</b><button type="button" class="secondary small" data-v561-add-doc="${esc(c.id)}">+ Thêm tài liệu</button></div>
      ${docs.length?docs.map(d=>`<div class="aipp-v561-doc"><div><strong>${esc(d.name||'Tài liệu')}</strong><div class="meta">${esc(d.type||'Hồ sơ khác')} • ${esc(d.sizeLabel||'')}</div></div><div class="aipp-v561-actions"><button type="button" class="secondary small" data-v561-open-doc="${esc(d.id)}">Mở</button><button type="button" class="danger small" data-v561-del-doc="${esc(d.id)}">Xóa</button></div></div>`).join(''):'<div class="muted">Chưa có tài liệu.</div>'}
      <input id="v561DocPicker" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" hidden>
    </div>`;
  }
  renderDetail=function(){
    baseRenderDetail(); const c=state.customers.find(x=>x.id===selectedCustomerId), panel=document.querySelector('#detailPanel'); if(!c||!panel)return;
    panel.querySelectorAll('.aipp-v561-block').forEach(x=>x.remove());
    const marker=panel.querySelector('.aipp-detail-end-marker');
    const box=document.createElement('div'); box.innerHTML=phoneSection(c)+docSection(c);
    const frag=document.createDocumentFragment(); while(box.firstChild)frag.appendChild(box.firstChild);
    marker?marker.before(frag):panel.appendChild(frag);
  };
  const oldRenderCustomers=renderCustomers;
  renderCustomers=function(){
    const q=(document.querySelector('#globalSearch')?.value||'').trim();
    if(q){const n=phoneNorm(q); if(n){state.customers.forEach(c=>{if((c.extraPhones||[]).some(p=>phoneNorm(p).includes(n))&&!phoneNorm(c.phone).includes(n)&&!String(c.name||'').toLowerCase().includes(q.toLowerCase())) c.__v561AliasMatch=true; else delete c.__v561AliasMatch;});}}
    oldRenderCustomers();
    if(q){const list=document.querySelector('#customerList'); const n=phoneNorm(q); if(list&&n){state.customers.filter(c=>c.__v561AliasMatch).forEach(c=>{if(!list.querySelector(`[data-customer-id="${CSS.escape(c.id)}"]`)){const d=document.createElement('div');d.className='customer-row';d.dataset.customerId=c.id;d.innerHTML=`<div><strong>${esc(c.name)}</strong><div class="meta">${esc(c.phone)} • SĐT phụ khớp: ${esc((c.extraPhones||[]).find(p=>phoneNorm(p).includes(n))||'')}</div></div><span class="status-pill ${statusClass(c.status)}">${esc(c.status)}</span>`;list.appendChild(d);}});}}
  };
  document.addEventListener('click',e=>{
    const c=state.customers.find(x=>x.id===selectedCustomerId); if(!c)return;
    const add=e.target.closest('[data-v561-add-phone]'); if(add){let p=prompt('Nhập SĐT phụ:',''); if(!p)return; p=phoneNorm(p); if(!classifyPhone(p).valid){toast('SĐT chưa đúng định dạng');return} if(phoneNorm(c.phone)===p||(c.extraPhones||[]).some(x=>phoneNorm(x)===p)){toast('SĐT đã có trong hồ sơ');return} const owner=customerByAnyPhone(p,c.id); if(owner){toast(`SĐT đã thuộc khách ${owner.name}`);return} c.extraPhones=[...(c.extraPhones||[]),p];v561Persist();renderDetail();toast('Đã thêm SĐT phụ');return;}
    const pri=e.target.closest('[data-v561-primary]'); if(pri){const p=pri.dataset.v561Primary,old=c.phone;c.phone=p;c.extraPhones=(c.extraPhones||[]).filter(x=>x!==p);if(old&&!c.extraPhones.includes(old))c.extraPhones.unshift(old);c.updatedAt=new Date().toISOString();v561Persist();renderAll();toast('Đã đổi SĐT chính');return;}
    const del=e.target.closest('[data-v561-del-phone]'); if(del){c.extraPhones=(c.extraPhones||[]).filter(x=>x!==del.dataset.v561DelPhone);v561Persist();renderDetail();toast('Đã xóa SĐT phụ');return;}
    const ad=e.target.closest('[data-v561-add-doc]'); if(ad){document.querySelector('#v561DocPicker')?.click();return;}
    const od=e.target.closest('[data-v561-open-doc]'); if(od){const d=(c.legacyDocuments||[]).find(x=>x.id===od.dataset.v561OpenDoc);if(d?.dataUrl){const a=document.createElement('a');a.href=d.dataUrl;a.download=d.name||'tai-lieu';a.target='_blank';a.click();}else toast('Không tìm thấy dữ liệu tài liệu');return;}
    const dd=e.target.closest('[data-v561-del-doc]'); if(dd){if(!confirm('Xóa tài liệu này?'))return;c.legacyDocuments=(c.legacyDocuments||[]).filter(x=>x.id!==dd.dataset.v561DelDoc);v561Persist();renderDetail();toast('Đã xóa tài liệu');return;}
  });
  document.addEventListener('change',e=>{
    if(e.target.id!=='v561DocPicker')return; const f=e.target.files?.[0],c=state.customers.find(x=>x.id===selectedCustomerId);if(!f||!c)return;
    if(f.size>1200*1024){toast('V5.6.1: tài liệu tối đa 1,2 MB/file');e.target.value='';return;}
    const type=prompt('Loại tài liệu (CCCD / Sao kê / HĐLĐ / Bảng lương / Hồ sơ khác):','Hồ sơ khác')||'Hồ sơ khác';
    const r=new FileReader();r.onload=()=>{try{c.legacyDocuments=[...(c.legacyDocuments||[]),{id:(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)),name:f.name,type,size:f.size,sizeLabel:(f.size/1024).toFixed(0)+' KB',mime:f.type,addedAt:new Date().toISOString(),dataUrl:r.result}];v561Persist();renderDetail();toast('Đã thêm tài liệu')}catch(err){toast('Không đủ bộ nhớ lưu tài liệu')}};r.onerror=()=>toast('Không đọc được tài liệu');r.readAsDataURL(f);
  });
  const st=document.createElement('style');st.textContent=`.aipp-v561-block{margin-top:14px;padding:14px;border:1px solid var(--border,#dfe3e8);border-radius:14px;background:var(--card,#fff)}.aipp-v561-head,.aipp-v561-phone,.aipp-v561-doc{display:flex;align-items:center;justify-content:space-between;gap:10px}.aipp-v561-head{margin-bottom:10px}.aipp-v561-phone,.aipp-v561-doc{padding:10px 0;border-top:1px solid rgba(127,127,127,.15)}.aipp-v561-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.aipp-v561-actions a{text-decoration:none}@media(max-width:520px){.aipp-v561-phone,.aipp-v561-doc{align-items:flex-start;flex-direction:column}.aipp-v561-actions{width:100%}}`;document.head.appendChild(st);
  setTimeout(()=>{if(selectedCustomerId)renderDetail()},0);
})();
/* V5.6.1 preserve linked phones/documents when editing base customer fields */
(()=>{const prev=saveCustomer;saveCustomer=function(){const id=document.querySelector('#customerId')?.value||'',old=state.customers.find(c=>c.id===id),extras=old?[...(old.extraPhones||[])]:[],docs=old?(Array.isArray(old.legacyDocuments)?[...old.legacyDocuments]:[]):[];const ok=prev();if(ok){const c=state.customers.find(x=>x.id===(id||selectedCustomerId));if(c){c.extraPhones=extras;c.legacyDocuments=docs;if(!c.documents||Array.isArray(c.documents))c.documents={};save({render:false});renderAll();}}return ok;};})();

/* ===== AIPP V5.6.2: checklist images (image-only, separate from checklist state) ===== */
(()=>{
  const persist562=()=>localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  let pending={customerId:'',docId:''};
  const picker=document.createElement('input');
  picker.type='file'; picker.accept='image/*'; picker.multiple=true; picker.id='v562ImagePicker'; picker.hidden=true; document.body.appendChild(picker);
  const imageId=()=>globalThis.crypto?.randomUUID?.()||('img_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8));
  function ensure(c){ if(!c.documentImages||Array.isArray(c.documentImages)) c.documentImages={}; return c.documentImages; }
  function removeOldDocBlock(panel){
    panel.querySelectorAll('.aipp-v561-block').forEach(b=>{if((b.textContent||'').includes('Tài liệu khách'))b.remove();});
  }
  function enhanceChecklist(){
    const c=state.customers.find(x=>x.id===selectedCustomerId),panel=document.querySelector('#detailPanel'); if(!c||!panel)return;
    removeOldDocBlock(panel); const imgs=ensure(c);
    panel.querySelectorAll('.pp-checklist .doc-check').forEach(label=>{
      if(label.closest('.v562-doc-item'))return;
      const input=label.querySelector('[data-customer-doc]'); if(!input)return; const docId=input.dataset.customerDoc;
      const item=document.createElement('div'); item.className='v562-doc-item';
      label.parentNode.insertBefore(item,label); item.appendChild(label);
      const add=document.createElement('button'); add.type='button'; add.className='secondary small v562-add'; add.dataset.v562AddImage=docId; add.textContent='📷 Thêm ảnh'; item.appendChild(add);
      const gallery=document.createElement('div'); gallery.className='v562-gallery';
      (imgs[docId]||[]).forEach(im=>{const card=document.createElement('div');card.className='v562-thumb';card.innerHTML=`<button type="button" class="v562-img-open" data-v562-open="${esc(im.id)}" data-v562-doc="${esc(docId)}"><img src="${im.dataUrl}" alt="Ảnh hồ sơ"></button><button type="button" class="v562-img-del" data-v562-del="${esc(im.id)}" data-v562-doc="${esc(docId)}" aria-label="Xóa ảnh">×</button>`;gallery.appendChild(card);});
      if(!(imgs[docId]||[]).length){const empty=document.createElement('span');empty.className='muted v562-empty';empty.textContent='Chưa có ảnh';gallery.appendChild(empty);}
      item.appendChild(gallery);
    });
  }
  const prevRender=renderDetail; renderDetail=function(){prevRender();enhanceChecklist();};
  function compress(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=reject;r.onload=()=>{const im=new Image();im.onerror=reject;im.onload=()=>{let w=im.width,h=im.height,max=1280;if(w>max||h>max){const s=Math.min(max/w,max/h);w=Math.round(w*s);h=Math.round(h*s);}const cv=document.createElement('canvas');cv.width=w;cv.height=h;cv.getContext('2d').drawImage(im,0,0,w,h);resolve(cv.toDataURL('image/jpeg',.76));};im.src=r.result;};r.readAsDataURL(file);});}
  document.addEventListener('click',e=>{
    const add=e.target.closest('[data-v562-add-image]'); if(add){pending={customerId:selectedCustomerId,docId:add.dataset.v562AddImage};picker.value='';picker.click();return;}
    const op=e.target.closest('[data-v562-open]'); if(op){const c=state.customers.find(x=>x.id===selectedCustomerId),im=ensure(c)?.[op.dataset.v562Doc]?.find(x=>x.id===op.dataset.v562Open);if(!im)return;let modal=document.querySelector('#v562ImageModal');if(!modal){modal=document.createElement('div');modal.id='v562ImageModal';modal.className='v562-modal';modal.innerHTML='<div class="v562-modal-box"><button type="button" class="v562-close">×</button><img alt="Ảnh hồ sơ"></div>';document.body.appendChild(modal);}modal.querySelector('img').src=im.dataUrl;modal.classList.add('show');return;}
    if(e.target.closest('.v562-close')||e.target.id==='v562ImageModal'){document.querySelector('#v562ImageModal')?.classList.remove('show');return;}
    const del=e.target.closest('[data-v562-del]'); if(del){const c=state.customers.find(x=>x.id===selectedCustomerId);if(!c||!confirm('Xóa ảnh hồ sơ này?'))return;const m=ensure(c);m[del.dataset.v562Doc]=(m[del.dataset.v562Doc]||[]).filter(x=>x.id!==del.dataset.v562Del);persist562();renderDetail();toast('Đã xóa ảnh');return;}
  });
  picker.addEventListener('change',async()=>{const files=[...(picker.files||[])],c=state.customers.find(x=>x.id===pending.customerId);if(!files.length||!c||!pending.docId)return;const valid=files.filter(f=>String(f.type||'').startsWith('image/'));if(!valid.length){toast('Chỉ chọn hình ảnh');return;}try{toast('Đang xử lý '+valid.length+' ảnh...');const m=ensure(c),added=[];for(const f of valid){const dataUrl=await compress(f);added.push({id:imageId(),name:f.name||'Ảnh hồ sơ',addedAt:new Date().toISOString(),dataUrl});}m[pending.docId]=[...(m[pending.docId]||[]),...added];persist562();renderDetail();toast('Đã thêm '+added.length+' ảnh hồ sơ');}catch(err){toast('Không đọc được hình ảnh');}});
  const oldSave562=saveCustomer; saveCustomer=function(){const id=document.querySelector('#customerId')?.value||'',old=state.customers.find(c=>c.id===id),images=old?JSON.parse(JSON.stringify(old.documentImages||{})):{};const ok=oldSave562();if(ok){const c=state.customers.find(x=>x.id===(id||selectedCustomerId));if(c){c.documentImages=images;persist562();renderAll();}}return ok;};
  const css=document.createElement('style');css.textContent=`.v562-doc-item{display:grid;grid-template-columns:1fr auto;gap:8px 10px;align-items:center;border-bottom:1px solid var(--line)}.v562-doc-item:last-child{border-bottom:0}.v562-doc-item>.doc-check{border:0!important}.v562-add{white-space:nowrap}.v562-gallery{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap;padding:0 2px 10px}.v562-thumb{width:72px;height:72px;border-radius:12px;overflow:hidden;position:relative;border:1px solid var(--line);background:#f5f5f5}.v562-img-open{padding:0!important;border:0!important;background:transparent!important;width:100%;height:100%}.v562-thumb img{width:100%;height:100%;object-fit:cover;display:block}.v562-img-del{position:absolute;right:3px;top:3px;width:24px;height:24px;padding:0!important;border:0;border-radius:50%;background:rgba(0,0,0,.65);color:#fff;font-size:18px;line-height:22px}.v562-empty{font-size:13px;padding:3px 0}.v562-modal{display:none;position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.82);align-items:center;justify-content:center;padding:18px}.v562-modal.show{display:flex}.v562-modal-box{position:relative;max-width:100%;max-height:100%}.v562-modal img{max-width:100%;max-height:85vh;border-radius:12px;display:block}.v562-close{position:absolute;right:-8px;top:-8px;z-index:2;width:38px;height:38px;border:0;border-radius:50%;font-size:26px;background:#fff;color:#111}@media(max-width:520px){.v562-doc-item{grid-template-columns:1fr auto}.v562-add{font-size:13px;padding:9px 10px}}`;document.head.appendChild(css);
  setTimeout(()=>{if(selectedCustomerId)renderDetail()},0);
})();

/* ===== AIPP V5.8 REDESIGN: navigation settings + tabbed customer detail ===== */
(()=>{
  function setupSettingsHub(){
    const view=document.querySelector('#settingsView'), stack=view?.querySelector('.settings-stack');
    if(!view||!stack||view.querySelector('.v58-settings-shell'))return;
    const panels=[...stack.querySelectorAll(':scope > .panel')];
    const shell=document.createElement('div'); shell.className='v58-settings-shell';
    shell.innerHTML=`<div class="v58-settings-home">
      <div class="v58-settings-hero"><div><b>Cài đặt AIPP</b><span>Chọn một mục để thay đổi</span></div><span>⚙️</span></div>
      <div class="v58-settings-menu">
        <button data-v58-setting="appearance"><i>🎨</i><span><b>Giao diện & hiển thị</b><small>Sáng/tối, cỡ chữ và mật độ danh sách</small></span><em>›</em></button>
        <button data-v58-setting="customer"><i>👤</i><span><b>Hồ sơ khách</b><small>Trường thông tin và checklist giấy tờ</small></span><em>›</em></button>
        <button data-v58-setting="system"><i>📱</i><span><b>SMS & quyền riêng tư</b><small>Gửi SMS và chế độ riêng tư</small></span><em>›</em></button>
        <button data-v58-setting="backup"><i>💾</i><span><b>Dữ liệu & ứng dụng</b><small>Backup, khôi phục và thông tin AIPP</small></span><em>›</em></button>
        <button data-v58-setting="guide"><i>📖</i><span><b>Hướng dẫn sử dụng</b><small>Hình minh họa + ví dụ từng thao tác</small></span><em>›</em></button>
      </div></div>
      <div class="v58-settings-pages"></div>`;
    stack.replaceWith(shell); const pages=shell.querySelector('.v58-settings-pages');
    const mk=(id,title)=>{const p=document.createElement('section');p.className='v58-settings-page';p.dataset.v58Page=id;p.innerHTML=`<div class="v58-page-head"><button type="button" data-v58-settings-back>‹</button><div><b>${title}</b><small>Cài đặt được lưu trên thiết bị</small></div></div><div class="v58-page-body"></div>`;pages.appendChild(p);return p.querySelector('.v58-page-body')};
    const a=mk('appearance','Giao diện & hiển thị'),c=mk('customer','Hồ sơ khách'),s=mk('system','SMS & quyền riêng tư'),b=mk('backup','Dữ liệu & ứng dụng'),g=mk('guide','Hướng dẫn sử dụng');
    panels.forEach(p=>{const t=(p.querySelector('h3')?.textContent||'').toLowerCase();if(t.includes('giao diện')||t.includes('hiển thị chức năng')||t.includes('tổng quan'))a.appendChild(p);else if(t.includes('hồ sơ khách')||t.includes('checklist'))c.appendChild(p);else if(t.includes('quyền riêng tư')||t.includes('sms android')||t.includes('kết nối api'))s.appendChild(p);else b.appendChild(p)});
    g.innerHTML=`<div class="v58-guide-intro"><b>📖 Làm quen với AIPP</b><span>Chạm từng hướng dẫn để xem ví dụ trực quan.</span></div>${[
      ['👤','Thêm & sửa khách','Vào Khách → nhấn + Thêm khách → nhập tên và SĐT → Lưu.','Nguyễn Văn An','0901234567','+ Thêm khách'],
      ['📞','Gọi • Zalo • SMS','Mở Chi tiết khách → tab Liên hệ → chọn đúng kênh cần dùng.','Nguyễn Văn An','📞  Gọi   💬  Zalo   ✉️  SMS','Liên hệ'],
      ['🗓','Nhắc/Gửi sau','Trong khách, chọn Nhắc/Gửi sau → chọn thời gian → lưu lịch.','Hẹn khách','29/09 • 09:30','Lưu lịch'],
      ['📄','Checklist & ảnh hồ sơ','Mở tab Hồ sơ → tick giấy tờ đã có → nhấn Thêm ảnh đúng loại.','CCCD  ☑','📷 Thêm ảnh','Hồ sơ'],
      ['📱','Thêm SĐT phụ','Mở tab Liên hệ → Số điện thoại → + Thêm SĐT.','0901234567','0987654321','+ Thêm SĐT'],
      ['📥','Nhập / Dán dữ liệu','Ở màn Khách dùng Nhập hoặc Dán để thêm nhiều khách nhanh.','Tên | SĐT','An | 0901234567','📋 Dán'],
      ['💾','Sao lưu dữ liệu','Vào Cài đặt → Dữ liệu & ứng dụng → Tạo backup trước khi đổi máy.','AIPP Backup','Khách • Lịch • Mẫu tin','Tạo backup']
    ].map(x=>`<details class="v58-guide-card"><summary><i>${x[0]}</i><span><b>${x[1]}</b><small>${x[2]}</small></span><em>⌄</em></summary><div class="v58-guide-content"><div class="v58-guide-shot"><div class="v58-shot-top">AIPP</div><div class="v58-shot-card"><b>${x[3]}</b><span>${x[4]}</span><button>${x[5]}</button></div><div class="v58-shot-nav">▣　👥　🤖　💬　⚙</div></div><p><b>Ví dụ:</b> ${x[2]}</p></div></details>`).join('')}`;
    function openPage(id){shell.querySelector('.v58-settings-home').hidden=true;shell.querySelectorAll('.v58-settings-page').forEach(p=>p.classList.toggle('active',p.dataset.v58Page===id));window.scrollTo({top:0,behavior:'smooth'})}
    function home(){shell.querySelector('.v58-settings-home').hidden=false;shell.querySelectorAll('.v58-settings-page').forEach(p=>p.classList.remove('active'));window.scrollTo({top:0,behavior:'smooth'})}
    shell.addEventListener('click',e=>{const m=e.target.closest('[data-v58-setting]');if(m)openPage(m.dataset.v58Setting);if(e.target.closest('[data-v58-settings-back]'))home()});
    window.v58SettingsHome=home;
  }

  function organizeCustomerDetail(){
    const panel=document.querySelector('#detailPanel'),c=state.customers.find(x=>x.id===selectedCustomerId);if(!panel||!c)return;
    if(panel.querySelector('.v58-customer-tabs'))return;
    const summary=panel.querySelector('.customer-summary'); if(!summary)return;
    let keepDetailTab='overview';
    try{const saved=sessionStorage.getItem('aipp-customer-detail-tab');if(['overview','docs','contact'].includes(saved))keepDetailTab=saved}catch(_){}
    const tabs=document.createElement('div');tabs.className='v58-customer-tabs';tabs.innerHTML=`<button class="${keepDetailTab==='overview'?'active':''}" data-v58-tab="overview">Tổng quan</button><button class="${keepDetailTab==='docs'?'active':''}" data-v58-tab="docs">Hồ sơ</button><button class="${keepDetailTab==='contact'?'active':''}" data-v58-tab="contact">Liên hệ</button>`;
    const body=document.createElement('div');body.className='v58-tab-body';body.innerHTML=`<section class="v58-tab-pane ${keepDetailTab==='overview'?'active':''}" data-v58-pane="overview"></section><section class="v58-tab-pane ${keepDetailTab==='docs'?'active':''}" data-v58-pane="docs"></section><section class="v58-tab-pane ${keepDetailTab==='contact'?'active':''}" data-v58-pane="contact"></section>`;
    const anchor=panel.querySelector('.pp-level-select')||summary;anchor.insertAdjacentElement('afterend',tabs);tabs.insertAdjacentElement('afterend',body);
    const ov=body.querySelector('[data-v58-pane="overview"]'),docs=body.querySelector('[data-v58-pane="docs"]'),ct=body.querySelector('[data-v58-pane="contact"]');
    ['.quick-status-wrap','.info-grid','.note-box'].forEach(sel=>{const n=panel.querySelector(sel);if(n)ov.appendChild(n)});
    const extra=panel.querySelector('.pp-extra-profile');if(extra){const checklist=extra.querySelector('.pp-checklist');if(checklist)docs.appendChild(checklist);const grid=extra.querySelector('.pp-profile-grid');if(grid)ov.appendChild(grid);extra.remove()}
    const phone=[...panel.querySelectorAll('.aipp-v561-block')].find(n=>(n.textContent||'').includes('Số điện thoại'));if(phone)ct.appendChild(phone);
    const timeline=panel.querySelector('.pp-timeline');if(timeline)ct.appendChild(timeline);
    const actions=panel.querySelector('.contact-actions');if(actions)ct.insertAdjacentElement('afterbegin',actions);
    const secondary=panel.querySelector('.secondary-actions');if(secondary)ct.appendChild(secondary);
    if(!docs.children.length)docs.innerHTML='<div class="v58-empty">📄 Chưa bật mục hồ sơ nào.</div>';
    tabs.addEventListener('click',e=>{const b=e.target.closest('[data-v58-tab]');if(!b)return;const tab=b.dataset.v58Tab;try{sessionStorage.setItem('aipp-customer-detail-tab',tab)}catch(_){}tabs.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));body.querySelectorAll('.v58-tab-pane').forEach(x=>x.classList.toggle('active',x.dataset.v58Pane===tab));});
  }
  const oldRender58=renderDetail;renderDetail=function(){oldRender58();organizeCustomerDetail()};
  const oldShow58=showView;showView=function(name){oldShow58(name);if(name==='settings'){setupSettingsHub();window.v58SettingsHome?.()}if(name==='customers')setTimeout(organizeCustomerDetail,0)};
  setupSettingsHub(); if(selectedCustomerId)renderDetail();
})();

/* ===== AIPP V5.8.4 dashboard visibility hard-fix ===== */
(()=>{
  const DASH_KEYS=['total','need','potential','zaloUnknown','due'];
  const DASH_DEFAULTS={total:true,need:true,potential:true,zaloUnknown:true,due:true,todos:true,dueMessages:true,hot:true,report:true};
  function dashState(){
    state.settings=state.settings||{};
    state.settings.dashboardVisible={...DASH_DEFAULTS,...(state.settings.dashboardVisible||{})};
    return state.settings.dashboardVisible;
  }
  function tagStats(){
    document.querySelectorAll('#statsGrid .stat').forEach((el,i)=>{
      if(DASH_KEYS[i]) el.dataset.dashItem=DASH_KEYS[i];
    });
  }
  function setVisible(el,visible){ if(el) el.classList.toggle('hidden-by-setting',!visible); }
  function applyDashboardVisibilityFinal(){
    const d=dashState(); tagStats();
    DASH_KEYS.forEach(k=>setVisible(document.querySelector(`#statsGrid .stat[data-dash-item="${k}"]`),!!d[k]));
    setVisible(document.querySelector('#todoList')?.closest('.panel'),!!d.todos);
    setVisible(document.querySelector('#dueMessageList')?.closest('.panel'),!!d.dueMessages);
    setVisible(document.querySelector('#hotList')?.closest('.panel'),!!d.hot);
    setVisible(document.querySelector('#ppReport'),!!d.report);
    document.querySelector('#statsGrid')?.classList.toggle('aipp-five-stats',DASH_KEYS.filter(k=>d[k]).length===5);
  }
  const rs=renderStats; renderStats=function(){rs();applyDashboardVisibilityFinal();};
  const rt=renderTodos; renderTodos=function(){rt();applyDashboardVisibilityFinal();};
  const rdm=renderDueMessages; renderDueMessages=function(){rdm();applyDashboardVisibilityFinal();};
  const rh=renderHot; renderHot=function(){rh();applyDashboardVisibilityFinal();};
  const ra=renderAll; renderAll=function(){ra();applyDashboardVisibilityFinal();};
  document.addEventListener('change',e=>{
    if(e.target.matches('[data-aipp-dash]')) setTimeout(applyDashboardVisibilityFinal,0);
  });
  window.addEventListener('pageshow',applyDashboardVisibilityFinal);
  setTimeout(applyDashboardVisibilityFinal,150);
})();


/* ===== AIPP DATA-SAFE: preserve all customer extension fields on edit ===== */
(()=>{
  const previousSaveCustomerDataSafe=saveCustomer;
  saveCustomer=function(){
    const id=document.querySelector('#customerId')?.value||'';
    const before=id?state.customers.find(c=>c.id===id):null;
    const snapshot=before?structuredClone(before):null;
    const ok=previousSaveCustomerDataSafe();
    if(ok&&snapshot){
      const idx=state.customers.findIndex(c=>c.id===id);
      if(idx>=0){state.customers[idx]={...snapshot,...state.customers[idx]}; if(!save({render:false}))return false; renderAll();}
    }
    return ok;
  };
})();

/* ===== AIPP DATA-SAFE: native backup/restore ===== */
(()=>{
  let backupChunks=[];
  window.aippNativeBackupSaved=(ok,msg)=>toast(ok?'✅ Đã lưu file backup':'⚠️ '+(msg||'Không lưu được backup'),ok?3000:5000);
  window.aippNativeBackupChunk=(index,total,chunk)=>{
    backupChunks[index]=chunk||'';
    if(backupChunks.filter(x=>typeof x==='string').length!==total)return;
    try{
      const text=backupChunks.join(''); backupChunks=[];
      const raw=JSON.parse(text);
      if(!raw||!Array.isArray(raw.customers)||!Array.isArray(raw.templates)||!Array.isArray(raw.schedules)) throw new Error('Thiếu cấu trúc AIPP');
      if(!confirm(`Khôi phục backup gồm ${raw.customers.length} khách? Dữ liệu hiện tại sẽ được thay thế.`))return;
      const migrated=migrateState(raw);
      const previous=state; state=migrated;
      if(!save({render:false})){state=previous;throw new Error('Không đủ bộ nhớ để khôi phục');}
      selectedCustomerId=state.customers[0]?.id||null; renderAll(); toast('✅ Đã khôi phục backup thành công',3500);
    }catch(e){backupChunks=[];toast('⚠️ Backup không hợp lệ: '+(e.message||'không đọc được'),5000)}
  };
  window.aippNativeBackupError=msg=>toast('⚠️ '+(msg||'Không đọc được backup'),5000);
  function bindNativeRestore(){
    document.querySelectorAll('#ppRestoreBackup,#transferImport').forEach(btn=>{btn.onclick=e=>{e.preventDefault();try{if(window.AippAndroid&&typeof AippAndroid.openBackupPicker==='function'){AippAndroid.openBackupPicker();return}}catch(_){}document.querySelector('#ppRestoreInput')?.click();};});
  }
  const oldRenderAllDataSafe=renderAll; renderAll=function(){oldRenderAllDataSafe();setTimeout(bindNativeRestore,0)};
  setTimeout(bindNativeRestore,250);
})();


/* ===== AIPP UI + CARRIER UPGRADE ===== */
(()=>{
  const cf=document.querySelector('#carrierFilter');
  if(cf){cf.addEventListener('change',()=>renderCustomers());}
  // Keep carrier filter synced with normal customer re-render events without touching import logic.
  const oldRSF=renderSourceFilter;
  renderSourceFilter=function(){oldRSF(); if(cf && !cf.value) cf.value='';};
})();

/* ===== AIPP BATCH 1: Loan calculator + product fields + QR + diagnostics + post-update check ===== */
(()=>{
  const B1='aipp-batch1-20260929';
  state.settings=state.settings||{};
  state.settings.productSchemas=Array.isArray(state.settings.productSchemas)?state.settings.productSchemas:[];
  state.customers.forEach(c=>{c.productFields=c.productFields&&typeof c.productFields==='object'?c.productFields:{};});
  save({render:false});
  const money=n=>new Intl.NumberFormat('vi-VN').format(Math.round(Number(n)||0))+' đ';
  const productKey=s=>String(s||'').trim().toLowerCase();
  const schemaFor=p=>state.settings.productSchemas.find(s=>productKey(s.product)===productKey(p));

  function ensureDialogs(){
    if(!document.querySelector('#b1LoanDialog')){
      document.body.insertAdjacentHTML('beforeend',`<dialog id="b1LoanDialog"><form class="dialog-form" method="dialog"><div class="dialog-head"><div><h3>🧮 Máy tính khoản vay</h3><p class="muted" id="b1LoanCustomer"></p></div><button class="icon-btn" value="cancel">✕</button></div><div class="form-grid"><label class="field"><span>Số tiền vay</span><input id="b1LoanAmount" type="number" min="0" inputmode="numeric" placeholder="100000000"></label><label class="field"><span>Kỳ hạn (tháng)</span><input id="b1LoanMonths" type="number" min="1" max="120" value="24"></label><label class="field"><span>Lãi suất (%/năm)</span><input id="b1LoanRate" type="number" min="0" step="0.01" value="12"></label><label class="field"><span>Phương pháp</span><select id="b1LoanMethod"><option value="emi">Dư nợ giảm dần – trả đều (EMI)</option><option value="flat">Lãi phẳng – ước tính</option></select></label></div><div id="b1LoanResult" class="b1-loan-result"></div><p class="muted b1-disclaimer">⚠️ Kết quả chỉ mang tính ước tính/tham khảo. Khoản thanh toán thực tế phụ thuộc sản phẩm, phí và cách tính của đơn vị cho vay.</p><div class="dialog-actions"><button type="button" class="secondary" id="b1LoanCopy">Sao chép kết quả</button><button class="primary" value="cancel">Đóng</button></div></form></dialog>
      <dialog id="b1QrDialog"><div class="dialog-form"><div class="dialog-head"><div><h3>🔗 QR hồ sơ khách</h3><p class="muted" id="b1QrName"></p></div><button type="button" class="icon-btn" data-b1-close-qr>✕</button></div><div class="b1-qr-wrap"><img id="b1QrImage" alt="QR hồ sơ AIPP"><code id="b1QrCode"></code><p class="muted">QR chỉ chứa mã hồ sơ nội bộ, không chứa tên hay số điện thoại.</p></div><div class="dialog-actions"><button type="button" class="secondary" data-b1-close-qr>Đóng</button></div></div></dialog>
      <dialog id="b1DiagDialog"><div class="dialog-form"><div class="dialog-head"><div><h3>🩺 Chẩn đoán AIPP</h3><p class="muted">Kiểm tra nhanh tình trạng ứng dụng.</p></div><button type="button" class="icon-btn" data-b1-close-diag>✕</button></div><div id="b1DiagList" class="b1-check-list"></div><div class="dialog-actions"><button type="button" class="secondary" id="b1RunDiag">Kiểm tra lại</button><button type="button" class="primary" data-b1-close-diag>Đóng</button></div></div></dialog>
      <dialog id="b1SelfDialog"><div class="dialog-form"><div class="dialog-head"><div><h3>🧪 Kiểm tra sau cập nhật</h3><p class="muted">Không gọi thật và không gửi SMS thật.</p></div><button type="button" class="icon-btn" data-b1-close-self>✕</button></div><div id="b1SelfList" class="b1-check-list"></div><div class="dialog-actions"><button type="button" class="secondary" id="b1RunSelf">Chạy lại</button><button type="button" class="primary" data-b1-close-self>Đóng</button></div></div></dialog>`);
    }
  }
  function loanCalc(){
    const P=Number(document.querySelector('#b1LoanAmount')?.value)||0,n=Math.max(1,Number(document.querySelector('#b1LoanMonths')?.value)||1),annual=Math.max(0,Number(document.querySelector('#b1LoanRate')?.value)||0),method=document.querySelector('#b1LoanMethod')?.value||'emi';let monthly=0,total=0,interest=0;
    if(method==='flat'){interest=P*(annual/100)*(n/12);total=P+interest;monthly=total/n;}else{const r=annual/1200;monthly=r?P*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1):P/n;total=monthly*n;interest=total-P;}
    const txt=`Khoản vay: ${money(P)}\nKỳ hạn: ${n} tháng\nLãi suất: ${annual}%/năm\nTrả dự kiến/tháng: ${money(monthly)}\nTổng lãi dự kiến: ${money(interest)}\nTổng thanh toán dự kiến: ${money(total)}\n\nKết quả chỉ mang tính ước tính/tham khảo.`;
    const box=document.querySelector('#b1LoanResult');if(box){box.dataset.copy=txt;box.innerHTML=`<div><span>Trả dự kiến/tháng</span><strong>${money(monthly)}</strong></div><div><span>Tổng lãi dự kiến</span><strong>${money(interest)}</strong></div><div><span>Tổng thanh toán</span><strong>${money(total)}</strong></div>`;}
  }
  function openLoan(){ensureDialogs();const c=state.customers.find(x=>x.id===selectedCustomerId);document.querySelector('#b1LoanCustomer').textContent=c?c.name:'';const hinted=String(c?.profile?.loanAmount||'').replace(/\D/g,'');document.querySelector('#b1LoanAmount').value=hinted||'';loanCalc();document.querySelector('#b1LoanDialog').showModal();}
  async function copyText(t){try{await navigator.clipboard.writeText(t);toast('Đã sao chép')}catch(_){const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('Đã sao chép')}}

  function productFieldsHtml(c){const s=schemaFor(c?.product||document.querySelector('#productInput')?.value);if(!s||!s.fields?.length)return '';return `<div class="b1-product-fields full-span"><div class="section-label">🧩 Thông tin theo sản phẩm · ${esc(s.product)}</div><div class="form-grid">${s.fields.map(f=>`<label class="field"><span>${esc(f.name)}</span><input data-b1-product-field="${esc(f.id)}" value="${esc(c?.productFields?.[f.id]||'')}"></label>`).join('')}</div></div>`;}
  function refreshProductForm(c){const host=document.querySelector('#dynamicCustomerFields');if(!host)return;host.querySelector('.b1-product-fields')?.remove();host.insertAdjacentHTML('beforeend',productFieldsHtml(c));}
  const oldOpen=openCustomerDialog;openCustomerDialog=function(id=null){oldOpen(id);const c=state.customers.find(x=>x.id===id);refreshProductForm(c);};
  document.querySelector('#productInput')?.addEventListener('change',()=>refreshProductForm(state.customers.find(x=>x.id===document.querySelector('#customerId')?.value)));
  const oldSave=saveCustomer;saveCustomer=function(){const id=document.querySelector('#customerId')?.value||'',old=state.customers.find(x=>x.id===id),pf={...(old?.productFields||{})};document.querySelectorAll('[data-b1-product-field]').forEach(i=>pf[i.dataset.b1ProductField]=i.value.trim());const ok=oldSave();if(ok){const c=state.customers.find(x=>x.id===(id||selectedCustomerId));if(c){c.productFields=pf;save({render:false});renderAll();}}return ok;};

  function enhanceDetail(){const c=state.customers.find(x=>x.id===selectedCustomerId),p=document.querySelector('#detailPanel');if(!c||!p)return;if(!p.querySelector('.b1-detail-tools')){const bar=document.createElement('div');bar.className='b1-detail-tools';bar.innerHTML='<button type="button" class="secondary" data-b1-loan>🧮 Tính khoản vay</button><button type="button" class="secondary" data-b1-qr>🔗 QR hồ sơ</button>';p.querySelector('.customer-summary')?.insertAdjacentElement('afterend',bar);}const s=schemaFor(c.product);if(s?.fields?.length&&!p.querySelector('.b1-product-detail')){const vals=s.fields.map(f=>[f.name,c.productFields?.[f.id]]).filter(x=>x[1]);if(vals.length){const d=document.createElement('div');d.className='b1-product-detail pp-profile-grid';d.innerHTML=vals.map(([k,v])=>`<div class="detail-card"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');p.querySelector('.note-box')?.insertAdjacentElement('beforebegin',d);}}}
  const oldRD=renderDetail;renderDetail=function(){oldRD();enhanceDetail();};

  function productSettings(){const root=document.querySelector('#settingsView .v58-settings-page[data-v58-page="customer"] .v58-page-body')||document.querySelector('#settingsView .settings-stack')||document.querySelector('#settingsView');if(!root||root.querySelector('#b1ProductSettings'))return;const card=document.createElement('section');card.className='panel';card.id='b1ProductSettings';card.innerHTML=`<div class="panel-head"><div><h3>🧩 Trường theo sản phẩm</h3><p class="muted">Tạo bộ thông tin riêng cho từng sản phẩm mà không sửa code.</p></div><button class="secondary small" type="button" id="b1AddProduct">+ Sản phẩm</button></div><div id="b1ProductList"></div>`;const dev=root.querySelector('.developer-info-card');dev?root.insertBefore(card,dev):root.appendChild(card);renderProductSettings();}
  function renderProductSettings(){const box=document.querySelector('#b1ProductList');if(!box)return;box.innerHTML=state.settings.productSchemas.length?state.settings.productSchemas.map(s=>`<div class="b1-schema"><div class="b1-schema-head"><strong>${esc(s.product)}</strong><div><button type="button" class="secondary small" data-b1-add-field="${esc(s.id)}">+ Trường</button><button type="button" class="icon-danger" data-b1-del-product="${esc(s.id)}">×</button></div></div><div class="b1-schema-fields">${(s.fields||[]).map(f=>`<span>${esc(f.name)} <button type="button" data-b1-del-field="${esc(s.id)}|${esc(f.id)}">×</button></span>`).join('')||'<em class="muted">Chưa có trường.</em>'}</div></div>`).join(''):'<div class="muted">Chưa cấu hình sản phẩm. Ví dụ: Vay tín chấp → Thu nhập, Công ty, Khoản vay mong muốn.</div>';}

  async function openQr(){ensureDialogs();const c=state.customers.find(x=>x.id===selectedCustomerId);if(!c)return;const payload='aipp://customer/'+encodeURIComponent(c.id);document.querySelector('#b1QrName').textContent=c.name;document.querySelector('#b1QrCode').textContent=payload;const img=document.querySelector('#b1QrImage');img.removeAttribute('src');try{if(window.AippAndroid&&typeof AippAndroid.generateQrDataUrl==='function'){const src=AippAndroid.generateQrDataUrl(payload,720);if(src)img.src=src;else throw 0;}else throw 0;}catch(_){toast('Thiết bị chưa hỗ trợ tạo QR ở bản này',4000);}document.querySelector('#b1QrDialog').showModal();}
  window.aippOpenCustomerFromQr=id=>{const c=state.customers.find(x=>x.id===id);if(!c){toast('Không tìm thấy hồ sơ QR');return}selectedCustomerId=id;showView('customers');renderAll();setTimeout(()=>document.querySelector('#detailPanel')?.scrollIntoView({behavior:'smooth'}),100);};

  function bytesText(n){n=Number(n)||0;if(n<1024)return n+' B';if(n<1048576)return (n/1024).toFixed(1)+' KB';return (n/1048576).toFixed(1)+' MB';}
  function nativeDiag(){try{return window.AippAndroid&&typeof AippAndroid.getDiagnostics==='function'?JSON.parse(AippAndroid.getDiagnostics()):{};}catch(_){return {};}}
  function diagItems(){const raw=localStorage.getItem(STORAGE_KEY)||'',nd=nativeDiag(),last=state.toolSettings?.lastBackupAt;return [
    ['ok',`Dữ liệu khách: ${state.customers.length} khách`],
    [raw.length<4_000_000?'ok':'warn',`Dung lượng dữ liệu AIPP: ${bytesText(new Blob([raw]).size)}`],
    [nd.nativeBridge?'ok':'warn',nd.nativeBridge?'Native bridge: hoạt động':'Native bridge: không khả dụng'],
    [nd.smsPermission?'ok':'warn',nd.smsPermission?'Quyền SMS: đã cấp':'Quyền SMS: chưa cấp'],
    [nd.exactAlarm?'ok':'warn',nd.exactAlarm?'Lịch chính xác: sẵn sàng':'Lịch chính xác: cần kiểm tra quyền'],
    ['ok',`SMS đang chờ: ${nd.pendingSms??state.schedules.filter(x=>x.status==='scheduled').length}`],
    [last?'ok':'warn',`Backup gần nhất: ${last?new Date(last).toLocaleString('vi-VN'):'chưa có'}`]
  ];}
  function renderChecks(id,items){const box=document.querySelector(id);if(box)box.innerHTML=items.map(([s,t])=>`<div class="b1-check ${s}"><b>${s==='ok'?'✅':s==='warn'?'⚠️':'❌'}</b><span>${esc(t)}</span></div>`).join('');}
  function openDiag(){ensureDialogs();renderChecks('#b1DiagList',diagItems());document.querySelector('#b1DiagDialog').showModal();}
  function selfItems(){let roundtrip=false;try{const t='aipp_test_'+Date.now();localStorage.setItem(t,'1');roundtrip=localStorage.getItem(t)==='1';localStorage.removeItem(t);}catch(_){}const nd=nativeDiag(),valid=state.customers.every(c=>c&&c.id&&c.name&&c.phone);return [
    [Array.isArray(state.customers)?'ok':'bad','Cấu trúc danh sách khách đọc được'],
    [valid?'ok':'warn',valid?'Dữ liệu khách cơ bản hợp lệ':'Có khách thiếu ID/Tên/SĐT'],
    [roundtrip?'ok':'bad',roundtrip?'Lưu/đọc dữ liệu thử: OK':'Không thể ghi localStorage'],
    [typeof save==='function'?'ok':'bad','Hàm lưu AIPP sẵn sàng'],
    [nd.nativeBridge?'ok':'warn',nd.nativeBridge?'Kết nối Android native: OK':'Không có Android native bridge'],
    [nd.smsPermission?'ok':'warn',nd.smsPermission?'SMS Scheduler: quyền SMS sẵn sàng':'SMS Scheduler: chưa có quyền SMS'],
    [typeof openManualSms==='function'||typeof sendViaSms==='function'?'ok':'warn','Luồng SMS trong giao diện đã nạp'],
    [state.settings&&state.settings.productSchemas?'ok':'bad','Module trường theo sản phẩm đã nạp'],
    ['ok',`Phiên kiểm tra: ${B1}`]
  ];}
  function openSelf(){ensureDialogs();renderChecks('#b1SelfList',selfItems());document.querySelector('#b1SelfDialog').showModal();}
  function addHealthSettings(){const root=document.querySelector('#settingsView .v58-settings-page[data-v58-page="backup"] .v58-page-body')||document.querySelector('#settingsView .settings-stack')||document.querySelector('#settingsView');if(!root||root.querySelector('#b1HealthSettings'))return;const card=document.createElement('section');card.className='panel';card.id='b1HealthSettings';card.innerHTML='<h3>🩺 Kiểm tra & chẩn đoán</h3><p class="muted">Kiểm tra AIPP mà không thực hiện cuộc gọi hoặc gửi SMS thật.</p><div class="tool-row"><button type="button" class="secondary" data-b1-diag>🩺 Chẩn đoán AIPP</button><button type="button" class="primary" data-b1-self>🧪 Kiểm tra sau cập nhật</button></div>';const dev=root.querySelector('.developer-info-card');dev?root.insertBefore(card,dev):root.appendChild(card);}

  document.addEventListener('input',e=>{if(e.target.matches('#b1LoanAmount,#b1LoanMonths,#b1LoanRate'))loanCalc();});
  document.addEventListener('change',e=>{if(e.target.matches('#b1LoanMethod'))loanCalc();});
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-b1-loan]'))return openLoan();if(e.target.closest('[data-b1-qr]'))return openQr();if(e.target.closest('[data-b1-diag]'))return openDiag();if(e.target.closest('[data-b1-self]'))return openSelf();
    if(e.target.closest('#b1LoanCopy'))return copyText(document.querySelector('#b1LoanResult')?.dataset.copy||'');
    if(e.target.closest('[data-b1-close-qr]'))return document.querySelector('#b1QrDialog')?.close();if(e.target.closest('[data-b1-close-diag]'))return document.querySelector('#b1DiagDialog')?.close();if(e.target.closest('[data-b1-close-self]'))return document.querySelector('#b1SelfDialog')?.close();
    if(e.target.closest('#b1RunDiag'))return renderChecks('#b1DiagList',diagItems());if(e.target.closest('#b1RunSelf'))return renderChecks('#b1SelfList',selfItems());
    if(e.target.closest('#b1AddProduct')){const product=prompt('Tên sản phẩm (ví dụ: Vay tín chấp):')?.trim();if(product&&!schemaFor(product)){state.settings.productSchemas.push({id:'ps_'+Date.now(),product,fields:[]});save({render:false});renderProductSettings();}return;}
    const af=e.target.closest('[data-b1-add-field]');if(af){const s=state.settings.productSchemas.find(x=>x.id===af.dataset.b1AddField),name=prompt('Tên trường (ví dụ: Thu nhập):')?.trim();if(s&&name){s.fields=s.fields||[];s.fields.push({id:'pf_'+Date.now(),name});save({render:false});renderProductSettings();}return;}
    const dp=e.target.closest('[data-b1-del-product]');if(dp&&confirm('Xóa cấu hình sản phẩm này? Dữ liệu đã lưu trong khách sẽ không bị xóa.')){state.settings.productSchemas=state.settings.productSchemas.filter(x=>x.id!==dp.dataset.b1DelProduct);save({render:false});renderProductSettings();return;}
    const df=e.target.closest('[data-b1-del-field]');if(df){const [sid,fid]=df.dataset.b1DelField.split('|'),s=state.settings.productSchemas.find(x=>x.id===sid);if(s&&confirm('Xóa trường khỏi giao diện? Dữ liệu cũ trong khách vẫn được giữ.')){s.fields=s.fields.filter(x=>x.id!==fid);save({render:false});renderProductSettings();}return;}
  });
  const oldRenderSettingsB1=renderSettings;renderSettings=function(){oldRenderSettingsB1();productSettings();addHealthSettings();renderProductSettings();};
  productSettings();addHealthSettings();ensureDialogs();if(selectedCustomerId)renderDetail();
})();

/* =========================================================
   AIPP V6 CLEAN REBUILD — workflow/report layout from V5.9 base
   ========================================================= */
(()=>{
 const VER='V6.0 CLEAN';
 const qs=(s,r=document)=>r.querySelector(s), esc2=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
 const statuses=['Không nghe','Đang tư vấn','Đã gửi thông tin','Hẹn gọi lại','Tiềm năng','Không nhu cầu','Hoàn tất'];
 const qLabels={approved:'Approved Queue',reject:'Reject Queue',sales:'Sales Queue',processing:'Đang xử lý'};
 state.settings.loanResultFields=state.settings.loanResultFields||{amount:true,term:true,rate:true,disbursementDate:true,note:true};
 state.settings.rejectReasons=state.settings.rejectReasons||['Không đủ điều kiện','Nợ xấu/CIC','Thu nhập không đạt','Hồ sơ không hợp lệ','Khác'];
 state.settings.salesReasons=state.settings.salesReasons||['Thiếu CCCD','Thiếu sao kê','Thiếu HĐLĐ','Thiếu bảng lương','Cần xác minh thêm','Khác'];
 state.customers.forEach(c=>{ if(['Máy bận'].includes(c.status)) c.status='Không nghe'; if(['Đã tư vấn','Đã gửi Zalo','Đã gửi SMS'].includes(c.status)) c.status='Đã gửi thông tin'; });
 save({render:false});
 function persist(){return save({render:false});}
 function fmtMoneyInput(v){const n=String(v||'').replace(/\D/g,'');return n?n.replace(/\B(?=(\d{3})+(?!\d))/g,'.'):''}
 function loanResultCard(c){const r=c.loanResult;if(!r)return '';const cls=r.queue==='approved'?'approved':r.queue==='reject'?'reject':'sales';return `<div class="v6-loan-result ${cls}"><div><small>📑 Kết quả hồ sơ vay</small><strong>${qLabels[r.queue]||'Đang xử lý'}</strong>${r.reason?`<span>${esc2(r.reason)}</span>`:''}</div><div class="v6-result-actions"><button class="secondary small" data-v6-result-edit="${c.id}">Cập nhật</button><button class="danger small" data-v6-result-delete="${c.id}">Xóa</button></div></div>`}
 const oldRD=renderDetail;
 renderDetail=function(){oldRD();const c=state.customers.find(x=>x.id===selectedCustomerId),p=qs('#detailPanel');if(!c||!p)return;
   const q=qs('.quick-status',p); if(q){q.innerHTML=statuses.map(s=>`<button class="${c.status===s?'active':''} ${s==='Hoàn tất'?'v6-complete':''}" data-status="${s}" data-id="${c.id}">${s}</button>`).join('');}
   const info=qs('.info-grid',p); if(info){const cards=[...info.children];const z=cards.find(x=>x.querySelector('span')?.textContent.trim()==='Zalo');if(z){z.classList.add('v6-zalo-card');z.innerHTML=`<span>Zalo</span><div class="v6-zalo-line"><strong>${zaloLabel(c.zaloStatus)}</strong><div><button data-zalo-state="yes" data-id="${c.id}" class="secondary small zalo-choice ${c.zaloStatus==='yes'?'active yes':''}">Có</button><button data-zalo-state="no" data-id="${c.id}" class="secondary small zalo-choice ${c.zaloStatus==='no'?'active no':''}">Không</button><button data-zalo-state="unknown" data-id="${c.id}" class="secondary small zalo-choice ${c.zaloStatus==='unknown'?'active unknown':''}">?</button></div></div>`;}}
   const existing=qs('.v6-loan-result',p);if(existing)existing.remove();const quick=qs('.quick-status-wrap',p);if(c.loanResult&&quick)quick.insertAdjacentHTML('afterend',loanResultCard(c));
   p.classList.toggle('v6-approved-customer',c.loanResult?.queue==='approved');
 };
 function ensureDialogs(){if(qs('#v6LoanResultDialog'))return;document.body.insertAdjacentHTML('beforeend',`
 <dialog id="v6LoanResultDialog"><form class="dialog-form" id="v6LoanResultForm"><div class="dialog-head"><div><h3>📑 Kết quả hồ sơ vay</h3><p class="muted" id="v6ResultCustomer"></p></div><button type="button" class="icon-btn" data-v6-close="v6LoanResultDialog">✕</button></div>
 <label class="field"><span>Kết quả *</span><select id="v6Queue"><option value="approved">🟢 Approved Queue</option><option value="reject">🔴 Reject Queue</option><option value="sales">🟠 Sales Queue</option><option value="processing">⏳ Đang xử lý</option></select></label>
 <label class="field" id="v6ReasonWrap"><span id="v6ReasonLabel">Lý do</span><select id="v6Reason"></select></label>
 <div class="form-grid"><label class="field"><span>Ngày nộp hồ sơ</span><input id="v6SubmitDate" type="date"></label><label class="field"><span>Số tiền giải ngân</span><input id="v6Amount" inputmode="numeric" placeholder="100.000.000"></label><label class="field"><span>Kỳ hạn (tháng)</span><input id="v6Term" inputmode="numeric"></label><label class="field"><span>Lãi suất</span><input id="v6Rate" inputmode="decimal"></label><label class="field"><span>Ngày giải ngân</span><input id="v6DisburseDate" type="date"></label><label class="field full-span"><span>Ghi chú kết quả</span><textarea id="v6ResultNote" rows="3"></textarea></label></div>
 <div class="dialog-actions"><button type="button" class="secondary" data-v6-close="v6LoanResultDialog">Hủy</button><button class="primary" type="submit">Lưu kết quả</button></div></form></dialog>
 <dialog id="v6FollowupDialog"><form class="dialog-form" id="v6FollowupForm"><div class="dialog-head"><div><h3>⏰ Hẹn gọi lại</h3><p class="muted" id="v6FollowupCustomer"></p></div><button type="button" class="icon-btn" data-v6-close="v6FollowupDialog">✕</button></div><div class="form-grid"><label class="field"><span>Ngày hẹn *</span><input id="v6FollowupDate" type="date" required></label><label class="field"><span>Giờ hẹn *</span><input id="v6FollowupTime" type="time" required></label></div><div class="dialog-actions"><button type="button" class="secondary" data-v6-close="v6FollowupDialog">Hủy</button><button class="primary" type="submit">Lưu lịch hẹn</button></div></form></dialog>
 <dialog id="v6ReportDialog"><div class="dialog-form"><div class="dialog-head"><div><h3 id="v6ReportTitle">Báo cáo kết quả</h3><p class="muted" id="v6ReportSub"></p></div><button type="button" class="icon-btn" data-v6-close="v6ReportDialog">✕</button></div><div id="v6ReportList" class="v6-report-list"></div><div class="dialog-actions"><button class="primary" type="button" data-v6-close="v6ReportDialog">Đóng</button></div></div></dialog>`);}
 function reasonOptions(queue){return queue==='reject'?state.settings.rejectReasons:queue==='sales'?state.settings.salesReasons:[]}
 function updateReason(){const q=qs('#v6Queue').value,w=qs('#v6ReasonWrap'),sel=qs('#v6Reason');const arr=reasonOptions(q);w.hidden=!arr.length;sel.innerHTML=arr.map(x=>`<option>${esc2(x)}</option>`).join('');qs('#v6ReasonLabel').textContent=q==='reject'?'Lý do Reject':'Nội dung cần bổ sung';}
 function openResult(c){ensureDialogs();qs('#v6ResultCustomer').textContent=c.name;const r=c.loanResult||{};qs('#v6Queue').value=r.queue||'approved';updateReason();if(r.reason&&[...qs('#v6Reason').options].some(o=>o.value===r.reason))qs('#v6Reason').value=r.reason;qs('#v6SubmitDate').value=r.submitDate||new Date().toISOString().slice(0,10);qs('#v6Amount').value=fmtMoneyInput(r.amount);qs('#v6Term').value=r.term||'';qs('#v6Rate').value=r.rate||'';qs('#v6DisburseDate').value=r.disbursementDate||'';qs('#v6ResultNote').value=r.note||'';qs('#v6LoanResultDialog').dataset.customerId=c.id;qs('#v6LoanResultDialog').showModal();}
 function openFollowup(c){ensureDialogs();const d=new Date(c.followup||Date.now()+86400000);if(Number.isNaN(d.getTime()))d.setTime(Date.now()+86400000);const pad=n=>String(n).padStart(2,'0');qs('#v6FollowupCustomer').textContent=c.name+' · '+c.phone;qs('#v6FollowupDate').value=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;qs('#v6FollowupTime').value=`${pad(d.getHours())}:${pad(d.getMinutes())}`;qs('#v6FollowupDialog').dataset.customerId=c.id;qs('#v6FollowupDialog').showModal();}
 function reportRangeStart(kind){const d=new Date(),x=new Date(d);x.setHours(0,0,0,0);if(kind==='month')x.setDate(1);else if(kind==='quarter')x.setMonth(Math.floor(x.getMonth()/3)*3,1);else if(kind==='year')x.setMonth(0,1);return x;}
 function inRange(c,kind){const t=c.loanResult?.updatedAt||c.loanResult?.submitDate||c.updatedAt;return t&&new Date(t)>=reportRangeStart(kind)}
 function reportCustomers(type,kind){return state.customers.filter(c=>{if(!c.loanResult||!inRange(c,kind))return false;if(type==='all')return true;if(type==='processing')return c.loanResult.queue==='processing';return c.loanResult.queue===type;});}
 function openReport(type,kind){ensureDialogs();const list=reportCustomers(type,kind);qs('#v6ReportTitle').textContent=type==='all'?'📑 Hồ sơ':qLabels[type]||'Báo cáo kết quả';qs('#v6ReportSub').textContent=`${list.length} hồ sơ trong khoảng đã chọn`;qs('#v6ReportList').innerHTML=list.length?list.map(c=>`<button type="button" class="v6-report-row" data-v6-open-customer="${c.id}"><span><strong>${esc2(c.name)}</strong><small>${esc2(c.phone)} · ${esc2(qLabels[c.loanResult.queue]||'')}</small>${c.loanResult.reason?`<small>${esc2(c.loanResult.reason)}</small>`:''}</span><b>${c.loanResult.amount?fmtMoneyInput(c.loanResult.amount)+' đ':'›'}</b></button>`).join(''):'<div class="muted">Không có hồ sơ trong mục này.</div>';qs('#v6ReportDialog').showModal();}
 function buildReport(){const old=qs('#ppReport');if(!old)return;old.querySelector('h3').textContent='📊 Báo cáo kết quả';let sel=qs('#ppReportRange');if(sel&&!sel.dataset.v6Ready){sel.innerHTML='<option value="day">Hôm nay</option><option value="month">Tháng này</option><option value="quarter">Quý này</option><option value="year">Năm nay</option>';sel.dataset.v6Ready='1';}const saved=state.settings.reportRangeV6||'day';if(sel&&!['day','month','quarter','year'].includes(sel.value))sel.value=saved;if(sel&&document.activeElement!==sel&&sel.value!==saved)sel.value=saved;
   const kind=sel?.value||saved,all=reportCustomers('all',kind),approved=reportCustomers('approved',kind),reject=reportCustomers('reject',kind),sales=reportCustomers('sales',kind),processing=reportCustomers('processing',kind),money=approved.reduce((s,c)=>s+(Number(String(c.loanResult.amount||'').replace(/\D/g,''))||0),0);const g=old.querySelector('.pp-report-grid');if(g)g.innerHTML=`<button data-v6-report="all"><span>📑 Hồ sơ</span><strong>${all.length}</strong></button><button data-v6-report="processing"><span>⏳ Đang xử lý</span><strong>${processing.length}</strong></button><button data-v6-report="approved"><span>🟢 Approved Queue</span><strong>${approved.length}</strong></button><button data-v6-report="reject"><span>🔴 Reject Queue</span><strong>${reject.length}</strong></button><button data-v6-report="sales"><span>🟠 Sales Queue</span><strong>${sales.length}</strong></button><button data-v6-report="approved" class="v6-money"><span>💰 Giải ngân</span><strong>${fmtMoneyInput(money)} đ</strong></button>`;}
 const oldRA=renderAll;renderAll=function(){oldRA();setTimeout(()=>{renderDetail();buildReport();},0)};
 document.addEventListener('change',e=>{if(e.target.id==='v6Queue')updateReason();if(e.target.id==='ppReportRange'){state.settings.reportRangeV6=e.target.value;persist();buildReport();}});
 document.addEventListener('input',e=>{if(e.target.id==='v6Amount'){const pos=e.target.selectionStart;e.target.value=fmtMoneyInput(e.target.value);try{e.target.setSelectionRange(e.target.value.length,e.target.value.length)}catch(_){}}});
 document.addEventListener('submit',e=>{if(e.target.id!=='v6FollowupForm')return;e.preventDefault();const c=state.customers.find(x=>x.id===qs('#v6FollowupDialog').dataset.customerId);if(!c)return;const day=qs('#v6FollowupDate').value,time=qs('#v6FollowupTime').value;if(!day||!time){toast('Vui lòng chọn đủ ngày và giờ');return}c.followup=`${day}T${time}`;c.status='Hẹn gọi lại';c.updatedAt=new Date().toISOString();c.timeline=Array.isArray(c.timeline)?c.timeline:[];c.timeline.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),type:'followup',title:'Hẹn gọi lại',detail:fmtDate(c.followup)});persist();qs('#v6FollowupDialog').close();renderAll();toast('Đã lưu lịch hẹn gọi lại');});
 document.addEventListener('submit',e=>{if(e.target.id!=='v6LoanResultForm')return;e.preventDefault();const id=qs('#v6LoanResultDialog').dataset.customerId,c=state.customers.find(x=>x.id===id);if(!c)return;c.loanResult={queue:qs('#v6Queue').value,reason:qs('#v6ReasonWrap').hidden?'':qs('#v6Reason').value,submitDate:qs('#v6SubmitDate').value,amount:String(qs('#v6Amount').value).replace(/\D/g,''),term:qs('#v6Term').value,rate:qs('#v6Rate').value,disbursementDate:qs('#v6DisburseDate').value,note:qs('#v6ResultNote').value.trim(),updatedAt:new Date().toISOString()};c.status='Hoàn tất';c.followup='';c.updatedAt=new Date().toISOString();persist();qs('#v6LoanResultDialog').close();renderAll();toast('Đã lưu kết quả hồ sơ');});
 document.addEventListener('click',e=>{const reset=e.target.closest('[data-reset-timeline]');if(reset){const c=state.customers.find(x=>x.id===reset.dataset.resetTimeline);if(c&&confirm('Xóa toàn bộ nhật ký chăm sóc của khách này?')){c.timeline=[];c.updatedAt=new Date().toISOString();persist();renderAll();toast('Đã xóa nhật ký chăm sóc');}return}const close=e.target.closest('[data-v6-close]');if(close){qs('#'+close.dataset.v6Close)?.close();return}const edit=e.target.closest('[data-v6-result-edit]');if(edit){const c=state.customers.find(x=>x.id===edit.dataset.v6ResultEdit);if(c)openResult(c);return}const del=e.target.closest('[data-v6-result-delete]');if(del){const c=state.customers.find(x=>x.id===del.dataset.v6ResultDelete);if(c&&confirm('Xóa kết quả hồ sơ vay của khách này? Khách hàng sẽ không bị xóa.')){delete c.loanResult;persist();renderAll();toast('Đã xóa kết quả hồ sơ');}return}const rr=e.target.closest('[data-v6-report]');if(rr){openReport(rr.dataset.v6Report,qs('#ppReportRange')?.value||'day');return}const oc=e.target.closest('[data-v6-open-customer]');if(oc){selectedCustomerId=oc.dataset.v6OpenCustomer;qs('#v6ReportDialog')?.close();showView('customers');renderAll();setTimeout(()=>qs('#detailPanel')?.scrollIntoView({behavior:'smooth'}),50);return}},true);
 // Capture completion/follow-up before legacy click handler changes state.
 document.addEventListener('click',e=>{const sr=e.target.closest('[data-smart-reschedule]');if(sr){e.preventDefault();e.stopImmediatePropagation();const c=state.customers.find(x=>x.id===sr.dataset.smartReschedule);if(c)openFollowup(c);return}const b=e.target.closest('button[data-status]');if(!b)return;if(b.dataset.status==='Hoàn tất'){e.preventDefault();e.stopImmediatePropagation();const c=state.customers.find(x=>x.id===b.dataset.id);if(c)openResult(c);return}if(b.dataset.status==='Hẹn gọi lại'){e.preventDefault();e.stopImmediatePropagation();const c=state.customers.find(x=>x.id===b.dataset.id);if(c)openFollowup(c);return}},true);
 ensureDialogs();renderAll();
})();

/* =========================================================
   AIPP V6.0.1 — Follow-up picker / timeline reset / report range fix
   ========================================================= */
(()=>{
 const qs=(s,r=document)=>r.querySelector(s);
 function ensureFixDialogs(){
   if(!qs('#v601FollowupDialog')) document.body.insertAdjacentHTML('beforeend',`
   <dialog id="v601FollowupDialog"><form id="v601FollowupForm" class="dialog-form">
    <div class="dialog-head"><div><h3>⏰ Hẹn gọi lại</h3><p class="muted" id="v601FollowupCustomer"></p></div><button type="button" class="icon-btn" data-v601-close="v601FollowupDialog">✕</button></div>
    <div class="form-grid"><label class="field"><span>Ngày hẹn *</span><input id="v601FollowupDate" type="date" required></label><label class="field"><span>Giờ hẹn *</span><input id="v601FollowupTime" type="time" required></label></div>
    <div class="dialog-actions"><button type="button" class="secondary" data-v601-close="v601FollowupDialog">Hủy</button><button type="submit" class="primary">Lưu lịch hẹn</button></div>
   </form></dialog>`);
 }
 function localParts(d){const p=n=>String(n).padStart(2,'0');return {date:`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`,time:`${p(d.getHours())}:${p(d.getMinutes())}`}}
 function openFollowup(c){ensureFixDialogs();const d=c.followup?new Date(c.followup):new Date(Date.now()+86400000);if(!c.followup)d.setHours(9,0,0,0);const p=localParts(d);qs('#v601FollowupCustomer').textContent=c.name||'';qs('#v601FollowupDate').value=p.date;qs('#v601FollowupTime').value=p.time;qs('#v601FollowupDialog').dataset.customerId=c.id;qs('#v601FollowupDialog').showModal();}
 // Override V6 report builder: preserve the selected range instead of resetting to day.
 buildReport=function(){const old=qs('#ppReport');if(!old)return;old.querySelector('h3').textContent='📊 Báo cáo kết quả';let sel=qs('#ppReportRange'),chosen=(sel?.value||state.settings.reportRange||'day');if(!['day','month','quarter','year'].includes(chosen))chosen='day';if(sel){const sig=[...sel.options].map(o=>o.value).join(',');if(sig!=='day,month,quarter,year')sel.innerHTML='<option value="day">Hôm nay</option><option value="month">Tháng này</option><option value="quarter">Quý này</option><option value="year">Năm nay</option>';sel.value=chosen;state.settings.reportRange=chosen;}
   const kind=chosen,all=reportCustomers('all',kind),approved=reportCustomers('approved',kind),reject=reportCustomers('reject',kind),sales=reportCustomers('sales',kind),processing=reportCustomers('processing',kind),money=approved.reduce((s,c)=>s+(Number(String(c.loanResult.amount||'').replace(/\D/g,''))||0),0);const g=old.querySelector('.pp-report-grid');if(g)g.innerHTML=`<button data-v6-report="all"><span>📑 Hồ sơ</span><strong>${all.length}</strong></button><button data-v6-report="processing"><span>⏳ Đang xử lý</span><strong>${processing.length}</strong></button><button data-v6-report="approved"><span>🟢 Approved Queue</span><strong>${approved.length}</strong></button><button data-v6-report="reject"><span>🔴 Reject Queue</span><strong>${reject.length}</strong></button><button data-v6-report="sales"><span>🟠 Sales Queue</span><strong>${sales.length}</strong></button><button data-v6-report="approved" class="v6-money"><span>💰 Giải ngân</span><strong>${fmtMoneyInput(money)} đ</strong></button>`;
 };
 // Add reset action to care timeline after every detail render.
 const prevRD601=renderDetail;renderDetail=function(){prevRD601();const c=state.customers.find(x=>x.id===selectedCustomerId),tl=qs('#detailPanel .pp-timeline');if(!c||!tl)return;const title=tl.querySelector('.pp-section-title');if(title&&!title.querySelector('[data-v601-reset-log]'))title.insertAdjacentHTML('beforeend',`<button type="button" class="secondary small v601-reset-log" data-v601-reset-log="${c.id}">🗑 Xóa nhật ký</button>`);};
 document.addEventListener('change',e=>{if(e.target.id==='ppReportRange'){state.settings.reportRange=e.target.value;try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}catch(_){}setTimeout(buildReport,0);}},true);
 document.addEventListener('submit',e=>{if(e.target.id!=='v601FollowupForm')return;e.preventDefault();const c=state.customers.find(x=>x.id===qs('#v601FollowupDialog').dataset.customerId),date=qs('#v601FollowupDate').value,time=qs('#v601FollowupTime').value;if(!c||!date||!time)return;c.followup=`${date}T${time}`;c.status='Hẹn gọi lại';c.updatedAt=new Date().toISOString();if(typeof logEvent==='function')logEvent(c,'followup','Hẹn gọi lại',fmtDate(c.followup));save({render:false});qs('#v601FollowupDialog').close();renderAll();toast('Đã lưu lịch hẹn gọi lại');},true);
 document.addEventListener('click',e=>{const close=e.target.closest('[data-v601-close]');if(close){qs('#'+close.dataset.v601Close)?.close();return}const reset=e.target.closest('[data-v601-reset-log]');if(reset){e.preventDefault();e.stopImmediatePropagation();const c=state.customers.find(x=>x.id===reset.dataset.v601ResetLog);if(c&&confirm(`Xóa toàn bộ nhật ký chăm sóc của ${c.name}? Thao tác này không xóa khách hàng.`)){c.timeline=[];c.updatedAt=new Date().toISOString();save({render:false});renderAll();toast('Đã xóa nhật ký chăm sóc');}return}const b=e.target.closest('button[data-status]');if(b?.dataset.status==='Hẹn gọi lại'){e.preventDefault();e.stopImmediatePropagation();const c=state.customers.find(x=>x.id===b.dataset.id);if(c)openFollowup(c);return}},true);
 ensureFixDialogs();buildReport();if(selectedCustomerId)renderDetail();
})();


/* ===== AIPP HOME V2 interactions - no business/data changes ===== */
(()=>{
  document.addEventListener('click',e=>{
    if(e.target.closest('#homeAddCustomerBtn')) document.querySelector('#addCustomerBtn')?.click();
  });
})();

/* ===== AIPP V6.0.4 - CUSTOMERS COMPACT LIST UI ONLY ===== */
(()=>{
 const escA=s=>esc(String(s??''));
 function filteredCustomers(){
   const q=($('#globalSearch')?.value||'').trim().toLowerCase(), sf=$('#statusFilter')?.value||'', src=$('#sourceFilter')?.value||'', carrier=$('#carrierFilter')?.value||'', quick=document.querySelector('.aipp-cq.active')?.dataset.q||'all';
   return state.customers.filter(c=>{
    let ok=(!q||String(c.name||'').toLowerCase().includes(q)||normalizePhone(c.phone).includes(normalizePhone(q)))&&(!sf||c.status===sf)&&(!state.settings.showSourceInfo||!src||c.source===src)&&carrierMatches(c.phone,carrier);
    if(quick==='process') ok=ok&&['Không nghe','Đang tư vấn','Đã gửi thông tin','Hẹn gọi lại'].includes(c.status);
    if(quick==='potential') ok=ok&&c.status==='Tiềm năng';
    if(quick==='followup') ok=ok&&!!c.followup;
    return ok;
   });
 }
 function queue(c){return c.loanResult?.result==='approved'?'Approved Queue':c.loanResult?.result==='rejected'?'Reject Queue':c.loanResult?.result==='supplement'?'Sales Queue':''}
 function compactRender(){
  const box=$('#customerList'); if(!box)return;
  const list=filteredCustomers();
  const count=$('#aippCustomerCount'); if(count)count.textContent=`${list.length} khách`;
  box.innerHTML=list.length?list.map(c=>{
   const net=classifyPhone(c.phone).origin, q=queue(c), approved=c.loanResult?.result==='approved';
   const amount=approved&&c.loanResult?.amount?` · ${Number(String(c.loanResult.amount).replace(/\D/g,'' )||0).toLocaleString('vi-VN')} ₫`:'';
   return `<article class="aipp-customer-compact ${approved?'is-approved':''}" data-customer-id="${escA(c.id)}">
    ${approved?'<div class="aipp-success-label">✓ VAY THÀNH CÔNG</div>':''}
    <div class="aipp-cc-head"><div class="aipp-cc-person"><strong>👤 ${escA(c.name)}</strong><span>${escA(c.phone)}${net?` · ${escA(net)}`:''}</span></div><button type="button" class="aipp-cc-more" data-cc-more="${escA(c.id)}">⋮</button></div>
    <div class="aipp-cc-tags"><span class="status-pill ${statusClass(c.status)}">${escA(c.status)}</span><span class="mini-pill ${zaloPillClass(c.zaloStatus)}">${zaloLabel(c.zaloStatus)}</span>${q?`<span class="mini-pill">${escA(q)}${amount}</span>`:''}</div>
    <div class="aipp-cc-actions"><a href="${escA(telHref(c.phone))}" data-log-contact="call" data-log-id="${escA(c.id)}">📞 <span>Gọi</span></a><a href="${escA(zaloHref(c.phone))}" data-log-contact="zalo" data-log-id="${escA(c.id)}">💬 <span>Zalo</span></a><a href="${escA(smsHref(c.phone,''))}">✉️ <span>SMS</span></a><button type="button" data-cc-detail="${escA(c.id)}">›</button></div>
   </article>`
  }).join(''):'<div class="muted" style="padding:18px">Không tìm thấy khách hàng.</div>';
 }
 const oldShow=showView; showView=function(name){oldShow(name); if(name==='customers'){setTimeout(()=>{setup();compactRender()},0)}};
 const oldAll=renderAll; renderAll=function(){oldAll(); if($('#customersView')?.classList.contains('active')){setup();compactRender()}};
 function setup(){
  const view=$('#customersView'); if(!view||view.dataset.compactReady)return; view.dataset.compactReady='1';
  const filters=view.querySelector('.filters'); if(filters){
   filters.classList.add('aipp-filter-drawer'); filters.id='aippCustomerFilterDrawer';
   const bar=document.createElement('div'); bar.className='aipp-customer-toolbar'; bar.innerHTML=`<div class="aipp-customer-title"><b>Khách hàng</b><span id="aippCustomerCount"></span></div><div class="aipp-quick-row"><button class="aipp-cq active" data-q="all">Tất cả</button><button class="aipp-cq" data-q="process">Cần xử lý</button><button class="aipp-cq" data-q="potential">Tiềm năng</button><button class="aipp-cq" data-q="followup">Hẹn gọi</button><button id="aippFilterToggle" class="aipp-filter-toggle">⚙ Lọc</button></div>`;
   filters.parentNode.insertBefore(bar,filters); filters.classList.remove('open');
  }
  view.addEventListener('click',e=>{
   const q=e.target.closest('.aipp-cq'); if(q){view.querySelectorAll('.aipp-cq').forEach(x=>x.classList.remove('active'));q.classList.add('active');compactRender();return}
   if(e.target.closest('#aippFilterToggle')){view.querySelector('#aippCustomerFilterDrawer')?.classList.toggle('open');return}
   const detail=e.target.closest('[data-cc-detail]'); if(detail){const card=detail.closest('[data-customer-id]');if(card){window.__aippCustomerListScroll=window.scrollY;selectedCustomerId=card.dataset.customerId;renderDetail();setTimeout(()=>$('#detailPanel')?.scrollIntoView({behavior:'smooth',block:'start'}),40)}return}
   const more=e.target.closest('[data-cc-more]'); if(more){const id=more.dataset.ccMore,c=getC(id);if(!c)return; const choice=prompt('Thao tác:\n1 - Hẹn gọi lại\n2 - Xóa khách\n\nNhập 1 hoặc 2:','1'); if(choice==='1'){selectedCustomerId=id;openScheduleDialog(id)}else if(choice==='2'&&confirm(`Xóa khách ${c.name}?`)){state.customers=state.customers.filter(x=>x.id!==id);persist();renderAll()}return}
  });
  ['statusFilter','sourceFilter','carrierFilter'].forEach(id=>$('#'+id)?.addEventListener('change',compactRender));
  $('#globalSearch')?.addEventListener('input',compactRender);
 }
 const style=document.createElement('style');style.id='aippCustomerCompactStyle';style.textContent=`
 body:not(.aipp-dashboard-active) #globalSearch{display:block!important}
 #customersView .customer-layout{display:block!important}.aipp-customer-toolbar{margin:0 0 10px}.aipp-customer-title{display:flex;justify-content:space-between;align-items:end;padding:2px 2px 8px}.aipp-customer-title b{font-size:22px}.aipp-customer-title span{font-size:13px;color:#64748b;font-weight:700}
 .aipp-quick-row{display:flex;gap:7px;overflow-x:auto;padding:2px 1px 7px;scrollbar-width:none}.aipp-quick-row::-webkit-scrollbar{display:none}.aipp-quick-row button{white-space:nowrap;border:1px solid #e5e7eb;background:#fff;border-radius:999px;padding:8px 11px;font-size:12px;font-weight:800;color:#475569}.aipp-quick-row .active{background:#db2777;color:#fff;border-color:#db2777}.aipp-filter-toggle{margin-left:auto!important}
 #customersView .aipp-filter-drawer{display:none!important;margin:0 0 10px!important;padding:10px!important;grid-template-columns:1fr 1fr!important;gap:8px!important}#customersView .aipp-filter-drawer.open{display:grid!important}#customersView .aipp-filter-drawer select,#customersView .aipp-filter-drawer button{min-width:0;width:100%}
 #customersView .customer-list-panel{padding:0!important;background:transparent!important;border:0!important;box-shadow:none!important}.aipp-customer-compact{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:12px;margin:0 0 9px;box-shadow:0 3px 12px rgba(15,23,42,.045);overflow:hidden}.aipp-customer-compact.is-approved{border:1.5px solid #86d6a2}.aipp-success-label{font-size:10px;font-weight:900;color:#16803d;letter-spacing:.35px;margin-bottom:7px}.aipp-cc-head{display:flex;gap:8px;align-items:flex-start}.aipp-cc-person{min-width:0;flex:1;cursor:pointer}.aipp-cc-person strong{display:block;font-size:16px;color:#172033;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.aipp-cc-person span{display:block;color:#667085;font-size:12.5px;margin-top:2px}.aipp-cc-more{border:0!important;background:transparent!important;padding:0 6px!important;font-size:23px!important;line-height:24px;color:#64748b!important}.aipp-cc-tags{display:flex;gap:5px;align-items:center;overflow-x:auto;margin:8px 0 9px;scrollbar-width:none}.aipp-cc-tags>*{white-space:nowrap;font-size:10.5px!important;padding:4px 7px!important}.aipp-cc-actions{display:grid;grid-template-columns:1fr 1fr 1fr 42px;border-top:1px solid #f0f1f4;padding-top:8px;gap:6px}.aipp-cc-actions a,.aipp-cc-actions button{height:36px!important;border:0!important;border-radius:11px!important;background:#f7f8fb!important;color:#334155!important;text-decoration:none!important;display:flex;align-items:center;justify-content:center;gap:4px;font-size:12px!important;font-weight:800!important;padding:0 5px!important}.aipp-cc-actions button{font-size:24px!important}.aipp-cc-actions a:active,.aipp-cc-actions button:active{background:#fce7f3!important}
 @media(max-width:390px){.aipp-cc-actions a span{display:none}.aipp-cc-actions{grid-template-columns:1fr 1fr 1fr 1fr}.aipp-cc-actions a{font-size:17px!important}.aipp-quick-row button{padding:7px 9px}}
 `;document.head.appendChild(style);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{setup();if($('#customersView')?.classList.contains('active'))compactRender()},{once:true});else{setup();if($('#customersView')?.classList.contains('active'))compactRender()}
})();

/* ===== AIPP V6.0.5 - CUSTOMER LIST DENSITY FIX ===== */
(()=>{
 const E=s=>esc(String(s??''));
 function queueLabel(c){const q=c.loanResult?.queue||c.loanResult?.result||'';return q==='approved'?'Approved Queue':q==='reject'||q==='rejected'?'Reject Queue':q==='sales'||q==='supplement'?'Sales Queue':''}
 function isApproved(c){const q=c.loanResult?.queue||c.loanResult?.result||'';return q==='approved'}
 function currentList(){
  const raw=($('#globalSearch')?.value||'').trim(),q=String(raw).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase(),qd=String(raw).replace(/\D/g,''),sf=$('#statusFilter')?.value||'',src=$('#sourceFilter')?.value||'',carrier=$('#carrierFilter')?.value||'',region=$('#aippRegionFilter')?.value||'',quick=document.querySelector('.aipp-cq.active')?.dataset.q||'all';
  return state.customers.filter(c=>{const cn=String(c.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase(),cp=normalizePhone(c.phone);let ok=(!raw||cn.includes(q)||(qd.length>=4&&cp.includes(qd)))&&(!sf||c.status===sf)&&(!state.settings.showSourceInfo||!src||c.source===src)&&carrierMatches(c.phone,carrier)&&(!region||c.region===region||c.province===region);if(quick==='process')ok=ok&&['Không nghe','Đang tư vấn','Đã gửi thông tin','Hẹn gọi lại'].includes(c.status);if(quick==='potential')ok=ok&&c.status==='Tiềm năng';if(quick==='followup')ok=ok&&!!c.followup;if(quick==='today'){const f=c.followup?new Date(c.followup):null,n=new Date();ok=ok&&!!f&&f.getFullYear()===n.getFullYear()&&f.getMonth()===n.getMonth()&&f.getDate()===n.getDate();}if(quick==='overdue'){const f=c.followup?new Date(c.followup).getTime():0;ok=ok&&f>0&&f<Date.now();}if(quick==='stale'){const days=window.aippStaleCustomerDays?window.aippStaleCustomerDays():7,cut=Date.now()-days*86400000,events=(Array.isArray(c.timeline)?c.timeline:[]).filter(e=>['call','zalo','sms'].includes(String(e.type||''))).map(e=>new Date(e.at||0).getTime()).filter(Number.isFinite),last=events.length?Math.max(...events):new Date(c.createdAt||c.updatedAt||0).getTime();ok=ok&&(!last||last<cut);}return ok;});
 }
 let customerPage=1, customerPageSize=25;
 try{const saved=Number(localStorage.getItem('aipp-customer-page-size'));if(Number.isFinite(saved)&&saved>=5&&saved<=100)customerPageSize=Math.round(saved)}catch(_){}
 function draw(){
  const box=$('#customerList');if(!box)return;
  const all=currentList(),count=$('#aippCustomerCount');if(count)count.textContent=`${all.length} khách`;
  const pages=Math.max(1,Math.ceil(all.length/customerPageSize));
  if(customerPage>pages)customerPage=pages;if(customerPage<1)customerPage=1;
  const from=(customerPage-1)*customerPageSize,list=all.slice(from,from+customerPageSize);
  box.innerHTML=list.length?list.map((c,i)=>{const net=classifyPhone(c.phone).origin,q=queueLabel(c),approved=isApproved(c),amount=approved&&c.loanResult?.amount?Number(String(c.loanResult.amount).replace(/\D/g,'')||0).toLocaleString('vi-VN')+' ₫':'';return `<article class="aipp-customer-compact v605 ${approved?'is-approved':''}" data-customer-id="${E(c.id)}">${approved?'<div class="aipp-success-label">✓ VAY THÀNH CÔNG</div>':''}<div class="aipp-cc-head"><div class="aipp-cc-person"><strong><span class="aipp-v120-index">${from+i+1}.</span> ${E(c.name)}</strong><span>${E(c.phone)}${net?` · ${carrierSymbol(net)}`:''}</span></div><button type="button" class="aipp-cc-more" data-cc-more="${E(c.id)}" aria-label="Thêm thao tác">⋮</button></div><div class="aipp-cc-tags"><span class="status-pill ${statusClass(c.status)}">${E(c.status)}</span><span class="mini-pill ${zaloPillClass(c.zaloStatus)}">${zaloLabel(c.zaloStatus)}</span>${q?`<span class="mini-pill">${E(q)}${amount?' · '+E(amount):''}</span>`:''}</div><div class="aipp-cc-actions"><a href="${E(telHref(c.phone))}" data-log-contact="call" data-log-id="${E(c.id)}">📞<span>Gọi</span></a><a href="${E(zaloHref(c.phone))}" data-log-contact="zalo" data-log-id="${E(c.id)}">💬<span>Zalo</span></a><a href="${E(smsHref(c.phone,''))}">✉️<span>SMS</span></a><button type="button" data-cc-detail="${E(c.id)}">›</button></div></article>`}).join(''):'<div class="muted" style="padding:14px">Không tìm thấy khách hàng.</div>';
  let pager=$('#aippV120Pager');
  if(!pager){pager=document.createElement('div');pager.id='aippV120Pager';pager.className='aipp-v120-pager';box.insertAdjacentElement('afterend',pager)}
  const first=all.length?from+1:0,last=Math.min(from+customerPageSize,all.length);
  const buttons=[];let a=Math.max(1,customerPage-2),b=Math.min(pages,a+4);a=Math.max(1,b-4);
  for(let n=a;n<=b;n++)buttons.push(`<button type="button" data-v120-page="${n}" class="${n===customerPage?'active':''}">${n}</button>`);
  pager.innerHTML=`<div class="aipp-v120-page-head"><strong>${first}–${last} / ${all.length} khách</strong><label>Hiển thị <select id="aippV120PageSize">${[20,25,30,50].includes(customerPageSize)?'':`<option value="${customerPageSize}">${customerPageSize}</option>`}<option value="20">20</option><option value="25">25</option><option value="30">30</option><option value="50">50</option></select></label></div><div class="aipp-v120-page-nav"><button type="button" data-v120-prev ${customerPage<=1?'disabled':''}>‹ Trước</button>${a>1?'<span>…</span>':''}${buttons.join('')}${b<pages?'<span>…</span>':''}<button type="button" data-v120-next ${customerPage>=pages?'disabled':''}>Sau ›</button></div>`;
  const size=$('#aippV120PageSize');if(size)size.value=String(customerPageSize);
 }
 // Make the final renderer authoritative so legacy wrappers cannot restore old cards.
 renderCustomers=draw;
 function resetCustomerPage(){customerPage=1}
 function scrollCustomerListTop(){const el=$('#customerList');if(el)el.scrollIntoView({behavior:'smooth',block:'start'})}
 document.addEventListener('click',e=>{
  const pg=e.target.closest('[data-v120-page]');if(pg){customerPage=Number(pg.dataset.v120Page)||1;draw();scrollCustomerListTop();return}
  if(e.target.closest('[data-v120-prev]')){if(customerPage>1){customerPage--;draw();scrollCustomerListTop()}return}
  if(e.target.closest('[data-v120-next]')){const pages=Math.max(1,Math.ceil(currentList().length/customerPageSize));if(customerPage<pages){customerPage++;draw();scrollCustomerListTop()}return}
 },true);
 document.addEventListener('aipp-page-size-changed',e=>{customerPageSize=Math.max(5,Math.min(100,Math.round(Number(e.detail?.size)||25)));customerPage=1;draw();});
 document.addEventListener('change',e=>{
  if(e.target?.id==='aippV120PageSize'){customerPageSize=Math.max(5,Math.min(100,Math.round(Number(e.target.value)||25)));try{localStorage.setItem('aipp-customer-page-size',String(customerPageSize))}catch(_){}customerPage=1;draw();return}
  if(['statusFilter','sourceFilter','carrierFilter','aippRegionFilter'].includes(e.target?.id)){resetCustomerPage();setTimeout(draw,0)}
 },true);
 $('#globalSearch')?.addEventListener('input',()=>{resetCustomerPage();setTimeout(draw,0)},true);
 function arrange(){const view=$('#customersView');if(!view)return;$('#aippV120Mode')?.remove();document.body.classList.toggle('aipp-customers-active',view.classList.contains('active'));const filters=$('#aippCustomerFilterDrawer')||view.querySelector('.filters');if(filters){filters.style.setProperty('display','none','important');filters.classList.remove('open');}
  let tools=$('#aippCustomerMiniTools');if(!tools){tools=document.createElement('div');tools.id='aippCustomerMiniTools';tools.className='aipp-customer-mini-tools';tools.innerHTML=`<button type="button" id="aippNextMini">▶ Khách tiếp theo</button><button type="button" id="aippOpenFilters">⚙ Lọc</button>`;const toolbar=view.querySelector('.aipp-customer-toolbar');toolbar?.appendChild(tools);}
  let dlg=$('#aippCustomerFilterDialog');if(!dlg){dlg=document.createElement('dialog');dlg.id='aippCustomerFilterDialog';dlg.innerHTML=`<div class="dialog-form aipp-filter-sheet"><div class="dialog-head"><h3>⚙ Bộ lọc khách</h3><button type="button" class="icon-btn" data-v605-close>✕</button></div><div id="aippFilterSlots" class="aipp-filter-slots"></div><div class="dialog-actions"><button type="button" class="secondary" id="aippClearCustomerFilters">Xóa lọc</button><button type="button" class="primary" data-v605-close>Áp dụng</button></div></div>`;document.body.appendChild(dlg);const slots=dlg.querySelector('#aippFilterSlots');['statusFilter','sourceFilter','carrierFilter'].forEach(id=>{const x=$('#'+id);if(x){const lab=document.createElement('label');lab.className='field';lab.innerHTML=`<span>${id==='statusFilter'?'Trạng thái':id==='sourceFilter'?'Nguồn khách':'Nhà mạng'}</span>`;lab.appendChild(x);slots.appendChild(lab);}});const next=$('#nextCustomerBtn');if(next)next.style.setProperty('display','none','important');}
 }
 const oldShow605=showView;showView=function(name){oldShow605(name);document.body.classList.toggle('aipp-customers-active',name==='customers');if(name==='customers')setTimeout(()=>{arrange();draw()},0)};
 const oldAll605=renderAll;renderAll=function(){oldAll605();if($('#customersView')?.classList.contains('active')){arrange();draw()}};
 document.addEventListener('click',e=>{if(e.target.closest('#aippOpenFilters')){$('#aippCustomerFilterDialog')?.showModal();return}if(e.target.closest('[data-v605-close]')){$('#aippCustomerFilterDialog')?.close();draw();return}if(e.target.closest('#aippNextMini')){$('#nextCustomerBtn')?.click();return}if(e.target.closest('#aippClearCustomerFilters')){['statusFilter','sourceFilter','carrierFilter','aippRegionFilter'].forEach(id=>{const x=$('#'+id);if(x)x.value=''});draw();return}},true);
 ['input','change'].forEach(ev=>document.addEventListener(ev,e=>{if(['globalSearch','statusFilter','sourceFilter','carrierFilter'].includes(e.target?.id))setTimeout(draw,0)},true));
 const st=document.createElement('style');st.id='aippV605CustomerDensity';st.textContent=`
 body.aipp-customers-active .topbar{padding-bottom:10px!important}body.aipp-customers-active .top-actions{gap:7px!important;margin-top:8px!important}body.aipp-customers-active #globalSearch{min-height:46px!important;border-radius:14px!important}body.aipp-customers-active #addCustomerBtn{min-height:42px!important;padding:8px 12px!important}body.aipp-customers-active .pp-mobile-tools .secondary{min-height:42px!important;padding:8px 10px!important}
 #customersView .aipp-customer-toolbar{margin-bottom:6px!important}.aipp-customer-title{padding-bottom:5px!important}.aipp-quick-row{padding-bottom:4px!important}.aipp-customer-mini-tools{display:flex;justify-content:space-between;gap:8px;margin-top:3px}.aipp-customer-mini-tools button{border:0;background:#eef2f7;color:#27364b;border-radius:11px;padding:8px 10px;font-size:12px;font-weight:800}.aipp-customer-mini-tools #aippNextMini{flex:1}.aipp-customer-mini-tools #aippOpenFilters{flex:0 0 auto}
 #customersView .customer-list{gap:6px!important}.aipp-customer-compact.v605{padding:10px 11px!important;margin-bottom:7px!important;border-radius:16px!important}.aipp-customer-compact.v605 .aipp-cc-person strong{font-size:15px!important}.aipp-customer-compact.v605 .aipp-cc-person span{font-size:12px!important}.aipp-customer-compact.v605 .aipp-cc-tags{margin:6px 0!important}.aipp-customer-compact.v605 .aipp-cc-actions{padding-top:6px!important}.aipp-customer-compact.v605 .aipp-cc-actions a,.aipp-customer-compact.v605 .aipp-cc-actions button{height:32px!important}.aipp-success-label{margin-bottom:4px!important}
 .aipp-filter-sheet{padding:16px!important}.aipp-filter-slots{display:grid;gap:10px}.aipp-filter-slots select{width:100%;border:1px solid #e2e8f0;background:#fff;border-radius:12px;padding:11px}.aipp-filter-sheet .dialog-actions{display:grid;grid-template-columns:1fr 1fr}

 #aippV120Mode{font-size:11px;color:#7b8794;text-align:right;margin:3px 1px 7px;font-weight:800}.aipp-v120-index{color:#94a3b8;font-size:12px}.aipp-v120-pager{padding:10px 2px 18px}.aipp-v120-page-head{display:flex;align-items:center;justify-content:space-between;gap:8px;color:#64748b;font-size:12px;margin:2px 2px 9px}.aipp-v120-page-head label{display:flex;align-items:center;gap:5px}.aipp-v120-page-head select{border:1px solid #dce3ea;border-radius:9px;background:#fff;color:#172033;padding:6px 7px;font-weight:800}.aipp-v120-page-nav{display:flex;align-items:center;justify-content:center;gap:5px;flex-wrap:wrap}.aipp-v120-page-nav button{min-width:35px;min-height:36px;border:0;border-radius:10px;background:#eef2f7;color:#27364b;font-weight:900;padding:6px 9px}.aipp-v120-page-nav button.active{background:#e83282;color:#fff}.aipp-v120-page-nav button:disabled{opacity:.35}.aipp-v120-page-nav span{color:#94a3b8}
 @media(max-width:620px){body.aipp-customers-active .top-actions{grid-template-columns:minmax(0,1fr) auto auto!important}body.aipp-customers-active #globalSearch{grid-column:1/-1!important}.aipp-customer-title b{font-size:18px!important}.aipp-quick-row button{padding:6px 9px!important;font-size:11px!important}.aipp-customer-compact.v605 .aipp-cc-actions{grid-template-columns:repeat(4,1fr)!important}.aipp-customer-compact.v605 .aipp-cc-actions a span{display:inline!important}}
 `;document.head.appendChild(st);
 arrange();if($('#customersView')?.classList.contains('active'))draw();
})();

/* ===== AIPP V6.0.6 - CUSTOMER DETAIL HEADER + OVERVIEW COMPACT ===== */
(()=>{
  const prevDetailV606=renderDetail;
  function optimizeCustomerDetailV606(){
    const p=document.querySelector('#detailPanel');
    const c=state.customers.find(x=>x.id===selectedCustomerId);
    if(!p||!c)return;
    p.classList.add('v606-detail');

    // Compact identity: keep existing business actions in the overflow area, no data changes.
    const summary=p.querySelector('.customer-summary');
    if(summary){
      summary.classList.add('v606-summary');
      const main=summary.querySelector('.customer-summary-main');
      if(main){
        const oldBadges=main.querySelector('.phone-class');
        if(oldBadges) oldBadges.style.display='none';
        let meta=main.querySelector('.v606-identity-meta');
        if(!meta){meta=document.createElement('div');meta.className='v606-identity-meta';main.appendChild(meta)}
        const queue=c.loanResult?.queue;
        const qText=queue==='approved'?'Approved Queue':queue==='reject'?'Reject Queue':queue==='sales'?'Sales Queue':queue==='processing'?'Đang xử lý':'';
        meta.innerHTML=`<span class="status-pill ${statusClass(c.status)}">${esc(c.status)}</span>${qText?`<span class="mini-pill v606-queue ${queue||''}">${esc(qText)}</span>`:''}`;
      }
      const head=summary.querySelector('.customer-head-actions');
      if(head){head.classList.add('v606-overflow-actions');}
    }

    // Main actions are always immediately below customer identity.
    let actions=p.querySelector('.contact-actions');
    if(actions){
      actions.classList.add('v606-main-actions');
      if(!actions.querySelector('[data-v606-followup]')){
        const b=document.createElement('button');
        b.type='button'; b.className='action-btn action-followup'; b.dataset.v606Followup=c.id;
        b.innerHTML='<span>📅</span><span>Hẹn</span>';
        actions.appendChild(b);
      }
      summary?.insertAdjacentElement('afterend',actions);
    }

    const tabs=p.querySelector('.v58-customer-tabs');
    if(tabs){
      const contact=tabs.querySelector('[data-v58-tab="contact"]');
      if(contact)contact.textContent='Hoạt động';
      if(actions) actions.insertAdjacentElement('afterend',tabs);
    }

    const body=p.querySelector('.v58-tab-body');
    if(body&&tabs) tabs.insertAdjacentElement('afterend',body);
    const ov=p.querySelector('[data-v58-pane="overview"]');
    const contactPane=p.querySelector('[data-v58-pane="contact"]');
    if(contactPane){
      // Contact actions are now in the fixed top area; timeline remains under Activity.
      const sec=contactPane.querySelector('.secondary-actions');
      if(sec) sec.classList.add('v606-contact-tools');
    }
    if(ov){
      const label=ov.querySelector('.quick-status-wrap .section-label');
      if(label)label.textContent='Trạng thái';
      const info=ov.querySelector('.info-grid');
      if(info)info.classList.add('v606-info-grid');
      const note=ov.querySelector('.note-box');
      if(note){note.classList.add('v606-note'); if(!note.dataset.v606Label){note.dataset.v606Label='1';note.insertAdjacentHTML('afterbegin','<small class="v606-note-label">📝 Ghi chú</small>')}}
      const result=p.querySelector('.v6-loan-result');
      if(result){result.classList.add('v606-result');const quick=ov.querySelector('.quick-status-wrap');if(quick)quick.insertAdjacentElement('afterend',result)}
    }
  }
  renderDetail=function(){prevDetailV606();optimizeCustomerDetailV606()};
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-v606-followup]');
    if(!b)return;
    const c=state.customers.find(x=>x.id===b.dataset.v606Followup);if(!c)return;
    const statusBtn=document.querySelector(`#detailPanel [data-status="Hẹn gọi lại"][data-id="${CSS.escape(c.id)}"]`);
    if(statusBtn){statusBtn.click();return;}
    // Fallback to the already existing schedule action if status button is unavailable.
    document.querySelector(`#detailPanel [data-schedule-customer="${CSS.escape(c.id)}"]`)?.click();
  },true);
  if(selectedCustomerId)renderDetail();
})();


/* ===== AIPP V6.1 SAFE TOOLS 1-14 (clean integration) ===== */
(()=>{
 'use strict';
 const A=s=>document.querySelector(s), AA=s=>[...document.querySelectorAll(s)];
 const h=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
 const nums=v=>String(v||'').replace(/\D/g,'');
 const age=b=>{if(!b)return null;const d=new Date(b+'T00:00:00'),n=new Date();if(Number.isNaN(d.getTime())||d>n)return null;let x=n.getFullYear()-d.getFullYear();if(n.getMonth()<d.getMonth()||(n.getMonth()===d.getMonth()&&n.getDate()<d.getDate()))x--;return x};
 const birthdayToday=b=>{if(!b)return false;const d=new Date(b+'T00:00:00'),n=new Date();return !Number.isNaN(d.getTime())&&d.getMonth()===n.getMonth()&&d.getDate()===n.getDate()};
 const qLabel=c=>{const q=c?.loanResult?.queue||c?.loanResult?.result||'';return q==='approved'?'Approved Queue':(q==='reject'||q==='rejected')?'Reject Queue':(q==='sales'||q==='supplement')?'Sales Queue':q?'Đang xử lý':''};
 const lastName=n=>String(n||'').trim().split(/\s+/).filter(Boolean).pop()||'';
 function ensureUI(){
  if(!A('#aippRegionFilter')){const slots=A('#aippFilterSlots');if(slots){const lab=document.createElement('label');lab.className='field';lab.innerHTML='<span>Khu vực</span><select id="aippRegionFilter"><option value="">Tất cả khu vực</option></select>';slots.appendChild(lab);const sel=lab.querySelector('select');[...new Set(state.customers.flatMap(c=>[c.region,c.province]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi')).forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;sel.appendChild(o)});sel.addEventListener('change',()=>renderCustomers());}}
  if(!A('#aippSafeDialogs')){const host=document.createElement('div');host.id='aippSafeDialogs';host.innerHTML=`<dialog id="aippQuickSafe"><div class="dialog-form"><div class="dialog-head"><h3>👁️ Xem nhanh khách</h3><button type="button" class="icon-btn" data-safe-close="aippQuickSafe">✕</button></div><div id="aippQuickSafeBody"></div></div></dialog><dialog id="aippRunningSafe"><div class="dialog-form"><div class="dialog-head"><h3>📦 Hồ sơ đang chạy</h3><button type="button" class="icon-btn" data-safe-close="aippRunningSafe">✕</button></div><div class="row-actions"><button class="secondary" data-safe-queue="all">Tất cả</button><button class="secondary" data-safe-queue="approved">Approved</button><button class="secondary" data-safe-queue="reject">Reject</button><button class="secondary" data-safe-queue="sales">Sales</button></div><div id="aippRunningSafeBody" class="list"></div></div></dialog>`;document.body.appendChild(host);}
  const data=A('#toolData');if(data&&!A('#aippSafeExport')){data.insertAdjacentHTML('beforeend',`<section class="panel aipp-tool-card" id="aippSafeExport"><h3>📤 Xuất chuyên dụng</h3><p class="muted">Có cột STT tự động.</p><div class="tool-row"><button class="secondary" data-safe-export="phones">Danh sách SĐT</button><button class="secondary" data-safe-export="loans">Hồ sơ vay</button><button class="secondary" data-safe-export="report">Dữ liệu báo cáo</button></div></section><section class="panel aipp-tool-card"><h3>📦 Hồ sơ đang chạy</h3><p class="muted">Đọc trực tiếp Queue hiện có, không tạo dữ liệu hồ sơ thứ hai.</p><button class="primary" data-safe-running>Mở hồ sơ đang chạy</button></section>`);}
 }
 function refreshRegion(){const sel=A('#aippRegionFilter');if(!sel)return;const old=sel.value;sel.innerHTML='<option value="">Tất cả khu vực</option>';[...new Set(state.customers.flatMap(c=>[c.region,c.province]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi')).forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;sel.appendChild(o)});sel.value=[...sel.options].some(o=>o.value===old)?old:'';}
 function quick(c){ensureUI();const a=age(c.birthday),q=qLabel(c);A('#aippQuickSafeBody').innerHTML=`<div style="display:grid;gap:8px"><strong style="font-size:18px">${h(c.name)}</strong><div>${h(c.phone)}</div><div>${h(c.status||'')}${q?' · '+h(q):''}</div>${c.birthday?`<div>🎂 ${h(c.birthday)}${a!==null?' · '+a+' tuổi':''}${birthdayToday(c.birthday)?' · Sinh nhật hôm nay':''}</div>`:''}${c.province||c.region?`<div>📍 ${h([c.province,c.region].filter(Boolean).join(' · '))}</div>`:''}${c.note?`<div>📝 ${h(c.note)}</div>`:''}</div>`;A('#aippQuickSafe').showModal();}
 function running(filter='all'){ensureUI();const list=state.customers.filter(c=>c.loanResult&&(filter==='all'||(c.loanResult.queue||c.loanResult.result)===filter||((filter==='reject')&&(c.loanResult.queue==='rejected'||c.loanResult.result==='rejected'))||((filter==='sales')&&(c.loanResult.queue==='supplement'||c.loanResult.result==='supplement'))));A('#aippRunningSafeBody').innerHTML=list.length?list.map((c,i)=>`<button type="button" class="secondary" data-safe-open="${h(c.id)}" style="width:100%;text-align:left;margin:5px 0"><b>${i+1}. ${h(c.name)}</b><br><small>${h(c.phone)} · ${h(qLabel(c)||'Đang xử lý')}</small></button>`).join(''):'<p class="muted">Không có hồ sơ phù hợp.</p>';A('#aippRunningSafe').showModal();}
 function csvDownload(name,rows){if(!rows.length)return toast('Không có dữ liệu để xuất');const keys=Object.keys(rows[0]),cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"',text='\ufeff'+[keys.map(cell).join(','),...rows.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\r\n');download(name,'text/csv;charset=utf-8',text);}
 function exportKind(k){const d=new Date().toISOString().slice(0,10);if(k==='phones')csvDownload(`AIPP-SDT-${d}.csv`,state.customers.map((c,i)=>({STT:i+1,'Họ tên':c.name,'SĐT':c.phone,'Tỉnh/Thành':c.province||'','Khu vực':c.region||''})));if(k==='loans'){const l=state.customers.filter(c=>c.loanResult);csvDownload(`AIPP-Ho-so-vay-${d}.csv`,l.map((c,i)=>({STT:i+1,'Họ tên':c.name,'SĐT':c.phone,Queue:qLabel(c),'Ngày nộp':c.loanResult.submitDate||'','Số tiền':c.loanResult.amount||'','Lý do':c.loanResult.reason||''})));}if(k==='report'){const l=state.customers.filter(c=>c.loanResult);csvDownload(`AIPP-Bao-cao-raw-${d}.csv`,l.map((c,i)=>({STT:i+1,'Họ tên':c.name,'SĐT':c.phone,'Nguồn':c.source||'','Trạng thái':c.status||'',Queue:qLabel(c),'Ngày nộp':c.loanResult.submitDate||'','Giải ngân':c.loanResult.amount||'','Kỳ hạn':c.loanResult.term||'','Lãi suất':c.loanResult.rate||'','Ngày giải ngân':c.loanResult.disbursementDate||'','Lý do':c.loanResult.reason||''})));}}
 async function copyThenZalo(c,href){const text=`${lastName(c.name)} ${normalizePhone(c.phone)}`.trim();let ok=false;try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);ok=true}}catch(_){}if(!ok){try{const t=document.createElement('textarea');t.value=text;t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();ok=document.execCommand('copy');t.remove()}catch(_){}}toast(ok?`Đã copy: ${text}`:'Không copy được tên/SĐT');setTimeout(()=>{location.href=href},80);}
 function enhance(){ensureUI();refreshRegion();AA('#customerList .aipp-customer-compact').forEach(card=>{const c=state.customers.find(x=>x.id===card.dataset.customerId);if(!c)return;const p=card.querySelector('.aipp-cc-person');if(p&&!p.dataset.safeQuick){p.dataset.safeQuick='1';p.style.cursor='pointer';p.title='Chạm để xem nhanh';}if(p&&c.birthday&&!p.querySelector('.aipp-safe-age')){const a=age(c.birthday);if(a!==null)p.insertAdjacentHTML('beforeend',`<small class="aipp-safe-age" style="display:block">${a} tuổi${birthdayToday(c.birthday)?' · 🎂 Hôm nay':''}</small>`);}});}
 function numpads(){A('#phoneInput')?.setAttribute('inputmode','numeric');AA('input').forEach(e=>{const id=(e.id||'').toLowerCase();if(/phone|amount|money|term/.test(id))e.setAttribute('inputmode','numeric');else if(/rate/.test(id))e.setAttribute('inputmode','decimal')});}
 function birthdayNotice(){const list=state.customers.filter(c=>birthdayToday(c.birthday));if(!list.length)return;const key='aipp-birthday-'+new Date().toLocaleDateString('en-CA');if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'1');toast(`🎂 Hôm nay có ${list.length} khách sinh nhật: ${list.slice(0,2).map(c=>c.name).join(', ')}${list.length>2?'…':''}`,5000);}
 let listScroll=0;
 document.addEventListener('click',e=>{const card=e.target.closest('#customerList .aipp-customer-compact');if(card){const c=state.customers.find(x=>x.id===card.dataset.customerId);if(c&&e.target.closest('.aipp-cc-person')){e.preventDefault();e.stopPropagation();quick(c);return}const z=e.target.closest('.aipp-cc-actions a');if(c&&z&&/Zalo/i.test(z.textContent)){e.preventDefault();e.stopImmediatePropagation();copyThenZalo(c,z.href);return}const detail=e.target.closest('[data-cc-detail]');if(detail)listScroll=window.scrollY;}const cl=e.target.closest('[data-safe-close]');if(cl){A('#'+cl.dataset.safeClose)?.close();return}if(e.target.closest('[data-safe-running]')){running();return}const q=e.target.closest('[data-safe-queue]');if(q){A('#aippRunningSafe')?.close();running(q.dataset.safeQueue);return}const ex=e.target.closest('[data-safe-export]');if(ex){exportKind(ex.dataset.safeExport);return}const op=e.target.closest('[data-safe-open]');if(op){selectedCustomerId=op.dataset.safeOpen;A('#aippRunningSafe')?.close();showView('customers');renderAll();return}},true);
 const obs=new MutationObserver(()=>enhance());
 function init(){ensureUI();numpads();birthdayNotice();enhance();const list=A('#customerList');if(list)obs.observe(list,{childList:true});A('#globalSearch')?.setAttribute('placeholder','Tìm tên (có/không dấu) hoặc SĐT...');document.addEventListener('change',e=>{if(e.target?.id==='aippRegionFilter')renderCustomers()});window.addEventListener('popstate',()=>{if(listScroll)requestAnimationFrame(()=>window.scrollTo(0,listScroll))});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

/* ===== AIPP V6.1 SAFE FIX 1.16 - CUSTOMER SEARCH FINAL BINDING ===== */
(()=>{
 'use strict';
 const search=document.querySelector('#globalSearch');
 if(!search)return;
 const fold=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().trim();
 const digits=v=>String(v||'').replace(/\D/g,'');
 let timer=0;
 function matches(c,raw){
   if(!raw)return true;
   const q=fold(raw), qd=digits(raw);
   if(fold(c.name).includes(q))return true;
   if(qd){
     if(digits(c.phone).includes(qd))return true;
     if((c.extraPhones||[]).some(p=>digits(p).includes(qd)))return true;
   }
   return false;
 }
 function applySearch(){
   const raw=search.value.trim();
   // First let the latest renderer rebuild cards/filters.
   try{ renderCustomers(); }catch(_){ try{ renderAll(); }catch(__){} }
   const list=document.querySelector('#customerList');
   if(!list)return;
   const cards=[...list.querySelectorAll('[data-customer-id]')];
   cards.forEach(card=>{
     const c=state.customers.find(x=>String(x.id)===String(card.dataset.customerId));
     if(c)card.style.setProperty('display',matches(c,raw)?'':'none','important');
   });
   // If a renderer omitted alias-phone matches, append a minimal matching card only when needed.
   if(raw && digits(raw)){
     state.customers.filter(c=>matches(c,raw)).forEach(c=>{
       if(list.querySelector(`[data-customer-id="${CSS.escape(String(c.id))}"]`))return;
       const row=document.createElement('div');
       row.className='customer-row'; row.dataset.customerId=c.id;
       row.innerHTML=`<div><strong>${esc(c.name)}</strong><div class="meta">${esc(c.phone)}${(c.extraPhones||[]).some(p=>digits(p).includes(digits(raw)))?' • Khớp SĐT phụ':''}</div></div><span class="status-pill ${statusClass(c.status)}">${esc(c.status)}</span>`;
       list.appendChild(row);
     });
   }
   const visible=[...list.querySelectorAll('[data-customer-id]')].filter(x=>x.style.display!=='none');
   let empty=list.querySelector('.aipp-search-empty');
   if(!visible.length){
     if(!empty){empty=document.createElement('div');empty.className='muted aipp-search-empty';empty.style.padding='18px';empty.textContent='Không tìm thấy khách hàng.';list.appendChild(empty)}
   }else empty?.remove();
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(applySearch,30)}
 // Capture phase makes this the final safety path even when older modules have their own handlers.
 search.addEventListener('input',schedule,true);
 search.addEventListener('search',schedule,true);
 search.addEventListener('change',schedule,true);
 search.setAttribute('autocomplete','off');
 search.setAttribute('inputmode','search');
 search.placeholder='Tìm tên (có/không dấu) hoặc SĐT...';
})();

/* ===== AIPP V6.1.17 - DENSE CUSTOMER FINDER (disabled by V6.1.20 core pagination) ===== */
if(false)(()=>{
 let expandedId=null, sortMode='recent', page=1, pageSize=Math.max(5,Math.min(100,Math.round(Number(localStorage.getItem('aipp-customer-page-size'))||25)));
 const $q=s=>document.querySelector(s), E=s=>typeof esc==='function'?esc(String(s??'')):String(s??'');
 const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
 const phone=s=>String(s||'').replace(/\D/g,'');
 function filtered(){
  const raw=($q('#globalSearch')?.value||'').trim(), q=fold(raw), qd=phone(raw), sf=$q('#statusFilter')?.value||'', src=$q('#sourceFilter')?.value||'', carrier=$q('#carrierFilter')?.value||'', region=$q('#aippRegionFilter')?.value||'', quick=$q('.aipp-cq.active')?.dataset.q||'all';
  let a=state.customers.filter(c=>{const phones=[c.phone,...(Array.isArray(c.extraPhones)?c.extraPhones:[])].map(phone);let ok=(!raw||fold(c.name).includes(q)||(qd&&phones.some(p=>p.includes(qd))))&&(!sf||c.status===sf)&&(!state.settings.showSourceInfo||!src||c.source===src)&&carrierMatches(c.phone,carrier)&&(!region||c.region===region||c.province===region);if(quick==='process')ok=ok&&['Không nghe','Đang tư vấn','Đã gửi thông tin','Hẹn gọi lại'].includes(c.status);if(quick==='potential')ok=ok&&c.status==='Tiềm năng';if(quick==='followup')ok=ok&&!!c.followup;return ok;});
  if(sortMode==='az')a.sort((x,y)=>String(x.name||'').localeCompare(String(y.name||''),'vi'));
  else if(sortMode==='followup')a.sort((x,y)=>(x.followup?new Date(x.followup).getTime():Infinity)-(y.followup?new Date(y.followup).getTime():Infinity));
  else a.sort((x,y)=>new Date(y.updatedAt||y.createdAt||0)-new Date(x.updatedAt||x.createdAt||0));
  return a;
 }
 function renderDense(){
  const box=$q('#customerList');if(!box)return;const all=filtered(), count=$q('#aippCustomerCount');if(count)count.textContent=`${all.length} khách`;
  const pages=Math.max(1,Math.ceil(all.length/pageSize)); if(page>pages)page=pages; if(page<1)page=1;
  const from=(page-1)*pageSize, list=all.slice(from,from+pageSize);
  box.innerHTML=list.length?list.map((c,i)=>{const open=expandedId===c.id,net=classifyPhone(c.phone).origin;return `<article class="aipp-dense-customer ${open?'open':''}" data-dense-id="${E(c.id)}"><button type="button" class="aipp-dense-main" data-dense-toggle="${E(c.id)}"><span class="aipp-dense-num">${from+i+1}</span><span class="aipp-dense-info"><strong>${E(c.name)}</strong><small>${E(c.phone)}${net?' · '+carrierSymbol(net):''}</small></span><span class="aipp-dense-side"><span class="aipp-dense-status">${E(c.status||'Chưa xác định')}</span><b>${open?'⌃':'›'}</b></span></button><div class="aipp-dense-expand"><div class="aipp-dense-tags"><span class="mini-pill ${zaloPillClass(c.zaloStatus)}">${zaloLabel(c.zaloStatus)}</span>${c.followup?`<span class="mini-pill">📅 ${E(fmtDate(c.followup))}</span>`:''}</div><div class="aipp-dense-actions"><a href="${E(telHref(c.phone))}" data-log-contact="call" data-log-id="${E(c.id)}">📞 Gọi</a><a href="${E(zaloHref(c.phone))}" data-log-contact="zalo" data-log-id="${E(c.id)}">💬 Zalo</a><a href="${E(smsHref(c.phone,''))}">✉️ SMS</a><button type="button" data-dense-follow="${E(c.id)}">📅 Nhắc</button><button type="button" data-dense-detail="${E(c.id)}">Chi tiết</button></div></div></article>`}).join(''):'<div class="muted" style="padding:18px">Không tìm thấy khách hàng.</div>';
  let pager=$q('#aippCustomerPager');if(!pager){pager=document.createElement('div');pager.id='aippCustomerPager';box.insertAdjacentElement('afterend',pager)}
  const first=all.length?from+1:0,last=Math.min(from+pageSize,all.length), nums=[];for(let n=Math.max(1,page-2);n<=Math.min(pages,page+2);n++)nums.push(`<button type="button" data-page="${n}" class="${n===page?'active':''}">${n}</button>`);
  pager.innerHTML=`<div class="aipp-page-summary"><span>${first}–${last} / ${all.length} khách</span><label>Hiển thị <select id="aippPageSize"><option>20</option><option>25</option><option>30</option><option>50</option></select></label></div><div class="aipp-page-nav"><button type="button" data-page-prev ${page<=1?'disabled':''}>‹ Trước</button>${page>3?'<span>…</span>':''}${nums.join('')}${page<pages-2?'<span>…</span>':''}<button type="button" data-page-next ${page>=pages?'disabled':''}>Sau ›</button></div>`;
  const ps=$q('#aippPageSize');if(ps)ps.value=String(pageSize);
 }
 function setup(){const view=$q('#customersView');if(!view||$q('#aippDenseControls'))return;const toolbar=view.querySelector('.aipp-customer-toolbar')||view;const d=document.createElement('div');d.id='aippDenseControls';d.className='aipp-dense-controls';d.innerHTML=`<button type="button" id="aippDenseFilter">☰ Bộ lọc</button><select id="aippDenseSort" aria-label="Sắp xếp"><option value="recent">↕ Mới cập nhật</option><option value="az">A–Z Tên khách</option><option value="followup">📅 Lịch hẹn gần</option></select><button type="button" id="aippDenseNext">▶ Tiếp theo</button>`;toolbar.appendChild(d);$q('#aippCustomerMiniTools')?.remove();}
 document.addEventListener('click',e=>{const t=e.target.closest('[data-dense-toggle]');if(t){expandedId=expandedId===t.dataset.denseToggle?null:t.dataset.denseToggle;renderDense();return}const detail=e.target.closest('[data-dense-detail]');if(detail){selectedCustomerId=detail.dataset.denseDetail;renderDetail();setTimeout(()=>$q('#detailPanel')?.scrollIntoView({behavior:'smooth',block:'start'}),30);return}const f=e.target.closest('[data-dense-follow]');if(f){const c=state.customers.find(x=>x.id===f.dataset.denseFollow);if(c&&typeof openFollowup==='function')openFollowup(c);return}if(e.target.closest('#aippDenseFilter')){$q('#aippCustomerFilterDialog')?.showModal();return}if(e.target.closest('#aippDenseNext')){$q('#nextCustomerBtn')?.click();return}const pg=e.target.closest('[data-page]');if(pg){page=Number(pg.dataset.page)||1;expandedId=null;renderDense();$q('#customerList')?.scrollIntoView({behavior:'smooth',block:'start'});return}if(e.target.closest('[data-page-prev]')){if(page>1){page--;expandedId=null;renderDense();$q('#customerList')?.scrollIntoView({behavior:'smooth',block:'start'})}return}if(e.target.closest('[data-page-next]')){const pages=Math.max(1,Math.ceil(filtered().length/pageSize));if(page<pages){page++;expandedId=null;renderDense();$q('#customerList')?.scrollIntoView({behavior:'smooth',block:'start'})}return}},true);
 document.addEventListener('change',e=>{if(e.target?.id==='aippDenseSort'){sortMode=e.target.value;page=1;renderDense()}if(e.target?.id==='aippPageSize'){pageSize=Math.max(5,Math.min(100,Math.round(Number(e.target.value)||25)));try{localStorage.setItem('aipp-customer-page-size',String(pageSize))}catch(_){}page=1;expandedId=null;renderDense()}if(['statusFilter','sourceFilter','carrierFilter','aippRegionFilter'].includes(e.target?.id)){page=1;setTimeout(renderDense,0)}},true);
 $q('#globalSearch')?.addEventListener('input',()=>{page=1;setTimeout(renderDense,0)},true);
 const oldShow=showView;showView=function(n){oldShow(n);if(n==='customers')setTimeout(()=>{setup();renderDense()},0)};
 const oldAll=renderAll;renderAll=function(){oldAll();if($q('#customersView')?.classList.contains('active'))setTimeout(()=>{setup();renderDense()},0)};
 renderCustomers=renderDense;
 const st=document.createElement('style');st.textContent=`
 body.aipp-customers-active .topbar{position:sticky;top:0;z-index:30}body.aipp-customers-active #globalSearch{box-shadow:0 4px 14px rgba(15,23,42,.08)}
 #customersView .aipp-quick-row{display:none!important}#aippDenseControls{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:7px;margin:5px 0 9px}#aippDenseControls button,#aippDenseControls select{min-height:38px;border:0;border-radius:11px;background:#eef2f7;color:#172033;font-weight:800;padding:7px 10px;font-size:12px}#aippDenseControls select{width:100%}
 #customersView .customer-list{display:block!important}.aipp-dense-customer{background:#fff;border:1px solid #e1e6ed;border-left:5px solid #dbe4ed;border-radius:14px;margin:0 0 6px;overflow:hidden}.aipp-dense-main{width:100%;border:0;background:#fff;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;text-align:left;color:#172033}.aipp-dense-info{min-width:0;display:flex;flex-direction:column}.aipp-dense-info strong{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.aipp-dense-info small{font-size:12px;color:#718096;margin-top:2px}.aipp-dense-side{display:flex;align-items:center;gap:8px;min-width:0}.aipp-dense-status{max-width:95px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px;color:#687386;background:#f2f5f8;padding:5px 7px;border-radius:999px}.aipp-dense-side b{font-size:21px}.aipp-dense-expand{display:none;border-top:1px solid #edf0f4;padding:8px 10px 10px;background:#fbfcfe}.aipp-dense-customer.open .aipp-dense-expand{display:block}.aipp-dense-tags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:7px}.aipp-dense-actions{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}.aipp-dense-actions a,.aipp-dense-actions button{display:flex;align-items:center;justify-content:center;text-decoration:none;border:0;border-radius:9px;min-height:35px;background:#edf2f8;color:#172033;font-size:11px;font-weight:800;padding:5px}

 #aippCustomerPager{padding:8px 2px 18px}.aipp-page-summary{display:flex;align-items:center;justify-content:space-between;gap:8px;color:#687386;font-size:12px;margin:4px 2px 8px}.aipp-page-summary label{display:flex;align-items:center;gap:5px}.aipp-page-summary select{border:1px solid #dfe5ec;border-radius:8px;background:#fff;padding:5px 7px;color:#172033;font-weight:700}.aipp-page-nav{display:flex;align-items:center;justify-content:center;gap:5px;flex-wrap:wrap}.aipp-page-nav button{border:0;border-radius:9px;min-width:35px;min-height:35px;background:#edf2f8;color:#172033;font-weight:800;padding:6px 9px}.aipp-page-nav button.active{background:#e83282;color:#fff}.aipp-page-nav button:disabled{opacity:.4}.aipp-page-nav span{color:#8490a0}.aipp-dense-num{flex:0 0 26px;height:26px;border-radius:8px;background:#f2f5f8;display:grid;place-items:center;font-size:11px;font-weight:900;color:#718096}
 @media(max-width:620px){#customersView .panel:has(#customerList){padding:8px!important}.aipp-dense-actions{grid-template-columns:repeat(3,1fr)}.aipp-dense-actions button:last-child{grid-column:span 2}.aipp-dense-status{max-width:82px}#aippDenseControls{grid-template-columns:auto 1fr auto}}
 `;document.head.appendChild(st);setup();if($q('#customersView')?.classList.contains('active'))renderDense();
})();


/* ===== AIPP V6.1.19 - PAGINATION BOOT GUARANTEE (disabled by V6.1.20) ===== */
if(false)(()=>{
  const boot=()=>{
    try{
      const v=document.querySelector('#customersView');
      if(v && !document.querySelector('#aipp119Marker')){
        const m=document.createElement('div');m.id='aipp119Marker';m.textContent='Danh sách · 25 khách/trang';
        m.style.cssText='font-size:11px;color:#7b8794;text-align:right;margin:2px 3px 6px;font-weight:700';
        const list=document.querySelector('#customerList');list?.parentElement?.insertBefore(m,list);
      }
      if(typeof renderCustomers==='function') renderCustomers();
    }catch(e){console.error('AIPP 1.19 pagination boot',e)}
  };
  window.addEventListener('load',()=>setTimeout(boot,80),{once:true});
  document.addEventListener('click',e=>{if(e.target.closest('[data-view="customers"]'))setTimeout(boot,80)},true);
})();


/* ===== AIPP V6.1.26 - SMS HISTORY + 30 DAY DUPLICATE GUARD ===== */
(()=>{
  const DAYS=()=>window.aippSmsDuplicateDays(), WINDOW_MS=()=>window.aippSmsDuplicateWindowMs();
  const byId=id=>state.customers.find(c=>String(c.id)===String(id));
  const sentTime=s=>{const t=new Date(s?.sentAt||'').getTime();return Number.isFinite(t)?t:0};
  const scheduledTime=s=>{const t=new Date(s?.sendAt||'').getTime();return Number.isFinite(t)?t:0};
  const customerPhone=id=>normalizePhone(byId(id)?.phone||'');
  function sameCustomerOrPhone(s,id){
    if(String(s.customerId)===String(id))return true;
    const p=customerPhone(id),c=byId(s.customerId);return !!p&&!!c&&normalizePhone(c.phone)===p;
  }
  function check(customerId,excludeId=''){
    const now=Date.now();
    const sent=state.schedules.filter(s=>String(s.id)!==String(excludeId)&&sameCustomerOrPhone(s,customerId)&&s.status==='sent'&&sentTime(s)>0).sort((a,b)=>sentTime(b)-sentTime(a));
    let lastSent=sent[0]||null;
    const c=byId(customerId),nativeAt=c?window.aipp127NativeLastSent(c.phone):0;
    if(nativeAt>(lastSent?sentTime(lastSent):0))lastSent={id:'native-history',customerId,sentAt:new Date(nativeAt).toISOString(),sendAt:new Date(nativeAt).toISOString(),status:'sent',sentChannel:'sms',nativeHistory:true};
    const recent=lastSent&&now-sentTime(lastSent)<=WINDOW_MS()?lastSent:null;
    const scheduled=state.schedules.filter(s=>String(s.id)!==String(excludeId)&&sameCustomerOrPhone(s,customerId)&&s.status==='scheduled'&&scheduledTime(s)>now).sort((a,b)=>scheduledTime(a)-scheduledTime(b));
    return {recent,lastSent,nextScheduled:scheduled[0]||null,pending:scheduled};
  }
  window.aipp126DuplicateCheck=check;
  window.__aipp126DuplicateOverrides=window.__aipp126DuplicateOverrides||{};

  // 6.1.27: helper is defined before all SMS modules, so older wrappers can always call it safely.
  window.aipp126NativeSchedule=window.aipp127NativeSchedule;

  const baseSaveSchedule=saveSchedule;
  saveSchedule=async function(){
    const customerId=$('#scheduleCustomerInput')?.value, existingId=$('#scheduleId')?.value||'';
    if(!customerId)return baseSaveSchedule();
    const id=existingId||crypto.randomUUID(); if(!existingId&&$('#scheduleId'))$('#scheduleId').value=id;
    const existing=state.schedules.find(s=>String(s.id)===String(id));
    const info=check(customerId,id);
    let allow=!!existing?.duplicateOverride;
    if((info.recent||info.nextScheduled)&&!allow){
      const c=byId(customerId),lines=[];
      if(info.recent)lines.push(`• Đã gửi thành công: ${fmtDate(info.recent.sentAt||info.recent.sendAt)} (${window.aipp127DaysAgo(info.recent.sentAt||info.recent.sendAt)})`);
      if(info.nextScheduled)lines.push(`• Đã có lịch chờ gửi: ${fmtDate(info.nextScheduled.sendAt)}`);
      const ok=confirm(`⚠ CẢNH BÁO GỬI TRÙNG\n\nKhách ${c?.name||''} (${c?.phone||''}) đang có lịch sử tin nhắn:\n${lines.join('\n')}\n\nBạn vẫn muốn lưu lịch gửi này?`);
      if(!ok){toast('Đã hủy để tránh gửi trùng');return false;}
      allow=!!info.recent;
    }
    window.__aipp126DuplicateOverrides[id]=allow;
    const ok=await baseSaveSchedule();
    if(ok){
      const s=state.schedules.find(x=>String(x.id)===String(id));
      if(s){s.duplicateOverride=allow;s.duplicateWarningConfirmedAt=allow?new Date().toISOString():(s.duplicateWarningConfirmedAt||'');save({render:false});}
      setTimeout(()=>{decorateAll();renderSchedules();},0);
    }
    delete window.__aipp126DuplicateOverrides[id];
    return ok;
  };

  function daysAgo(at){const n=Math.max(0,Math.floor((Date.now()-new Date(at).getTime())/86400000));return n===0?'hôm nay':`${n} ngày trước`}
  function indicatorHtml(c){
    const x=check(c.id),parts=[];
    if(x.nextScheduled)parts.push(`<span class="aipp126-msg-pill scheduled" title="Đã lên lịch ${esc(fmtDate(x.nextScheduled.sendAt))}">🕒 ${esc(fmtDate(x.nextScheduled.sendAt))}</span>`);
    if(x.lastSent){const recent=x.recent?' recent':'';parts.push(`<span class="aipp126-msg-pill sent${recent}" title="Đã gửi ${esc(fmtDate(x.lastSent.sentAt||x.lastSent.sendAt))}">✅ ${esc(fmtDate(x.lastSent.sentAt||x.lastSent.sendAt))}${x.recent?` · ${esc(daysAgo(x.lastSent.sentAt||x.lastSent.sendAt))}`:''}</span>`);}
    return parts.join('');
  }
  function decorateCustomers(){
    document.querySelectorAll('#customerList [data-dense-id],#customerList [data-customer-id]').forEach(card=>{
      const id=card.dataset.denseId||card.dataset.customerId,c=byId(id);if(!c)return;
      card.querySelectorAll('.aipp126-msg-state').forEach(x=>x.remove());
      const html=indicatorHtml(c);if(!html)return;
      const box=document.createElement('div');box.className='aipp126-msg-state';box.innerHTML=html;
      const info=card.querySelector('.aipp-dense-info')||card.querySelector('.aipp-cc-person')||card.firstElementChild;
      info?.appendChild(box);
    });
  }
  function decorateDetail(){
    const p=$('#detailPanel'),c=byId(selectedCustomerId);if(!p||!c)return;
    p.querySelectorAll('.aipp126-message-summary').forEach(x=>x.remove());
    const x=check(c.id);if(!x.lastSent&&!x.nextScheduled)return;
    const sec=document.createElement('section');sec.className='aipp126-message-summary';
    sec.innerHTML=`<div class="section-label">✉️ Lịch sử gửi tin</div><div class="aipp126-message-grid">${x.nextScheduled?`<div><span>Đã lên lịch</span><strong>${esc(fmtDate(x.nextScheduled.sendAt))}</strong></div>`:''}${x.lastSent?`<div class="${x.recent?'recent':''}"><span>Đã gửi gần nhất</span><strong>${esc(fmtDate(x.lastSent.sentAt||x.lastSent.sendAt))}</strong>${x.lastSent?`<small>${esc(window.aipp127DaysAgo(x.lastSent.sentAt||x.lastSent.sendAt))}${x.recent?` · Cảnh báo trong ${DAYS()} ngày`:''}</small>`:''}</div>`:''}</div>`;
    const note=p.querySelector('.note-box'); if(note)note.insertAdjacentElement('beforebegin',sec); else p.appendChild(sec);
  }
  function decorateSchedules(){
    const list=$('#scheduleList');if(!list)return;
    const filter=$('#scheduleStatusFilter')?.value||'';
    const schedules=[...state.schedules].filter(s=>!filter||s.status===filter).sort((a,b)=>new Date(a.sendAt)-new Date(b.sendAt));
    [...list.querySelectorAll('.schedule-row')].forEach((row,i)=>{
      row.querySelectorAll('.aipp126-schedule-time,.aipp127-schedule-extra').forEach(x=>x.remove());const s=schedules[i];if(!s)return;
      const main=row.querySelector('.schedule-main');if(!main)return;
      const c=byId(s.customerId),prior=c?window.aipp127LastSentInfo(c.id,s.id):null;
      const d=document.createElement('p');d.className='aipp126-schedule-time';
      if(s.status==='sent')d.innerHTML=`✅ <b>Đã gửi thành công:</b> ${esc(fmtDate(s.sentAt||s.sendAt))} · <b>${esc(window.aipp127DaysAgo(s.sentAt||s.sendAt))}</b>`;
      else if(s.status==='scheduled')d.innerHTML=`🕒 <b>Đã lên lịch:</b> ${esc(fmtDate(s.sendAt))}`;
      else if(s.status==='blocked')d.innerHTML=`⚠ <b>Đã chặn gửi trùng:</b> ${esc(fmtDate(s.blockedAt||new Date().toISOString()))}`;
      else if(s.status==='failed')d.innerHTML=`❌ <b>Lịch gửi bị lỗi</b>`;
      else d.innerHTML=`ℹ️ <b>${esc(scheduleStatusLabel(s.status))}</b>`;
      main.appendChild(d);

      const ex=document.createElement('div');ex.className='aipp127-schedule-extra';
      const rows=[];
      if(['failed','blocked'].includes(s.status)){
        const friendly=window.aipp127FriendlySmsError(s.lastError||'');
        rows.push(`<div class="aipp127-error-reason"><b>Nguyên nhân:</b> ${esc(friendly)}</div>`);
      }
      if(prior){rows.push(`<div class="aipp127-last-sent">🕘 <b>Đã gửi trước đó:</b> ${esc(fmtDate(prior.date))} · <strong>${esc(prior.daysText)}</strong>${prior.recent?` <span>• Trong ${window.aippSmsDuplicateDays()} ngày</span>`:''}</div>`);}
      else if(['failed','blocked','scheduled'].includes(s.status)){rows.push(`<div class="aipp127-last-sent muted">🕘 Chưa ghi nhận lần gửi SMS thành công trước đó.</div>`);}
      ex.innerHTML=rows.join(''); if(rows.length)main.appendChild(ex);

      const err=row.querySelector('.error-text');
      if(err){err.style.display='none';}
      const actions=row.querySelector('.schedule-actions')||row.querySelector('.schedule-side');
      if(actions&&['failed','blocked'].includes(s.status)&&!actions.querySelector('[data-retry-native-sms]')){
        const b=document.createElement('button');b.type='button';b.className='secondary small';b.dataset.retryNativeSms=s.id;b.textContent='↻ Gửi lại SMS';actions.appendChild(b);
      }else{
        const b=actions?.querySelector('[data-retry-native-sms]');if(b)b.textContent='↻ Gửi lại SMS';
      }
      if(actions&&!actions.querySelector('[data-delete-schedule]')){
        const b=document.createElement('button');b.type='button';b.className='danger small';b.dataset.deleteSchedule=s.id;b.textContent='🗑 Xóa';actions.appendChild(b);
      }
    });
  }
  function ensureScheduleWarning(){
    const form=$('#scheduleForm');if(!form)return null;let box=$('#aipp126DuplicateWarning');if(box)return box;
    box=document.createElement('div');box.id='aipp126DuplicateWarning';box.className='aipp126-dup-warning';
    const preview=$('#schedulePreview')?.closest('.field');if(preview)preview.insertAdjacentElement('beforebegin',box);else form.querySelector('.dialog-actions')?.insertAdjacentElement('beforebegin',box);return box;
  }
  function updateScheduleWarning(){
    const box=ensureScheduleWarning(),id=$('#scheduleCustomerInput')?.value,current=$('#scheduleId')?.value||'';if(!box||!id)return;
    const x=check(id,current),c=byId(id),rows=[];
    if(x.recent)rows.push(`<div class="bad">⚠ Đã gửi gần nhất <b>${esc(fmtDate(x.recent.sentAt||x.recent.sendAt))}</b> (${esc(daysAgo(x.recent.sentAt||x.recent.sendAt))})</div>`);
    if(x.nextScheduled)rows.push(`<div class="warn">🕒 Đã có lịch gửi <b>${esc(fmtDate(x.nextScheduled.sendAt))}</b></div>`);
    if(!rows.length)rows.push(`<div class="good">✓ Chưa có tin đã gửi trong ${DAYS()} ngày gần nhất và chưa có lịch chờ gửi.</div>`);
    box.innerHTML=`<strong>Kiểm tra chống gửi trùng</strong><small>${esc(c?.phone||'')}</small>${rows.join('')}`;
  }

  const baseOpenSchedule=openScheduleDialog;
  openScheduleDialog=function(customerId=null,scheduleId=null){baseOpenSchedule(customerId,scheduleId);setTimeout(updateScheduleWarning,0)};
  $('#scheduleCustomerInput')?.addEventListener('change',()=>setTimeout(updateScheduleWarning,0));
  $('#scheduleTimeInput')?.addEventListener('change',()=>setTimeout(updateScheduleWarning,0));

  const baseRenderDetail126=renderDetail;renderDetail=function(){baseRenderDetail126();decorateDetail();};
  const baseRenderSchedules126=renderSchedules;renderSchedules=function(){baseRenderSchedules126();decorateSchedules();};
  const baseRenderCustomers126=renderCustomers;renderCustomers=function(){baseRenderCustomers126();setTimeout(decorateCustomers,0);};
  function decorateAll(){decorateCustomers();decorateDetail();decorateSchedules();}

  const obs=new MutationObserver(muts=>{if(muts.some(m=>m.target?.id==='customerList'||m.target?.closest?.('#customerList')))setTimeout(decorateCustomers,0)});
  const list=$('#customerList');if(list)obs.observe(list,{childList:true,subtree:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(decorateAll,120)});
  window.addEventListener('focus',()=>setTimeout(decorateAll,120));

  if(!$('#aipp126Style')){const st=document.createElement('style');st.id='aipp126Style';st.textContent=`
    .aipp126-msg-state{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}.aipp126-msg-pill{display:inline-flex;align-items:center;max-width:100%;font-size:9.5px;font-weight:800;border-radius:999px;padding:3px 6px;background:#eef3f8;color:#526071;white-space:nowrap}.aipp126-msg-pill.scheduled{background:#fff2cc;color:#855d00}.aipp126-msg-pill.sent{background:#ddf7e7;color:#176a38}.aipp126-msg-pill.sent.recent{background:#ffe4e6;color:#a31d36}
    .aipp126-dup-warning{grid-column:1/-1;border:1px solid #e4e8ee;border-radius:12px;padding:10px 11px;background:#f8fafc;display:grid;gap:5px}.aipp126-dup-warning>strong{font-size:13px}.aipp126-dup-warning>small{color:#6b7280}.aipp126-dup-warning>div{font-size:12px;padding:7px 8px;border-radius:9px}.aipp126-dup-warning .good{background:#e9f9ef;color:#176a38}.aipp126-dup-warning .warn{background:#fff5d9;color:#815d06}.aipp126-dup-warning .bad{background:#ffe7ea;color:#9f2440}
    .aipp126-message-summary{margin:11px 0;border:1px solid #e5e7eb;border-radius:13px;padding:11px;background:#fbfcfe}.aipp126-message-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.aipp126-message-grid>div{border-radius:10px;background:#f1f5f9;padding:9px}.aipp126-message-grid span,.aipp126-message-grid small{display:block;font-size:10.5px;color:#667085}.aipp126-message-grid strong{display:block;font-size:12px;margin-top:3px}.aipp126-message-grid .recent{background:#fff0f2}.aipp126-message-grid .recent strong{color:#9f2440}
    .aipp126-schedule-time{font-size:11px!important;margin:5px 0 0!important;padding:6px 8px;border-radius:8px;background:#f4f7fa;color:#475569}.aipp126-bulk-warning{font-size:11px;font-weight:800;color:#9f2440;background:#fff0f2;padding:5px 7px;border-radius:8px;margin-top:5px}
    .aipp127-schedule-extra{display:grid;gap:6px;margin-top:7px}.aipp127-schedule-extra>div{font-size:11.5px;line-height:1.42;padding:7px 9px;border-radius:9px}.aipp127-error-reason{background:#fff0f2;color:#9f2440;border:1px solid #ffd6dc}.aipp127-last-sent{background:#fff8dd;color:#70580a}.aipp127-last-sent strong{color:#9f2440}.aipp127-last-sent span{font-weight:800;color:#b42318}.aipp127-last-sent.muted{background:#f4f6f8;color:#6b7280}.aipp127-bulk-sent{display:block;font-style:normal;font-size:10.5px;font-weight:800;color:#167746;background:#eaf9f0;border-radius:8px;padding:4px 6px;margin-top:4px;width:max-content;max-width:100%}.aipp127-bulk-sent.recent{color:#9f2440;background:#fff0f2}
    @media(max-width:620px){.aipp126-message-grid{grid-template-columns:1fr}.aipp126-msg-pill{font-size:9px}.aipp126-msg-state{gap:3px}}
  `;document.head.appendChild(st);}
  setTimeout(decorateAll,150);
})();


/* ===== AIPP V6.2.0 - SMART CARE ===== */
(()=>{
  const $q=s=>document.querySelector(s);
  function lastCareAt(c){
    const times=(Array.isArray(c?.timeline)?c.timeline:[]).filter(e=>['call','zalo','sms'].includes(String(e.type||''))).map(e=>new Date(e.at||0).getTime()).filter(Number.isFinite);
    const sent=(state.schedules||[]).filter(s=>String(s.customerId)===String(c?.id)&&s.status==='sent').map(s=>new Date(s.sentAt||s.sendAt||0).getTime()).filter(Number.isFinite);
    return Math.max(0,...times,...sent);
  }
  function careAge(c){const t=lastCareAt(c);if(!t)return {days:null,text:'Chưa chăm sóc'};const d=Math.max(0,Math.floor((Date.now()-t)/86400000));return {days:d,text:d===0?'Đã chăm hôm nay':d===1?'1 ngày trước':`${d} ngày trước`};}
  function ensureQuickButtons(){
    const row=$q('#customersView .aipp-quick-row');if(!row)return;
    const before=row.querySelector('#aippFilterToggle');
    [['today','📅 Hôm nay'],['overdue','⚠ Quá hạn'],['stale',`🕘 ${window.aippStaleCustomerDays()}+ ngày`]].forEach(([q,label])=>{
      let b=row.querySelector(`[data-q="${q}"]`);if(!b){b=document.createElement('button');b.type='button';b.className='aipp-cq aipp620-q';b.dataset.q=q;if(before)row.insertBefore(b,before);else row.appendChild(b);}b.textContent=label;
    });
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('.aipp620-q');if(!b)return;
    e.preventDefault();e.stopImmediatePropagation();
    document.querySelectorAll('#customersView .aipp-cq').forEach(x=>x.classList.toggle('active',x===b));
    try{renderCustomers();}catch(_){try{renderAll();}catch(__){}}
  },true);
  function decorateCare(){
    document.querySelectorAll('#customerList [data-customer-id]').forEach(card=>{
      card.querySelector('.aipp620-care-age')?.remove();
      const c=state.customers.find(x=>String(x.id)===String(card.dataset.customerId));if(!c)return;
      const age=careAge(c),box=document.createElement('span');box.className='aipp620-care-age'+(age.days===null||age.days>=window.aippStaleCustomerDays()?' stale':'');box.textContent=`☎ ${age.text}`;
      const tags=card.querySelector('.aipp-cc-tags');if(tags)tags.appendChild(box);else card.querySelector('.aipp-cc-person')?.appendChild(box);
    });
  }
  function ensureSettings(){
    const view=$q('#settingsView .settings-stack');if(!view||$q('#aipp620SmsGuard'))return;
    const sms=$q('#settingsView .android-sms-settings');const sec=document.createElement('section');sec.className='panel';sec.id='aipp620SmsGuard';
    sec.innerHTML=`<h3>🛡 Chống gửi trùng SMS</h3><p class="muted">Chọn khoảng thời gian AIPP cảnh báo và chặn SMS trùng cho cùng một số điện thoại.</p><div class="setting-selects"><label class="field"><span>Số ngày bảo vệ</span><input id="aipp620DuplicateDays" type="number" min="1" max="180" step="1" inputmode="numeric" value="${window.aippSmsDuplicateDays()}"></label><label class="field"><span>Khách lâu chưa chăm sóc</span><input id="aipp620StaleDays" type="number" min="1" max="90" step="1" inputmode="numeric" value="${window.aippStaleCustomerDays()}"></label></div><div class="aipp620-presets"><button type="button" data-aipp620-dup="15">15 ngày</button><button type="button" data-aipp620-dup="30">30 ngày</button><button type="button" data-aipp620-dup="60">60 ngày</button><button type="button" data-aipp620-dup="90">90 ngày</button></div><p class="muted">Mặc định 30 ngày. Thay đổi áp dụng cho cả cảnh báo trong AIPP và bộ gửi SMS Android.</p>`;
    if(sms)sms.insertAdjacentElement('afterend',sec);else view.appendChild(sec);
  }
  function saveSettings(){
    const dup=Math.max(1,Math.min(180,Math.round(Number($q('#aipp620DuplicateDays')?.value)||30))),stale=Math.max(1,Math.min(90,Math.round(Number($q('#aipp620StaleDays')?.value)||7)));
    state.settings.smsDuplicateDays=dup;state.settings.staleCustomerDays=stale;
    try{if(window.AippAndroid&&typeof window.AippAndroid.setSmsDuplicateDays==='function')window.AippAndroid.setSmsDuplicateDays(dup)}catch(_){ }
    try{save({render:false})}catch(_){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}catch(__){}}
    ensureQuickButtons();ensureDashboard();try{renderCustomers();renderSchedules();}catch(_){ }
  }
  document.addEventListener('change',e=>{if(['aipp620DuplicateDays','aipp620StaleDays'].includes(e.target?.id))saveSettings()},true);
  document.addEventListener('click',e=>{const b=e.target.closest('[data-aipp620-dup]');if(!b)return;const inp=$q('#aipp620DuplicateDays');if(inp){inp.value=b.dataset.aipp620Dup;saveSettings();}},true);
  function todayKey(d){const x=new Date(d);return Number.isFinite(x.getTime())?`${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`:''}
  function smartCounts(){
    const now=Date.now(),today=todayKey(now),staleMs=window.aippStaleCustomerDays()*86400000;
    let dueToday=0,overdue=0,stale=0;
    state.customers.forEach(c=>{const f=c.followup?new Date(c.followup).getTime():0;if(f&&todayKey(f)===today)dueToday++;if(f&&f<now)overdue++;const last=lastCareAt(c);if(!last||now-last>=staleMs)stale++;});
    const smsIssue=(state.schedules||[]).filter(s=>['failed','blocked'].includes(s.status)).length;
    return {dueToday,overdue,stale,smsIssue};
  }
  function ensureDashboard(){
    const dash=$q('#dashboardView');if(!dash)return;let sec=$q('#aipp620SmartCare');if(!sec){sec=document.createElement('section');sec.className='panel aipp620-smart';sec.id='aipp620SmartCare';const stats=$q('#statsGrid');if(stats)stats.insertAdjacentElement('afterend',sec);else dash.prepend(sec);}
    const c=smartCounts();sec.innerHTML=`<div class="panel-head"><div><small class="aipp-eyebrow">SMART CARE</small><h3>🎯 Ưu tiên chăm sóc</h3></div><span class="mini-pill">${window.aippSmsDuplicateDays()} ngày chống trùng</span></div><div class="aipp620-smart-grid"><button data-aipp620-go="today"><strong>${c.dueToday}</strong><span>Hẹn hôm nay</span></button><button data-aipp620-go="overdue"><strong>${c.overdue}</strong><span>Quá hạn</span></button><button data-aipp620-go="stale"><strong>${c.stale}</strong><span>${window.aippStaleCustomerDays()}+ ngày chưa chăm</span></button><button data-aipp620-go="sms"><strong>${c.smsIssue}</strong><span>SMS lỗi/chặn</span></button></div>`;
  }
  document.addEventListener('click',e=>{const b=e.target.closest('[data-aipp620-go]');if(!b)return;const q=b.dataset.aipp620Go;if(q==='sms'){showView('automation');const f=$q('#scheduleStatusFilter');if(f){f.value='failed';renderSchedules()}return;}showView('customers');setTimeout(()=>{ensureQuickButtons();const target=$q(`#customersView .aipp-cq[data-q="${q}"]`);if(target){document.querySelectorAll('#customersView .aipp-cq').forEach(x=>x.classList.toggle('active',x===target));renderCustomers();}},20);},true);
  const baseCustomers=renderCustomers;renderCustomers=function(){baseCustomers();setTimeout(()=>{ensureQuickButtons();decorateCare()},0)};
  const baseAll=renderAll;renderAll=function(){baseAll();setTimeout(()=>{ensureSettings();ensureQuickButtons();ensureDashboard();decorateCare()},0)};
  const baseShow=showView;showView=function(name){baseShow(name);setTimeout(()=>{if(name==='settings')ensureSettings();if(name==='dashboard')ensureDashboard();if(name==='customers'){ensureQuickButtons();decorateCare()}},0)};
  if(!$q('#aipp620Style')){const st=document.createElement('style');st.id='aipp620Style';st.textContent=`
  .aipp620-care-age{display:inline-flex;align-items:center;padding:4px 7px;border-radius:999px;background:#eef7f1;color:#247047;font-size:10px;font-weight:800;white-space:nowrap}.aipp620-care-age.stale{background:#fff1e6;color:#a65313}.aipp620-presets{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}.aipp620-presets button{border:1px solid #e2e8f0;background:#fff;border-radius:10px;padding:7px 10px;font-weight:800;color:#475569}.aipp620-smart{margin-top:10px}.aipp620-smart-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.aipp620-smart-grid button{border:1px solid #e6e9ef;background:#fff;border-radius:14px;padding:11px 8px;text-align:left;color:#172033}.aipp620-smart-grid strong{display:block;font-size:22px}.aipp620-smart-grid span{display:block;margin-top:3px;font-size:11px;color:#667085;font-weight:700}.aipp620-q{flex:0 0 auto}
  @media(max-width:620px){.aipp620-smart-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.aipp620-smart-grid strong{font-size:20px}}
  `;document.head.appendChild(st)}
  try{if(window.AippAndroid&&typeof window.AippAndroid.setSmsDuplicateDays==='function')window.AippAndroid.setSmsDuplicateDays(window.aippSmsDuplicateDays())}catch(_){ }
  setTimeout(()=>{ensureSettings();ensureQuickButtons();ensureDashboard();decorateCare()},160);
})();


/* ===== AIPP V6.2.1 - PREVIOUS / NEXT CUSTOMER DETAIL NAV ===== */
(()=>{
  'use strict';
  const $=s=>document.querySelector(s);
  const unique=a=>[...new Set(a.filter(Boolean).map(String))];

  function ensureNav(){
    let nav=$('#aippCustomerDetailNav');
    if(nav)return nav;
    nav=document.createElement('div');
    nav.id='aippCustomerDetailNav';
    nav.className='aipp-customer-detail-nav';
    nav.setAttribute('aria-label','Chuyển khách hàng');
    nav.innerHTML=`
      <button type="button" id="aippPrevCustomerBtn" class="aipp-customer-nav-btn" aria-label="Khách trước" title="Khách trước">‹</button>
      <button type="button" id="aippNextCustomerBtn" class="aipp-customer-nav-btn primary" aria-label="Khách tiếp theo" title="Khách tiếp theo">›</button>`;
    document.body.appendChild(nav);
    return nav;
  }

  function customerOrder(){
    const list=$('#customerList');
    if(list){
      const ids=unique([...list.querySelectorAll('[data-customer-id],[data-dense-id]')].filter(n=>!n.classList.contains('hidden-by-setting')).map(n=>n.dataset.customerId||n.dataset.denseId));
      if(ids.length)return ids;
    }
    try{return unique((state?.customers||[]).map(c=>c.id));}catch(_){return []}
  }

  function detailIsActive(){
    const view=$('#customersView'),panel=$('#detailPanel'),top=$('#aippBackToTop');
    return !!(view?.classList.contains('active') && panel && panel.children.length && selectedCustomerId && top?.classList.contains('show'));
  }

  function updateNav(){
    const nav=ensureNav(), ids=customerOrder(), idx=ids.indexOf(String(selectedCustomerId||''));
    const show=detailIsActive() && idx>=0;
    nav.classList.toggle('show',show);
    const prev=$('#aippPrevCustomerBtn'),next=$('#aippNextCustomerBtn');
    if(prev)prev.disabled=!show||idx<=0;
    if(next)next.disabled=!show||idx<0||idx>=ids.length-1;
    if(show){
      const cur=state.customers.find(c=>String(c.id)===String(selectedCustomerId));
      const before=idx>0?state.customers.find(c=>String(c.id)===ids[idx-1]):null;
      const after=idx<ids.length-1?state.customers.find(c=>String(c.id)===ids[idx+1]):null;
      if(prev)prev.title=before?`Khách trước: ${before.name}`:'Đã ở khách đầu tiên';
      if(next)next.title=after?`Khách tiếp: ${after.name}`:'Đã ở khách cuối cùng';
      nav.dataset.currentName=cur?.name||'';
    }
  }

  function goCustomer(step){
    const ids=customerOrder();
    const idx=ids.indexOf(String(selectedCustomerId||''));
    const nextIndex=idx+step;
    if(idx<0||nextIndex<0||nextIndex>=ids.length){
      try{toast(step<0?'Đã ở khách đầu tiên':'Đã ở khách cuối cùng');}catch(_){}
      updateNav();
      return;
    }
    selectedCustomerId=ids[nextIndex];
    try{renderCustomers();}catch(_){}
    try{renderDetail();}catch(_){try{renderAll();}catch(__){}}
    requestAnimationFrame(()=>{
      const p=$('#detailPanel');
      if(p)p.scrollIntoView({behavior:'smooth',block:'start'});
      setTimeout(updateNav,80);
    });
  }

  document.addEventListener('click',e=>{
    if(e.target.closest('#aippPrevCustomerBtn')){e.preventDefault();e.stopPropagation();goCustomer(-1);return;}
    if(e.target.closest('#aippNextCustomerBtn')){e.preventDefault();e.stopPropagation();goCustomer(1);return;}
  },true);

  const prevDetail=renderDetail;
  renderDetail=function(){prevDetail();setTimeout(updateNav,0)};
  const prevAll=renderAll;
  renderAll=function(){prevAll();setTimeout(updateNav,0)};
  const prevShow=showView;
  showView=function(name){prevShow(name);setTimeout(updateNav,0)};

  window.addEventListener('scroll',updateNav,{passive:true});
  window.addEventListener('resize',updateNav,{passive:true});

  if(!$('#aipp621CustomerNavStyle')){
    const st=document.createElement('style');
    st.id='aipp621CustomerNavStyle';
    st.textContent=`
      #aippCustomerDetailNav{
        position:fixed;right:14px;top:calc(max(8px,env(safe-area-inset-top)) + 142px);z-index:9989;
        display:grid;gap:7px;opacity:0;pointer-events:none;transform:translateY(-7px);transition:.18s ease;
      }
      #aippCustomerDetailNav.show{opacity:1;pointer-events:auto;transform:translateY(0)}
      #aippCustomerDetailNav .aipp-customer-nav-btn{
        width:44px;height:44px;border-radius:50%;border:1px solid rgba(219,39,119,.22);
        background:#fff;color:#9d174d;font-size:28px;font-weight:900;line-height:1;
        display:grid;place-items:center;box-shadow:0 6px 18px rgba(15,23,42,.15);padding:0!important;
      }
      #aippCustomerDetailNav .aipp-customer-nav-btn.primary{background:#DB2777;color:#fff;border-color:#DB2777}
      #aippCustomerDetailNav .aipp-customer-nav-btn:active:not(:disabled){transform:scale(.92)}
      #aippCustomerDetailNav .aipp-customer-nav-btn:disabled{opacity:.34;filter:grayscale(.35);box-shadow:none}
      @media(max-width:920px){
        #aippCustomerDetailNav{right:10px;top:calc(max(8px,env(safe-area-inset-top)) + 164px);gap:6px}
        #aippCustomerDetailNav .aipp-customer-nav-btn{width:40px;height:40px;font-size:25px}
      }
    `;
    document.head.appendChild(st);
  }
  ensureNav();
  setTimeout(updateNav,180);
})();


/* ===== AIPP V6.2.2 - ALWAYS VISIBLE CUSTOMER PREV/NEXT UNDER BACK-TO-TOP ===== */
(()=>{
  'use strict';
  const $=s=>document.querySelector(s);
  const $$=s=>[...document.querySelectorAll(s)];
  const uniq=a=>[...new Set(a.filter(Boolean).map(String))];

  // Disable the V6.2.1 detail-only navigator. This navigator works in both list and detail views.
  function ensureNav622(){
    let nav=$('#aipp622CustomerNav');
    if(nav)return nav;
    nav=document.createElement('div');
    nav.id='aipp622CustomerNav';
    nav.setAttribute('aria-label','Khách trước và khách tiếp');
    nav.innerHTML=`
      <button type="button" id="aipp622Prev" aria-label="Khách trước" title="Khách trước">◀</button>
      <button type="button" id="aipp622Next" aria-label="Khách tiếp theo" title="Khách tiếp theo">▶</button>`;
    document.body.appendChild(nav);
    return nav;
  }

  function cardNodes(){
    const list=$('#customerList');
    if(!list)return [];
    const seen=new Set(), out=[];
    list.querySelectorAll('[data-customer-id],[data-dense-id]').forEach(n=>{
      const id=String(n.dataset.customerId||n.dataset.denseId||'');
      if(!id||seen.has(id))return;
      const st=getComputedStyle(n);
      if(st.display==='none'||st.visibility==='hidden')return;
      seen.add(id);out.push(n);
    });
    return out;
  }
  function ids(){return uniq(cardNodes().map(n=>n.dataset.customerId||n.dataset.denseId));}

  function detailVisible(){
    const p=$('#detailPanel');
    if(!p||!p.children.length)return false;
    const r=p.getBoundingClientRect();
    return r.bottom>110 && r.top<window.innerHeight-70;
  }

  function nearestListId(){
    const nodes=cardNodes();
    if(!nodes.length)return '';
    const anchor=Math.min(window.innerHeight*.48,420);
    let best=nodes[0],dist=Infinity;
    nodes.forEach(n=>{
      const r=n.getBoundingClientRect();
      const d=Math.abs((r.top+r.bottom)/2-anchor);
      if(d<dist){dist=d;best=n;}
    });
    return String(best.dataset.customerId||best.dataset.denseId||'');
  }

  function currentId(){
    const all=ids();
    const sel=String((typeof selectedCustomerId!=='undefined'&&selectedCustomerId)||'');
    if(detailVisible()&&all.includes(sel))return sel;
    return nearestListId() || (all.includes(sel)?sel:'') || all[0] || '';
  }

  function setFocus(card){
    if(!card)return;
    $$('.aipp622-focus').forEach(x=>x.classList.remove('aipp622-focus'));
    card.classList.add('aipp622-focus');
    setTimeout(()=>card.classList.remove('aipp622-focus'),1300);
  }

  function moveToId(id, fromDetail){
    if(!id)return;
    try{selectedCustomerId=id}catch(_){ }
    if(fromDetail){
      try{renderDetail()}catch(_){try{renderAll()}catch(__){}}
      requestAnimationFrame(()=>{
        const p=$('#detailPanel');
        if(p)p.scrollIntoView({behavior:'smooth',block:'start'});
        setTimeout(update,100);
      });
      return;
    }
    const card=cardNodes().find(n=>String(n.dataset.customerId||n.dataset.denseId)===String(id));
    if(card){setFocus(card);card.scrollIntoView({behavior:'smooth',block:'center'});}
    setTimeout(update,120);
  }

  function changePageAndMove(step, fromDetail){
    const selector=step>0?'[data-page-next]':'[data-page-prev]';
    const pg=$(selector);
    if(!pg||pg.disabled)return false;
    pg.click();
    setTimeout(()=>{
      const a=ids();
      if(!a.length)return update();
      moveToId(step>0?a[0]:a[a.length-1],fromDetail);
    },120);
    return true;
  }

  function go(step){
    const all=ids();
    if(!all.length)return;
    const fromDetail=detailVisible();
    const cur=currentId();
    let i=all.indexOf(cur);
    if(i<0)i=step>0?-1:all.length;
    const ni=i+step;
    if(ni<0){
      if(!changePageAndMove(-1,fromDetail)){try{toast('Đã ở khách đầu tiên')}catch(_){}}
      return;
    }
    if(ni>=all.length){
      if(!changePageAndMove(1,fromDetail)){try{toast('Đã ở khách cuối cùng')}catch(_){}}
      return;
    }
    moveToId(all[ni],fromDetail);
  }

  function update(){
    const nav=ensureNav622(), top=$('#aippBackToTop'), view=$('#customersView');
    // Always place immediately below the actual back-to-top button.
    if(top){
      const r=top.getBoundingClientRect();
      nav.style.top=`${Math.round(r.bottom+7)}px`;
      nav.style.right=`${Math.max(8,Math.round(window.innerWidth-r.right))}px`;
    }
    const active=!!(view?.classList.contains('active') && top?.classList.contains('show') && ids().length);
    nav.classList.toggle('show',active);
    if(!active)return;
    const all=ids(),cur=currentId(),i=all.indexOf(cur);
    const prev=$('#aipp622Prev'),next=$('#aipp622Next');
    const canPrevPage=!!($('[data-page-prev]')&&!$('[data-page-prev]').disabled);
    const canNextPage=!!($('[data-page-next]')&&!$('[data-page-next]').disabled);
    if(prev)prev.disabled=(i<=0&&!canPrevPage);
    if(next)next.disabled=(i>=all.length-1&&!canNextPage);
  }

  document.addEventListener('click',e=>{
    if(e.target.closest('#aipp622Prev')){e.preventDefault();e.stopPropagation();go(-1);return;}
    if(e.target.closest('#aipp622Next')){e.preventDefault();e.stopPropagation();go(1);return;}
  },true);

  window.addEventListener('scroll',update,{passive:true});
  window.addEventListener('resize',update,{passive:true});
  document.addEventListener('click',()=>setTimeout(update,80),true);
  const mo=new MutationObserver(()=>setTimeout(update,0));
  const list=$('#customerList');if(list)mo.observe(list,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});

  if(!$('#aipp622NavStyle')){
    const st=document.createElement('style');st.id='aipp622NavStyle';st.textContent=`
      #aippCustomerDetailNav{display:none!important}
      #aipp622CustomerNav{position:fixed;z-index:9989;display:grid;grid-template-columns:1fr;gap:6px;opacity:0;pointer-events:none;transform:translateY(-5px);transition:.16s ease}
      #aipp622CustomerNav.show{opacity:1;pointer-events:auto;transform:translateY(0)}
      #aipp622CustomerNav button{width:40px;height:40px;padding:0!important;border-radius:50%;border:1px solid rgba(219,39,119,.28);background:#fff;color:#9d174d;font-size:17px;font-weight:950;display:grid;place-items:center;box-shadow:0 5px 15px rgba(15,23,42,.16)}
      #aipp622CustomerNav button#aipp622Next{background:#DB2777;color:#fff;border-color:#DB2777}
      #aipp622CustomerNav button:disabled{opacity:.3;filter:grayscale(.4);box-shadow:none}
      #aipp622CustomerNav button:active:not(:disabled){transform:scale(.91)}
      #customerList .aipp622-focus{outline:2px solid #ec4899!important;outline-offset:2px;box-shadow:0 8px 20px rgba(236,72,153,.18)!important}
      @media(min-width:921px){#aipp622CustomerNav button{width:44px;height:44px;font-size:18px}}
    `;document.head.appendChild(st);
  }

  ensureNav622();
  setTimeout(update,180);
})();


/* ===== AIPP V6.2.5 - HARD KEEP CUSTOMER DETAIL TAB WHILE NAVIGATING (preserved in V6.3.0) ===== */
(()=>{
  'use strict';
  const VALID=new Set(['overview','docs','contact']);
  let activeTab='overview';

  function remember(tab){
    if(!VALID.has(tab))return;
    activeTab=tab;
    try{sessionStorage.setItem('aipp-customer-detail-tab',tab)}catch(_){ }
  }
  try{
    const saved=sessionStorage.getItem('aipp-customer-detail-tab');
    if(VALID.has(saved))activeTab=saved;
  }catch(_){ }

  function currentDomTab(){
    const b=document.querySelector('#detailPanel .v58-customer-tabs [data-v58-tab].active');
    return VALID.has(b?.dataset?.v58Tab)?b.dataset.v58Tab:null;
  }
  function applyTab(){
    const panel=document.querySelector('#detailPanel');
    if(!panel)return;
    const tabs=panel.querySelector('.v58-customer-tabs');
    const body=panel.querySelector('.v58-tab-body');
    if(!tabs||!body)return;
    let btn=tabs.querySelector(`[data-v58-tab="${activeTab}"]`);
    if(!btn){activeTab='overview';btn=tabs.querySelector('[data-v58-tab="overview"]')}
    if(!btn)return;
    tabs.querySelectorAll('[data-v58-tab]').forEach(x=>x.classList.toggle('active',x===btn));
    body.querySelectorAll('[data-v58-pane]').forEach(x=>x.classList.toggle('active',x.dataset.v58Pane===activeTab));
  }

  // Remember the tab selected by the user before the detail panel is rendered for another customer.
  document.addEventListener('click',e=>{
    const btn=e.target.closest('#detailPanel [data-v58-tab]');
    if(!btn)return;
    remember(btn.dataset.v58Tab);
  },true);

  // Wrap the final detail renderer so every customer opened through ◀ / ▶ keeps the same tab.
  const previousRenderDetail=renderDetail;
  renderDetail=function(){
    const before=currentDomTab();
    if(before)remember(before);
    previousRenderDetail();
    applyTab();
    requestAnimationFrame(()=>{applyTab();setTimeout(applyTab,0);setTimeout(applyTab,40);setTimeout(applyTab,120);});
  };

  // Also re-apply after DOM rearrangements made by older UI modules.
  const panel=document.querySelector('#detailPanel');
  if(panel){
    const observer=new MutationObserver(()=>requestAnimationFrame(applyTab));
    observer.observe(panel,{childList:true,subtree:true});
  }

  window.aippCustomerDetailTab={
    get:()=>activeTab,
    set:(tab)=>{remember(tab);applyTab();}
  };
})();
