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
  settings: {showSourceInfo:true,autoSendEnabled:false,smsFallback:true,backendBaseUrl:'',backendApiKey:''}
};

let state = migrateState(loadState());
let selectedCustomerId = state.customers[0]?.id || null;
let schedulerBusy = false;

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
  s.customers=Array.isArray(s.customers)?s.customers.map(c=>({...c,zaloStatus:c.zaloStatus||'unknown'})):[];
  s.templates=Array.isArray(s.templates)?s.templates.map(t=>({...t,zbsTemplateId:t.zbsTemplateId||'',zbsTemplateData:t.zbsTemplateData||'{"customer_name":"{ten}"}'})):structuredClone(seed.templates);
  s.schedules=Array.isArray(s.schedules)?s.schedules:[];
  const old=s.settings||{};
  s.settings={...seed.settings,...old,backendBaseUrl:old.backendBaseUrl||'',backendApiKey:old.backendApiKey||''};
  delete s.settings.zaloApiEndpoint; delete s.settings.zaloLookupEndpoint; delete s.settings.smsApiEndpoint;
  return s;
}
function save({render=true}={}){ localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); if(render)renderAll(); }
function toast(msg,ms=2600){ const el=$('#toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>el.classList.remove('show'),ms); }
function agent(){return localStorage.getItem(AGENT_KEY)||'Nhân viên'}
function normalizePhone(p){let n=String(p||'').replace(/[^\d+]/g,'');if(n.startsWith('+84'))n='0'+n.slice(3);if(n.startsWith('84')&&n.length>=11)n='0'+n.slice(2);return n.replace(/\D/g,'')}
function internationalPhone(p){const n=normalizePhone(p);return /^0\d{9}$/.test(n)?'84'+n.slice(1):n}
function statusClass(s){return s==='Tiềm năng'?'hot':''}
function isToday(v){if(!v)return false;return new Date(v).toDateString()===new Date().toDateString()}
function isOverdue(v){return !!v&&new Date(v)<new Date()}
function isDueSchedule(s){return s.status==='scheduled'&&new Date(s.sendAt)<=new Date()}
function zaloLabel(v){return v==='yes'?'Có Zalo':v==='no'?'Không có Zalo':'Chưa xác minh'}
function zaloPillClass(v){return v==='yes'?'good':v==='no'?'bad':'warn'}
function scheduleStatusLabel(v){return ({scheduled:'Đã lên lịch',manual:'Cần gửi thủ công',sent:'Đã gửi',failed:'Lỗi',cancelled:'Đã hủy'})[v]||v}
function scheduleStatusClass(v){return v==='sent'?'good':v==='failed'?'bad':v==='manual'?'warn':''}

function classifyPhone(phone){
  const p=normalizePhone(phone);if(!/^0\d{9}$/.test(p))return {valid:false,type:'Không hợp lệ',origin:'—'};
  if(/^02/.test(p))return {valid:true,type:'Cố định',origin:'Điện thoại bàn'};
  const pre=p.slice(0,3),groups={Viettel:['032','033','034','035','036','037','038','039','086','096','097','098'],VinaPhone:['081','082','083','084','085','088','091','094'],MobiFone:['070','076','077','078','079','089','090','093'],Vietnamobile:['052','056','058','092'],Gmobile:['059','099'],iTel:['087'],Wintel:['055']};
  let origin='Di động';for(const [name,prefixes] of Object.entries(groups))if(prefixes.includes(pre)){origin=name;break}return {valid:true,type:'Di động',origin};
}

function telHref(phone){
  const p=normalizePhone(phone); if(!p)return '#';
  return isAndroid?`intent://${p}#Intent;scheme=tel;action=android.intent.action.DIAL;end`:`tel:${p}`;
}
function smsHref(phone,message=''){
  const p=normalizePhone(phone); if(!p)return '#';
  if(isAndroid){const body=encodeURIComponent(message);return `intent://${p}#Intent;scheme=smsto;action=android.intent.action.SENDTO;S.sms_body=${body};end`;}
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
async function fetchJson(url,options={}){const headers={...(options.headers||{})};if(state.settings.backendApiKey)headers['x-app-key']=state.settings.backendApiKey;const r=await fetch(url,{...options,headers});let data={};try{data=await r.json()}catch{}if(!r.ok){const err=new Error(data.message||`HTTP ${r.status}`);err.status=r.status;err.data=data;throw err}return data}
async function postJson(url,payload){return fetchJson(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})}

function renderAll(){applySettingsUI();renderStats();renderTodos();renderDueMessages();renderHot();renderCustomers();renderDetail();renderFollowups();renderSchedules();renderTemplates();renderSourceFilter();renderSettings();}
function renderStats(){const c=state.customers;const stats=[['Tổng khách',c.length],['Cần xử lý',c.filter(x=>isToday(x.followup)||isOverdue(x.followup)).length],['Tiềm năng',c.filter(x=>x.status==='Tiềm năng').length],['Chưa rõ Zalo',c.filter(x=>x.zaloStatus==='unknown').length],['Tin đến lịch',state.schedules.filter(isDueSchedule).length]];$('#statsGrid').innerHTML=stats.map(([t,v])=>`<div class="stat"><span>${t}</span><strong>${v}</strong></div>`).join('')}
function renderTodos(){const a=state.customers.filter(x=>x.followup&&(isToday(x.followup)||isOverdue(x.followup))).sort((x,y)=>new Date(x.followup)-new Date(y.followup));$('#todoCount').textContent=a.length;$('#todoList').innerHTML=a.length?a.map(listItemHtml).join(''):'<div class="muted">Không có lịch cần xử lý.</div>'}
function renderDueMessages(){const a=state.schedules.filter(s=>isDueSchedule(s)||s.status==='manual').sort((x,y)=>new Date(x.sendAt)-new Date(y.sendAt));$('#dueMessageCount').textContent=a.length;$('#dueMessageList').innerHTML=a.length?a.slice(0,8).map(s=>{const c=state.customers.find(x=>x.id===s.customerId);return `<div class="list-item" data-open-schedule="${s.id}"><div class="item-main"><strong>${esc(c?.name||'Khách đã xóa')}</strong><div class="meta">${fmtDate(s.sendAt)} • ${esc(s.channel==='auto'?'Tự chọn':s.channel.toUpperCase())}</div></div><span class="mini-pill ${scheduleStatusClass(s.status)}">${esc(scheduleStatusLabel(s.status))}</span></div>`}).join(''):'<div class="muted">Chưa có tin đến lịch.</div>'}
function renderHot(){const a=state.customers.filter(x=>x.status==='Tiềm năng');$('#hotList').innerHTML=a.length?a.map(listItemHtml).join(''):'<div class="muted">Chưa có khách tiềm năng.</div>'}
function listItemHtml(x){const src=state.settings.showSourceInfo&&x.source?` • ${esc(x.source)}`:'';return `<div class="list-item" data-open-customer="${x.id}"><div class="item-main"><strong>${esc(x.name)}</strong><div class="meta">${esc(x.phone)}${src}${x.followup?' • '+fmtDate(x.followup):''}</div></div><span class="status-pill ${statusClass(x.status)}">${esc(x.status)}</span></div>`}
function renderCustomers(){const q=($('#globalSearch').value||'').trim().toLowerCase(),sf=$('#statusFilter').value,src=$('#sourceFilter').value;const list=state.customers.filter(x=>(!q||x.name.toLowerCase().includes(q)||normalizePhone(x.phone).includes(normalizePhone(q)))&&(!sf||x.status===sf)&&(!state.settings.showSourceInfo||!src||x.source===src));$('#customerList').innerHTML=list.length?list.map(x=>{const source=state.settings.showSourceInfo?` • ${esc(x.source||'Không rõ nguồn')}`:'';return `<div class="customer-row ${x.id===selectedCustomerId?'active':''}" data-customer-id="${x.id}"><div><strong>${esc(x.name)}</strong><div class="meta">${esc(x.phone)}${source}</div><div class="phone-class"><span class="mini-pill ${zaloPillClass(x.zaloStatus)}">${zaloLabel(x.zaloStatus)}</span></div></div><span class="status-pill ${statusClass(x.status)}">${esc(x.status)}</span></div>`}).join(''):'<div class="muted" style="padding:18px">Không tìm thấy khách hàng.</div>'}
function firstTemplateMessage(c){const t=state.templates[0];return t?compileTemplate(t.text,c):''}
function renderDetail(){
  const x=state.customers.find(c=>c.id===selectedCustomerId);if(!x){$('#detailPanel').innerHTML='<div class="detail-empty">Chọn một khách hàng để xem chi tiết.</div>';return}
  const pc=classifyPhone(x.phone),msg=firstTemplateMessage(x),sourceCard=state.settings.showSourceInfo?`<div class="detail-card"><span>Nguồn</span><strong>${esc(x.source||'—')}</strong></div>`:'';
  const statuses=['Không nghe','Máy bận','Đang tư vấn','Đã gửi Zalo','Đã gửi SMS','Hẹn gọi lại','Tiềm năng','Không nhu cầu','Hoàn tất'];
  $('#detailPanel').innerHTML=`
    <div class="customer-summary"><div><h3>${esc(x.name)}</h3><div class="phone">${esc(x.phone)}</div><div class="phone-class"><span class="mini-pill ${pc.valid?'good':'bad'}">${esc(pc.type)}</span><span class="mini-pill">${esc(pc.origin)}</span><span class="mini-pill ${zaloPillClass(x.zaloStatus)}">${zaloLabel(x.zaloStatus)}</span></div></div><button class="secondary small" data-edit="${x.id}">✏️ Sửa</button></div>
    <div class="contact-actions">
      <a class="action-btn action-call" href="${esc(telHref(x.phone))}"><span>📞</span><span>Gọi</span></a>
      <a class="action-btn action-zalo" href="${esc(zaloHref(x.phone))}"><span>💬</span><span>Zalo</span></a>
      <a class="action-btn action-sms" href="${esc(smsHref(x.phone,msg))}"><span>✉️</span><span>SMS</span></a>
    </div>
    <div class="secondary-actions"><button class="secondary" data-copy-template="${x.id}">📋 Tạo/copy tin</button><button class="secondary" data-check-zalo="${x.id}">🔎 Tra trạng thái Zalo</button><button class="secondary" data-schedule-customer="${x.id}">🗓 Lên lịch nhắn</button></div>
    <div class="quick-status-wrap"><div class="section-label">Cập nhật nhanh trạng thái</div><div class="quick-status">${statuses.map(s=>`<button class="${x.status===s?'active':''}" data-status="${esc(s)}" data-id="${x.id}">${esc(s)}</button>`).join('')}</div></div>
    <div class="info-grid"><div class="detail-card"><span>Trạng thái</span><strong>${esc(x.status)}</strong></div>${sourceCard}<div class="detail-card"><span>Nhu cầu</span><strong>${esc(x.product||'—')}</strong></div><div class="detail-card"><span>Gọi lại</span><strong>${fmtDate(x.followup)}</strong></div><div class="detail-card"><span>Zalo</span><div class="row-inline"><strong>${zaloLabel(x.zaloStatus)}</strong><button class="secondary small" data-zalo-state="yes" data-id="${x.id}">Có</button><button class="secondary small" data-zalo-state="no" data-id="${x.id}">Không</button><button class="secondary small" data-zalo-state="unknown" data-id="${x.id}">?</button></div></div></div>
    <div class="note-box">${esc(x.note||'Chưa có ghi chú.')}</div><div class="customer-foot-actions"><button class="secondary" data-schedule-customer="${x.id}">🗓 Nhắc/gửi sau</button><button class="danger" data-delete="${x.id}">🗑 Xóa khách</button></div>`;
}
function renderFollowups(){const a=state.customers.filter(x=>x.followup).sort((x,y)=>new Date(x.followup)-new Date(y.followup));$('#followupList').innerHTML=a.length?a.map(listItemHtml).join(''):'<div class="muted">Chưa có lịch gọi lại.</div>'}
function renderTemplates(){$('#templateList').innerHTML=state.templates.length?state.templates.map(t=>`<div class="template-row"><div><strong>${esc(t.name)}</strong><p>${esc(t.text)}</p><div class="meta">ZBS Template ID: ${esc(t.zbsTemplateId||'chưa cấu hình')}</div></div><div class="template-actions"><button class="secondary small" data-edit-template="${t.id}">Sửa</button><button class="secondary small" data-delete-template="${t.id}">Xóa</button></div></div>`).join(''):'<div class="muted">Chưa có mẫu tin.</div>'}
function renderSourceFilter(){const el=$('#sourceFilter'),prev=el.value,sources=[...new Set(state.customers.map(x=>x.source).filter(Boolean))].sort();el.innerHTML='<option value="">Tất cả nguồn</option>'+sources.map(s=>`<option>${esc(s)}</option>`).join('');el.value=prev}
function renderSchedules(){const f=$('#scheduleStatusFilter')?.value||'',a=[...state.schedules].filter(s=>!f||s.status===f).sort((x,y)=>new Date(x.sendAt)-new Date(y.sendAt));$('#scheduleList').innerHTML=a.length?a.map(s=>{const c=state.customers.find(x=>x.id===s.customerId),t=state.templates.find(x=>x.id===s.templateId),msg=c&&t?compileTemplate(t.text,c):'';return `<div class="schedule-row"><div class="schedule-main"><strong>${esc(c?.name||'Khách đã xóa')} • ${esc(c?.phone||'')}</strong><p class="meta">${fmtDate(s.sendAt)} • ${esc(s.channel==='auto'?'Tự chọn Zalo → SMS':s.channel.toUpperCase())} • ${esc(t?.name||'Đã xóa')}</p><p class="meta">${esc(msg.slice(0,120))}${msg.length>120?'…':''}</p>${s.serverId?'<p class="schedule-sync">☁ Đã đồng bộ server</p>':''}${s.lastError?`<p class="error-text">${esc(s.lastError)}</p>`:''}</div><div class="schedule-side"><span class="mini-pill ${scheduleStatusClass(s.status)}">${esc(scheduleStatusLabel(s.status))}</span><div class="schedule-actions">${s.status==='manual'?`<button class="secondary small" data-send-manual="${s.id}">Mở để gửi</button>`:''}${['scheduled','manual','failed'].includes(s.status)?`<button class="secondary small" data-run-schedule="${s.id}">Gửi thử</button><button class="danger small" data-cancel-schedule="${s.id}">Hủy</button>`:''}</div></div></div>`}).join(''):'<div class="muted">Chưa có lịch gửi tin.</div>'}
function renderSettings(){$('#showSourceInfoToggle').checked=!!state.settings.showSourceInfo;$('#autoSendToggle').checked=!!state.settings.autoSendEnabled;$('#smsFallbackToggle').checked=!!state.settings.smsFallback;$('#backendBaseUrl').value=state.settings.backendBaseUrl||'';$('#backendApiKey').value=state.settings.backendApiKey||''}
function applySettingsUI(){$$('.source-field').forEach(el=>el.classList.toggle('hidden-by-setting',!state.settings.showSourceInfo));$('#sourceFilter')?.classList.toggle('hidden-by-setting',!state.settings.showSourceInfo)}

function openCustomerDialog(id=null){const x=state.customers.find(c=>c.id===id);$('#dialogTitle').textContent=x?'Sửa khách hàng':'Thêm khách hàng';$('#customerId').value=x?.id||'';$('#nameInput').value=x?.name||'';$('#phoneInput').value=x?.phone||'';$('#sourceInput').value=x?.source||'';$('#productInput').value=x?.product||'';$('#statusInput').value=x?.status||'Chưa gọi';$('#followupInput').value=x?.followup||'';$('#zaloStatusInput').value=x?.zaloStatus||'unknown';$('#noteInput').value=x?.note||'';$('#customerDialog').showModal()}
function saveCustomer(){const name=$('#nameInput').value.trim(),phone=$('#phoneInput').value.trim();if(!name){toast('Vui lòng nhập họ tên');$('#nameInput').focus();return false}if(!phone){toast('Vui lòng nhập số điện thoại');$('#phoneInput').focus();return false}if(!classifyPhone(phone).valid){toast('Số điện thoại chưa đúng định dạng Việt Nam');$('#phoneInput').focus();return false}const old=state.customers.find(x=>x.id===$('#customerId').value);const obj={id:$('#customerId').value||crypto.randomUUID(),name,phone:normalizePhone(phone),source:state.settings.showSourceInfo?$('#sourceInput').value.trim():(old?.source||''),product:$('#productInput').value.trim(),status:$('#statusInput').value,followup:$('#followupInput').value,zaloStatus:$('#zaloStatusInput').value,note:$('#noteInput').value.trim(),updatedAt:new Date().toISOString()};const i=state.customers.findIndex(x=>x.id===obj.id);if(i>=0)state.customers[i]=obj;else state.customers.unshift(obj);selectedCustomerId=obj.id;save();toast('Đã lưu khách hàng');return true}
function openTemplateDialog(id=null){const t=state.templates.find(x=>x.id===id);$('#templateId').value=t?.id||'';$('#templateNameInput').value=t?.name||'';$('#templateTextInput').value=t?.text||'';$('#zbsTemplateIdInput').value=t?.zbsTemplateId||'';$('#zbsTemplateDataInput').value=t?.zbsTemplateData||'{"customer_name":"{ten}"}';$('#templateDialog').showModal()}
function saveTemplate(){const name=$('#templateNameInput').value.trim(),txt=$('#templateTextInput').value.trim(),zbsData=$('#zbsTemplateDataInput').value.trim();if(!name){toast('Nhập tên mẫu tin');return false}if(!txt){toast('Nhập nội dung mẫu tin');return false}if(zbsData){try{JSON.parse(zbsData)}catch{toast('ZBS template_data phải là JSON hợp lệ');return false}}const obj={id:$('#templateId').value||crypto.randomUUID(),name,text:txt,zbsTemplateId:$('#zbsTemplateIdInput').value.trim(),zbsTemplateData:zbsData||'{}'};const i=state.templates.findIndex(x=>x.id===obj.id);if(i>=0)state.templates[i]=obj;else state.templates.unshift(obj);save();toast('Đã lưu mẫu tin');return true}
function compileTemplate(t,c){return String(t||'').replaceAll('{ten}',c.name||'').replaceAll('{sdt}',c.phone||'').replaceAll('{san_pham}',c.product||'dịch vụ').replaceAll('{nhan_vien}',agent())}
function compileZbsData(t,c){const raw=compileTemplate(t.zbsTemplateData||'{}',c);return JSON.parse(raw)}
async function createMessage(id){const c=state.customers.find(x=>x.id===id);if(!c||!state.templates.length)return;const options=state.templates.map((t,i)=>`${i+1}. ${t.name}`).join('\n'),raw=prompt(`Chọn mẫu tin:\n${options}`,'1');if(raw===null)return;const idx=Math.max(0,Math.min(state.templates.length-1,(parseInt(raw)||1)-1)),msg=compileTemplate(state.templates[idx].text,c);try{await navigator.clipboard.writeText(msg);toast('Đã copy tin nhắn')}catch{prompt('Copy nội dung sau:',msg)}}
function nextCustomer(){const pending=state.customers.filter(x=>!['Hoàn tất','Không nhu cầu'].includes(x.status)).sort((a,b)=>{const af=a.followup?new Date(a.followup):new Date(8640000000000000),bf=b.followup?new Date(b.followup):new Date(8640000000000000);return af-bf});if(!pending.length)return toast('Không còn khách cần xử lý');const i=pending.findIndex(x=>x.id===selectedCustomerId);selectedCustomerId=pending[(i+1+pending.length)%pending.length].id;showView('customers');renderAll()}
function showView(name){$$('.view').forEach(x=>x.classList.remove('active'));$(`#${name}View`).classList.add('active');$$('.nav-btn').forEach(x=>x.classList.toggle('active',x.dataset.view===name));const t={dashboard:'Tổng quan hôm nay',customers:'Khách hàng',followups:'Lịch gọi lại',automation:'Tự động gửi tin',templates:'Mẫu tin nhắn',settings:'Cài đặt'};$('#pageTitle').textContent=t[name]}

function openScheduleDialog(customerId=null,scheduleId=null){const s=state.schedules.find(x=>x.id===scheduleId);if(!state.customers.length||!state.templates.length){toast('Cần có ít nhất 1 khách và 1 mẫu tin');return}$('#scheduleId').value=s?.id||'';$('#scheduleCustomerInput').innerHTML=state.customers.map(c=>`<option value="${c.id}">${esc(c.name)} — ${esc(c.phone)}</option>`).join('');$('#scheduleTemplateInput').innerHTML=state.templates.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('');$('#scheduleCustomerInput').value=s?.customerId||customerId||state.customers[0].id;$('#scheduleChannelInput').value=s?.channel||'auto';$('#scheduleTimeInput').value=s?.sendAt||nextLocalDate(0,new Date().getHours()+1,0);$('#scheduleTemplateInput').value=s?.templateId||state.templates[0].id;updateSchedulePreview();$('#scheduleDialog').showModal()}
function updateSchedulePreview(){const c=state.customers.find(x=>x.id===$('#scheduleCustomerInput').value),t=state.templates.find(x=>x.id===$('#scheduleTemplateInput').value);$('#schedulePreview').value=c&&t?compileTemplate(t.text,c):''}
async function saveSchedule(){const customerId=$('#scheduleCustomerInput').value,templateId=$('#scheduleTemplateInput').value,sendAt=$('#scheduleTimeInput').value;if(!customerId||!templateId||!sendAt){toast('Chọn đủ khách, mẫu tin và thời gian');return false}const id=$('#scheduleId').value||crypto.randomUUID(),old=state.schedules.find(x=>x.id===id),obj={id,customerId,templateId,channel:$('#scheduleChannelInput').value,sendAt,status:old?.status==='sent'?'sent':'scheduled',createdAt:old?.createdAt||new Date().toISOString(),lastError:'',serverId:old?.serverId||''};const i=state.schedules.findIndex(x=>x.id===id);if(i>=0)state.schedules[i]=obj;else state.schedules.push(obj);save();if(state.settings.autoSendEnabled&&apiBase())await pushScheduleToBackend(obj);toast(obj.serverId?'Đã lưu và đồng bộ lịch lên server':'Đã lưu lịch gửi');return true}

async function testBackend(){const base=apiBase();if(!base){setApiStatus(null);toast('Chưa có địa chỉ Backend V3');return null}try{const data=await fetchJson(apiUrl('/api/health'));setApiStatus(data);toast('Backend đã phản hồi');return data}catch(err){setApiStatus(false);toast(`Không kết nối được backend: ${err.message}`,4200);return null}}
function setApiStatus(data){const overall=$('#apiOverallBadge');const set=(id,val)=>{$(id).textContent=val===true?'Sẵn sàng':val===false?'Chưa cấu hình':'—';$(id).style.color=val===true?'#166534':val===false?'#991b1b':''};if(!data){overall.textContent='Chưa kết nối';overall.className='mini-pill warn';set('#zaloApiStatus',null);set('#lookupApiStatus',null);set('#smsApiStatus',null);return}if(data===false){overall.textContent='Lỗi kết nối';overall.className='mini-pill bad';set('#zaloApiStatus',false);set('#lookupApiStatus',false);set('#smsApiStatus',false);return}overall.textContent='Backend online';overall.className='mini-pill good';set('#zaloApiStatus',!!data.zaloConfigured);set('#lookupApiStatus',!!data.lookupConfigured);set('#smsApiStatus',!!data.smsConfigured)}
async function checkZaloAvailability(customer,{silent=false}={}){if(!customer)return null;if(!apiBase()){if(!silent)toast('Chưa kết nối backend. Bạn có thể đánh dấu Có/Không thủ công.');return null}try{if(!silent)toast('Đang tra trạng thái Zalo...');const data=await postJson(apiUrl('/api/zalo/check'),{phone:internationalPhone(customer.phone),customerId:customer.id});if(data.supported===false){if(!silent)toast(data.message||'Backend chưa có dịch vụ tra Zalo');return null}if(typeof data.hasZalo!=='boolean')throw new Error('API không trả về hasZalo true/false');customer.zaloStatus=data.hasZalo?'yes':'no';customer.updatedAt=new Date().toISOString();save();if(!silent)toast(data.hasZalo?'Đã xác định số có Zalo':'Đã xác định số không có Zalo');return data.hasZalo}catch(err){if(err.status===501){if(!silent)toast(err.data?.message||'Chưa cấu hình dịch vụ tra Zalo');return null}if(!silent)toast(`Không tra được Zalo: ${err.message}`);return null}}
async function sendViaZalo(customer,message,template){if(!apiBase())return {ok:false,manual:true,error:'Chưa kết nối Backend V3'};if(!template?.zbsTemplateId)return {ok:false,manual:true,error:'Mẫu chưa có ZBS Template ID'};try{const data=await postJson(apiUrl('/api/zalo/send'),{phone:internationalPhone(customer.phone),templateId:template.zbsTemplateId,templateData:compileZbsData(template,customer),trackingId:`${customer.id}-${Date.now()}`});return {ok:data.ok!==false,error:data.message||''}}catch(err){if(err.data?.noZalo){customer.zaloStatus='no';save();return {ok:false,noZalo:true,error:err.data?.message||'Không có Zalo'}}return {ok:false,error:err.data?.message||err.message}}}
async function sendViaSms(customer,message){if(!apiBase())return {ok:false,manual:true,error:'Chưa kết nối Backend V3'};try{const data=await postJson(apiUrl('/api/sms/send'),{phone:internationalPhone(customer.phone),message,customerId:customer.id,name:customer.name});return {ok:data.ok!==false,error:data.message||''}}catch(err){if(err.status===501)return {ok:false,manual:true,error:err.data?.message||'SMS backend chưa cấu hình'};return {ok:false,error:err.data?.message||err.message}}}
async function executeSchedule(schedule,{force=false}={}){if(!schedule||schedule.status==='sent'||schedule.status==='cancelled')return;if(schedule.serverId&&!force){return}const c=state.customers.find(x=>x.id===schedule.customerId),t=state.templates.find(x=>x.id===schedule.templateId);if(!c||!t){schedule.status='failed';schedule.lastError='Không tìm thấy khách hoặc mẫu tin';save();return}const msg=compileTemplate(t.text,c);let channel=schedule.channel;if(channel==='auto'){if(c.zaloStatus==='unknown')await checkZaloAvailability(c,{silent:true});channel=c.zaloStatus==='no'?'sms':'zalo'}let result;if(channel==='zalo'){result=await sendViaZalo(c,msg,t);if(!result.ok&&result.noZalo&&state.settings.smsFallback){channel='sms';result=await sendViaSms(c,msg)}}else result=await sendViaSms(c,msg);if(result.ok){schedule.status='sent';schedule.sentAt=new Date().toISOString();schedule.sentChannel=channel;schedule.lastError='';c.status=channel==='sms'?'Đã gửi SMS':'Đã gửi Zalo';c.updatedAt=new Date().toISOString();toast(`Đã gửi ${channel.toUpperCase()} cho ${c.name}`)}else if(result.manual){schedule.status='manual';schedule.lastError=result.error||'Cần gửi thủ công';if(force)openManualSchedule(schedule)}else{schedule.status='failed';schedule.lastError=result.error||'Gửi thất bại';toast(`Gửi thất bại: ${schedule.lastError}`,4200)}save()}
function openManualSchedule(schedule){const c=state.customers.find(x=>x.id===schedule.customerId),t=state.templates.find(x=>x.id===schedule.templateId);if(!c||!t)return;const msg=compileTemplate(t.text,c),channel=schedule.channel==='auto'?(c.zaloStatus==='no'?'sms':'zalo'):schedule.channel;if(channel==='sms'){location.href=smsHref(c.phone,msg)}else{navigator.clipboard?.writeText(msg).catch(()=>{});location.href=zaloHref(c.phone);toast('Đã copy nội dung và mở Zalo')}}
async function processDueSchedules(){if(schedulerBusy||!state.settings.autoSendEnabled)return;const due=state.schedules.filter(s=>isDueSchedule(s)&&!s.serverId);if(!due.length)return;schedulerBusy=true;try{for(const s of due)await executeSchedule(s)}finally{schedulerBusy=false}}

function schedulePayload(schedule){const c=state.customers.find(x=>x.id===schedule.customerId),t=state.templates.find(x=>x.id===schedule.templateId);if(!c||!t)throw new Error('Không tìm thấy khách hoặc mẫu tin');return {clientId:schedule.id,customerId:c.id,name:c.name,phone:internationalPhone(c.phone),zaloStatus:c.zaloStatus,channel:schedule.channel,sendAt:new Date(schedule.sendAt).toISOString(),message:compileTemplate(t.text,c),zbsTemplateId:t.zbsTemplateId||'',zbsTemplateData:t.zbsTemplateId?compileZbsData(t,c):{},smsFallback:!!state.settings.smsFallback}}
async function pushScheduleToBackend(schedule){try{const data=await postJson(apiUrl('/api/schedules'),schedulePayload(schedule));schedule.serverId=data.id||data.schedule?.id||schedule.serverId;schedule.lastError='';save();return true}catch(err){schedule.lastError=`Chưa đồng bộ server: ${err.data?.message||err.message}`;save();return false}}
async function syncSchedulesFromBackend({quiet=false}={}){if(!apiBase()){if(!quiet)toast('Chưa kết nối backend');return}try{const data=await fetchJson(apiUrl('/api/schedules'));const list=Array.isArray(data.schedules)?data.schedules:[];for(const local of state.schedules){if(!local.serverId)continue;const remote=list.find(r=>r.id===local.serverId);if(!remote)continue;local.status=remote.status||local.status;local.lastError=remote.lastError||'';local.sentAt=remote.sentAt||local.sentAt;local.sentChannel=remote.sentChannel||local.sentChannel}save();if(!quiet)toast('Đã đồng bộ trạng thái lịch')}catch(err){if(!quiet)toast(`Không đồng bộ được: ${err.message}`)}}
async function cancelSchedule(schedule){schedule.status='cancelled';if(schedule.serverId&&apiBase()){try{await fetchJson(apiUrl(`/api/schedules/${encodeURIComponent(schedule.serverId)}`),{method:'DELETE'})}catch{}}save();toast('Đã hủy lịch')}

function saveSettings(){state.settings.showSourceInfo=$('#showSourceInfoToggle').checked;state.settings.autoSendEnabled=$('#autoSendToggle').checked;state.settings.smsFallback=$('#smsFallbackToggle').checked;state.settings.backendBaseUrl=$('#backendBaseUrl').value.trim().replace(/\/$/,'');state.settings.backendApiKey=$('#backendApiKey').value.trim();save();toast('Đã lưu cài đặt');if(state.settings.autoSendEnabled&&apiBase()){for(const s of state.schedules.filter(x=>x.status==='scheduled'&&!x.serverId))pushScheduleToBackend(s)}processDueSchedules()}

$('#todayText').textContent=new Date().toLocaleDateString('vi-VN',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});
$('#agentName').value=agent()==='Nhân viên'?'':agent();$('#agentName').addEventListener('change',e=>{localStorage.setItem(AGENT_KEY,e.target.value.trim()||'Nhân viên');toast('Đã lưu tên nhân viên')});
$$('.nav-btn').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));$('#addCustomerBtn').addEventListener('click',()=>openCustomerDialog());
$('#customerForm').addEventListener('submit',e=>{e.preventDefault();if(saveCustomer())$('#customerDialog').close()});$('#templateForm').addEventListener('submit',e=>{e.preventDefault();if(saveTemplate())$('#templateDialog').close()});$('#scheduleForm').addEventListener('submit',async e=>{e.preventDefault();if(await saveSchedule())$('#scheduleDialog').close()});
$('#addTemplateBtn').addEventListener('click',()=>openTemplateDialog());$('#addScheduleBtn').addEventListener('click',()=>openScheduleDialog());$('#globalSearch').addEventListener('input',()=>{showView('customers');renderCustomers()});$('#statusFilter').addEventListener('change',renderCustomers);$('#sourceFilter').addEventListener('change',renderCustomers);$('#nextCustomerBtn').addEventListener('click',nextCustomer);$('#scheduleStatusFilter').addEventListener('change',renderSchedules);$('#scheduleCustomerInput').addEventListener('change',updateSchedulePreview);$('#scheduleTemplateInput').addEventListener('change',updateSchedulePreview);$('#saveSettingsBtn').addEventListener('click',saveSettings);$('#testApiBtn').addEventListener('click',testBackend);$('#syncSchedulesBtn').addEventListener('click',()=>syncSchedulesFromBackend());
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

