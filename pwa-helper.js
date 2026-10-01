/* AIPP PWA runtime helper - iPhone/Windows safe layer */
(() => {
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  window.AIPP_PWA = { isPWA:true, isStandalone, isIOS };

  // Keep pending schedule reminders visible while the app is open.
  async function notifyDue(){
    try{
      if(!('Notification' in window) || Notification.permission !== 'granted') return;
      const raw=localStorage.getItem('telesale-assistant-v1');
      if(!raw) return;
      const st=JSON.parse(raw), now=Date.now();
      const key='aipp-pwa-notified';
      const seen=JSON.parse(localStorage.getItem(key)||'{}');
      let changed=false;
      for(const s of (st.schedules||[])){
        if(s.status!=='scheduled') continue;
        const at=new Date(s.sendAt||0).getTime();
        if(!Number.isFinite(at)||at>now||seen[s.id]) continue;
        const c=(st.customers||[]).find(x=>x.id===s.customerId);
        new Notification('AIPP • Đến lịch chăm sóc', {body:`${c?.name||'Khách hàng'}${c?.phone?' • '+c.phone:''}`, icon:'./icon-192.png'});
        seen[s.id]=Date.now(); changed=true;
      }
      if(changed) localStorage.setItem(key,JSON.stringify(seen));
    }catch(_){ }
  }
  setInterval(notifyDue,30000);
  addEventListener('focus',notifyDue);

  addEventListener('DOMContentLoaded',()=>{
    // On iOS installed PWA, prevent accidental text zoom on repeated form focus where possible.
    document.documentElement.classList.add('aipp-pwa');
    if(isIOS && !isStandalone){
      const n=document.getElementById('browserNotice');
      if(n){n.classList.remove('hidden'); const t=n.querySelector('span,div,p'); if(t)t.textContent='📱 Để dùng như ứng dụng: Safari → Chia sẻ → Thêm vào Màn hình chính.';}
    }
  });
})();