$('#exportBtn').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`telesale-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)});
// Import khách được xử lý duy nhất bởi AIPP Excel V4 ở phần dưới. Backup JSON dùng mục Khôi phục riêng.

const previewLikely=location.protocol==='file:'||/Acode|; wv\)/i.test(navigator.userAgent);if(previewLikely)$('#browserNotice').classList.remove('hidden');$('#dismissBrowserNotice').addEventListener('click',()=>$('#browserNotice').classList.add('hidden'));
if('serviceWorker'in navigator&&/^https?:$/.test(location.protocol))navigator.serviceWorker.register('./sw.js').catch(()=>{});
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
    colorMode:'system',themeStyle:'soft-pink',density:'comfortable',showCall:true,showZalo:true,showSms:true,
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
    $('#colorModeSelect').value=st.colorMode||'system'; $('#themeStyleSelect').value=st.themeStyle||'soft-pink'; $('#densitySelect').value=st.density||'comfortable';
    $('#featureToggleList').innerHTML=featureDefs.map(([k,label])=>`<label class="setting-check"><span>${esc(label)}</span><input type="checkbox" data-feature="${k}" ${st[k]?'checked':''}></label>`).join('');
    $('#profileFieldList').innerHTML=profileDefs.map(([k,label])=>`<label class="setting-check"><span>${esc(label)}</span><input type="checkbox" data-profile-field="${k}" ${st.profileFields[k]?'checked':''}></label>`).join('');
    $('#customFieldList').innerHTML=st.customFields.length?st.customFields.map(f=>`<div class="setting-check"><label><input type="checkbox" data-custom-toggle="${f.id}" ${f.enabled?'checked':''}> <span>✚ ${esc(f.name)}</span></label><button type="button" class="icon-danger" data-custom-delete="${f.id}">×</button></div>`).join(''):'<div class="muted setting-empty">Chưa có trường tùy chỉnh.</div>';
    $('#documentTypeList').innerHTML=st.documentTypes.map(d=>`<div class="setting-check"><label><input type="checkbox" data-doc-toggle="${d.id}" ${d.enabled?'checked':''}> <span>${esc(d.name)}</span></label><button type="button" class="icon-danger" data-doc-delete="${d.id}">×</button></div>`).join('');
  };

  const originalApplySettingsUI=applySettingsUI;
  applySettingsUI=function(){
    originalApplySettingsUI(); const st=state.settings;
    document.body.dataset.theme=st.themeStyle||'soft-pink'; document.body.dataset.density=st.density||'comfortable'; document.documentElement.dataset.colorMode=st.colorMode||'system';
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
    state.settings.colorMode=$('#colorModeSelect').value;state.settings.themeStyle=$('#themeStyleSelect').value;state.settings.density=$('#densitySelect').value;
    $$('[data-feature]').forEach(i=>state.settings[i.dataset.feature]=i.checked); state.settings.showSourceInfo=!!state.settings.showSourceInfo;
    $$('[data-profile-field]').forEach(i=>state.settings.profileFields[i.dataset.profileField]=i.checked); save(); toast('Đã lưu tùy chỉnh');
  }
  $('#settingsView').addEventListener('change',e=>{
    const t=e.target;
    if(t.matches('#colorModeSelect,#themeStyleSelect,#densitySelect,[data-feature],[data-profile-field]')){persistUiSettings();return;}
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
    if(note){
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
    $('#ppImportBtn').onclick=()=>$('#importInput')?.click();
    $('#ppPasteBtn').onclick=async()=>{
      let raw='';
      try{raw=await navigator.clipboard.readText();}catch{raw=prompt('Dán danh sách: mỗi dòng dạng Tên, SĐT')||'';}
      if(!raw.trim())return toast('Chưa có dữ liệu để dán');
      const rows=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);let added=0;
      for(const line of rows){
        const parts=line.split(/[\t,;|]/).map(x=>x.trim()).filter(Boolean);
        const phonePart=parts.find(p=>/^\+?\d[\d\s.-]{7,}$/.test(p));
        const phone=normalizePhone(phonePart||''); if(!classifyPhone(phone).valid)continue;
        const name=(parts.find(p=>p!==phonePart)||'Khách mới').trim();
        if(state.customers.some(c=>normalizePhone(c.phone)===phone))continue;
        state.customers.unshift({id:crypto.randomUUID(),name,phone,source:'',product:'',status:'Chưa gọi',followup:'',note:'',zaloStatus:'unknown',profile:{},customFields:{},documents:{},updatedAt:new Date().toISOString()});added++;
      }
      if(added){selectedCustomerId=state.customers[0]?.id||null;save();toast(`Đã thêm ${added} khách từ dữ liệu dán`);}else toast('Không tìm thấy dòng Tên, SĐT hợp lệ');
    };
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
  function timelineHtml(c){const a=(c.timeline||[]).slice(0,40);return `<section class="pp-timeline"><div class="pp-section-title">🕘 Nhật ký chăm sóc <span>${a.length}</span></div>${a.length?`<div class="pp-timeline-list">${a.map(e=>`<div class="pp-time-row"><div class="pp-time-dot">${e.type==='call'?'📞':e.type==='zalo'?'💬':e.type==='sms'?'✉️':e.type==='followup'?'⏰':'📝'}</div><div><strong>${esc(e.title)}</strong><small>${fmtDate(e.at)}</small>${e.detail?`<p>${esc(e.detail)}</p>`:''}</div></div>`).join('')}</div>`:'<div class="muted pp-empty-small">Chưa có hoạt động chăm sóc.</div>'}<div class="pp-log-note"><input id="ppQuickNote" placeholder="Ghi chú nhanh cho khách này..."><button class="secondary" data-add-log-note="${c.id}">+ Ghi chú</button></div></section>`}
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
  // Excel / CSV Import V2 preview. JSON backup restore remains separate.
  function parseCSV(text){const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());if(!lines.length)return [];const sep=(lines[0].match(/;/g)||[]).length>(lines[0].match(/,/g)||[]).length?';':',';return lines.map(line=>{let out=[],cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++}else q=!q}else if(ch===sep&&!q){out.push(cur.trim());cur=''}else cur+=ch}out.push(cur.trim());return out})}
  function normHeader(v){return String(v??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]+/g,' ').trim()}
  function findCol(headers,names){const hs=headers.map(normHeader),ns=names.map(normHeader);let i=hs.findIndex(h=>ns.includes(h));if(i>=0)return i;return hs.findIndex(h=>ns.some(n=>h.includes(n)||n.includes(h)))}
  function importPhone(v){
    let p=normalizePhone(v);
    // Excel thường làm mất số 0 đầu nếu cột SĐT được lưu dạng Number.
    if(/^\d{9}$/.test(p))p='0'+p;
    return p;
  }
  function rowsToImport(rows,fileName=''){
    if(!rows||rows.length<2){toast('File không có dữ liệu');return}
    // Tự tìm dòng tiêu đề trong 30 dòng đầu, ưu tiên dòng có cột số điện thoại.
    let headerIndex=-1;
    for(let i=0;i<Math.min(rows.length,30);i++){
      const rr=Array.isArray(rows[i])?rows[i]:[];
      if(findCol(rr,['sđt','sdt','số điện thoại','điện thoại','phone','phone number','mobile'])>=0){headerIndex=i;break}
    }
    if(headerIndex<0){importLoading(false);toast('Không tìm thấy cột Số điện thoại trong 30 dòng đầu',5500);return}
    const h=rows[headerIndex];
    const ni=findCol(h,['họ tên','họ và tên','tên khách hàng','khách hàng','tên','name','customer name']);
    const pi=findCol(h,['sđt','sdt','số điện thoại','điện thoại','phone','phone number','mobile']);
    const si=findCol(h,['nguồn','nguồn khách','source']);
    const pri=findCol(h,['sản phẩm','nhu cầu','sản phẩm nhu cầu','product','need']);
    const sti=findCol(h,['trạng thái','status']);
    const fi=findCol(h,['ngày hẹn','hẹn gọi lại','gọi lại','followup','follow up']);
    const noi=findCol(h,['ghi chú','note','notes']);
    if(pi<0)return toast('Không nhận diện được cột Số điện thoại');
    const items=rows.slice(headerIndex+1).map((r,n)=>({row:headerIndex+n+2,name:ni>=0?String(r[ni]??'').trim():'Khách hàng',phone:importPhone(r[pi]??''),source:si>=0?String(r[si]??'').trim():'',product:pri>=0?String(r[pri]??'').trim():'',status:sti>=0?String(r[sti]??'').trim()||'Chưa gọi':'Chưa gọi',followup:fi>=0?String(r[fi]??'').trim():'',note:noi>=0?String(r[noi]??'').trim():''})).filter(x=>x.name||x.phone);
    let valid=0,dup=0,bad=0;const seen=new Set(state.customers.map(c=>normalizePhone(c.phone)));
    items.forEach(x=>{if(!classifyPhone(x.phone).valid)bad++;else if(seen.has(x.phone))dup++;else{valid++;seen.add(x.phone)}});
    let dlg=$('#ppImportDialog');if(!dlg){dlg=document.createElement('dialog');dlg.id='ppImportDialog';document.body.appendChild(dlg)}
    const colName=i=>i>=0?`${i+1} (${esc(h[i])})`:'không có';
    dlg.innerHTML=`<div class="dialog-form"><div class="dialog-head"><h3>📥 Xem trước nhập Excel/CSV</h3><button class="icon-btn" onclick="this.closest('dialog').close()">✕</button></div><div class="pp-import-summary"><div><strong>${items.length}</strong><span>Tổng dòng</span></div><div><strong>${valid}</strong><span>Hợp lệ</span></div><div><strong>${dup}</strong><span>Trùng</span></div><div><strong>${bad}</strong><span>Lỗi</span></div></div><p class="muted">${esc(fileName)}<br>Đã tự nhận diện theo tên cột, không cần đúng thứ tự.<br>Tên: ${colName(ni)} · SĐT: ${colName(pi)} · Nguồn: ${colName(si)} · Nhu cầu: ${colName(pri)}</p><div class="dialog-actions"><button class="secondary" onclick="this.closest('dialog').close()">Hủy</button><button class="primary" id="ppConfirmCSV">Nhập ${valid} khách</button></div></div>`;
    dlg.showModal();
    $('#ppConfirmCSV').onclick=()=>{importLoading(true,`Đang thêm ${valid} khách hàng...`);setTimeout(()=>{try{let added=0,dupNow=0,badNow=0,firstId=null;const current=new Set(state.customers.map(c=>normalizePhone(c.phone)));items.forEach(x=>{if(!classifyPhone(x.phone).valid){badNow++;return}if(current.has(x.phone)){dupNow++;return}current.add(x.phone);const id=crypto.randomUUID();if(!firstId)firstId=id;state.customers.unshift({id,name:x.name||'Khách hàng',phone:x.phone,source:x.source,product:x.product,status:x.status||'Chưa gọi',followup:x.followup,note:x.note,zaloStatus:'unknown',level:'Quan tâm',timeline:[{id:crypto.randomUUID(),at:new Date().toISOString(),type:'note',title:'Nhập từ Excel/CSV',detail:`Dòng ${x.row}`}],profile:{},customFields:{},documents:{},updatedAt:new Date().toISOString()});added++});if(firstId)selectedCustomerId=firstId;save();dlg.close();showView('customers');renderAll();importLoading(false);toast(`Đã nhập ${added} khách · Bỏ qua ${dupNow} số trùng · ${badNow} dòng lỗi`,6000)}catch(err){importLoading(false);toast('Lỗi khi thêm khách: '+err.message,6000)}},60)};
  }
  function importLoading(show,text='Đang đọc dữ liệu...'){
    let el=$('#aippImportLoading');
    if(!el){el=document.createElement('div');el.id='aippImportLoading';el.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.55);display:none;align-items:center;justify-content:center;padding:24px';el.innerHTML='<div style="width:min(360px,92vw);background:#fff;border-radius:18px;padding:22px;text-align:center;box-shadow:0 18px 60px rgba(0,0,0,.25)"><div style="width:42px;height:42px;border:4px solid #e5e7eb;border-top-color:#2563eb;border-radius:50%;margin:0 auto 14px;animation:aippSpin .8s linear infinite"></div><strong id="aippImportLoadingText">Đang đọc dữ liệu...</strong><div style="height:7px;background:#e5e7eb;border-radius:99px;margin-top:15px;overflow:hidden"><div style="height:100%;width:55%;background:#2563eb;border-radius:99px;animation:aippLoad 1.1s ease-in-out infinite alternate"></div></div><p style="margin:10px 0 0;color:#64748b;font-size:13px">Vui lòng không đóng AIPP trong lúc nhập.</p></div>';document.body.appendChild(el);if(!$('#aippImportAnim')){const st=document.createElement('style');st.id='aippImportAnim';st.textContent='@keyframes aippSpin{to{transform:rotate(360deg)}}@keyframes aippLoad{from{transform:translateX(-45%)}to{transform:translateX(90%)}}';document.head.appendChild(st)}}
    $('#aippImportLoadingText').textContent=text;el.style.display=show?'flex':'none';
  }
  function importPreview(file){
    const ext=(file.name.split('.').pop()||'').toLowerCase();
    importLoading(true,`Đang đọc ${file.name}...`);
    if(ext==='csv'){const r=new FileReader();r.onerror=()=>{importLoading(false);toast('Không đọc được file CSV',5000)};r.onload=()=>{try{importLoading(true,'Đang phân tích các cột...');rowsToImport(parseCSV(r.result),file.name)}finally{importLoading(false)}};r.readAsText(file);return}
    if(ext==='xlsx'||ext==='xls'){
      if(typeof XLSX==='undefined'){importLoading(false);toast('Chưa tải được bộ đọc Excel. Hãy mở AIPP khi có Internet rồi thử lại.',5000);return}
      const r=new FileReader();r.onerror=()=>{importLoading(false);toast('Không đọc được file Excel từ iCloud. Hãy tải file về máy rồi thử lại.',5500)};r.onload=()=>{try{importLoading(true,'Đang phân tích Excel...');const wb=XLSX.read(r.result,{type:'array',cellDates:false,raw:false});const ws=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false});rowsToImport(rows,file.name)}catch(err){toast('Không đọc được file Excel: '+err.message,5000)}finally{importLoading(false)}};r.readAsArrayBuffer(file);return
    }
    importLoading(false);toast('Chỉ hỗ trợ Excel .xlsx/.xls hoặc CSV');
  }
  const importEl=$('#importInput');
  if(importEl){
    importEl.accept='.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv';
    let lastImportToken='';
    const handleImportFile=e=>{
      const f=e.target.files&&e.target.files[0];
      if(!f)return;
      const token=`${f.name}|${f.size}|${f.lastModified}`;
      if(token===lastImportToken)return;
      lastImportToken=token;
      // Hiện loading ngay khi Safari trả file về cho trang.
      importLoading(true,`Đã chọn ${f.name} · đang chuẩn bị đọc...`);
      requestAnimationFrame(()=>setTimeout(()=>{
        try{importPreview(f)}catch(err){importLoading(false);toast('Lỗi mở file: '+err.message,6000)}
        e.target.value='';
        setTimeout(()=>{lastImportToken=''},400);
      },80));
    };
    importEl.onchange=handleImportFile;
    importEl.oninput=handleImportFile;
  }
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
    sticky.innerHTML=`<div><strong>👤 ${esc(c.name)}</strong><span>${esc(c.phone)}</span></div>
      <button type="button" data-aipp-scroll-top>↑ Đầu trang</button>`;
  }
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-aipp-scroll-top]')){
      document.querySelector('#detailPanel')?.scrollIntoView({behavior:'smooth',block:'start'});
    }
  });

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

  // Working Import button: always opens the real file picker.
  document.addEventListener('click',e=>{
    const b=e.target.closest('#ppImportBtn,[data-import-customers]'); if(!b)return;
    e.preventDefault(); document.querySelector('#importInput')?.click();
  },true);

  // Paste opens guidance first, then user pastes text.
  function pasteGuide(){
    let d=document.querySelector('#aippPasteDialog');
    if(!d){
      d=document.createElement('dialog');d.id='aippPasteDialog';d.className='aipp-paste-dialog';
      d.innerHTML=`<form method="dialog"><h3>📋 Dán danh sách khách</h3>
      <p class="muted">Mỗi khách một dòng. Có thể dùng các dạng:</p>
      <div class="aipp-example">Nguyễn Văn A, 0912345678<br>Trần Thị B | 0987654321<br>0336752151</div>
      <textarea id="aippPasteText" rows="8" placeholder="Dán danh sách vào đây..."></textarea>
      <div class="dialog-actions"><button value="cancel" class="secondary">Hủy</button><button type="button" id="aippPasteProcess" class="primary">Kiểm tra & nhập</button></div></form>`;
      document.body.appendChild(d);
    }
    d.showModal();
  }
  document.addEventListener('click',e=>{
    if(e.target.closest('#ppPasteBtn,[data-paste-customers]')){e.preventDefault();pasteGuide()}
    if(e.target.closest('#aippPasteProcess')){
      const raw=document.querySelector('#aippPasteText')?.value||''; if(!raw.trim()){toast('Hãy dán danh sách khách trước');return}
      let added=0,dup=0,bad=0;
      raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).forEach(line=>{
        const parts=line.split(/\s*[,\t|;]\s*/); let phone='',name='';
        for(const p of parts){const n=normalizePhone(p);if(/^0\d{9}$/.test(n)){phone=n;break}}
        name=(parts.find(p=>normalizePhone(p)!==phone)||'Khách mới').trim();
        if(!phone){bad++;return}
        if(state.customers.some(c=>normalizePhone(c.phone)===phone)){dup++;return}
        state.customers.unshift({id:uid(),name,phone,source:'Dán danh sách',need:'',status:'Chưa gọi',zalo:'unknown',note:'',nextFollowup:'',createdAt:new Date().toISOString(),tags:[],pinned:false,leadLevel:'Quan tâm',timeline:[]});
        added++;
      });
      saveA();document.querySelector('#aippPasteDialog')?.close();renderAll();toast(`Đã nhập ${added} · Trùng ${dup} · Lỗi ${bad}`);
    }
  });

  const rd=renderDetail;renderDetail=function(){rd();installLevelButtons();setTimeout(stickyFixed,0)};
  const ra=renderAll;renderAll=function(){ra();installLevelButtons();setTimeout(stickyFixed,0)};
  setTimeout(()=>{installLevelButtons();stickyFixed()},120);
})();
