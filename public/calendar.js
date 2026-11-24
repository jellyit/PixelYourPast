(()=>{
if(window.pixelCalendarLoaded)return;window.pixelCalendarLoaded=true;
const $=s=>document.querySelector(s),modal=$('#booking'),prices={4:75,7:95,14:135,30:225};
let context=null,month='',days=4,method='delivery',selected=null,hold=null,generation=0,clockOffset=0,requestId=null,loading=false;
const format=(value,opts={day:'numeric',month:'short',year:'numeric'})=>new Date(value+'T12:00:00Z').toLocaleDateString('en-GB',{...opts,timeZone:'UTC'});
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path,options){const r=await fetch('/api/calendar'+path,{cache:'no-store',...options});let data;try{data=await r.json()}catch{throw new Error('The calendar could not load. Please refresh and try again.')}if(!r.ok)throw new Error(data.error||'Please try again.');return data;}
function error(message=''){ $('#booking-error').textContent=message;$('#booking-error').hidden=!message; }
function monthShift(value,delta){const d=new Date(value+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+delta);return d.toISOString().slice(0,7);}
function clearSelection(){selected=null;requestId=null;$('#date-summary').innerHTML='<p class="hint">Choose an available start date above.</p>';$('#hold-button').disabled=true;}
function summary(w){return `<div class="rental-timeline"><h3>Your rental dates</h3><dl>${method==='delivery'?`<dt>Dispatched</dt><dd>${format(w.start)}</dd>`:''}<dt>${method==='delivery'?'Delivered / rental starts':'Collect / rental starts'}</dt><dd>${format(w.rentalStart)}</dd><dt>${method==='delivery'?'Post back by':'Return locally by'}</dt><dd>${format(w.returnDate)}</dd>${method==='delivery'?`<dt>Expected back with us</dt><dd>${format(w.received)}</dd>`:''}<dt>Checking & cleaning</dt><dd>${format(w.cleaning)}</dd></dl><p class="hint">${method==='delivery'?'If the return date falls on a non-working day, post it back on the next working day at no extra rental charge.':'Collection and return times will be arranged separately.'}</p></div>`;}
async function load(){
 if(!context){error('Please close and reopen the calendar to reconnect.');return;}
 const version=++generation;loading=true;clearSelection();error();$('#calendar-grid').setAttribute('aria-busy','true');$('#calendar-grid').innerHTML='<p class="calendar-loading">Checking both scanners…</p>';
 $('#month-label').textContent=format(month+'-01',{month:'long',year:'numeric'});$('#month-prev').disabled=month<=context.today.slice(0,7);$('#month-next').disabled=month>=monthShift(context.today.slice(0,7),12);
 $('#total').textContent='£'+prices[days];$('#method-summary').textContent=method==='delivery'?'Postage included':'Local collection';
 $('#calendar-rules').textContent=method==='delivery'?'Postage: one working day each way, plus one full day for checking and cleaning. Working days exclude weekends and England & Wales bank holidays.':'Collection dates include one full day for checking and cleaning after return.';
 try{const data=await api(`/availability?month=${month}&days=${days}&method=${method}`);if(version!==generation)return;
 const offset=(new Date(month+'-01T12:00:00Z').getUTCDay()+6)%7;$('#calendar-grid').innerHTML='<span></span>'.repeat(offset)+data.dates.map(d=>`<button class="calendar-day ${d.available===1?'one-left':''}" ${d.available?'':'disabled'} data-date="${d.date}" title="${escape(d.reason||d.available+' scanners available')}" aria-label="${format(d.date)}, ${d.available?d.available+' available':escape(d.reason)}"><b>${Number(d.date.slice(-2))}</b><small>${d.available?d.available+' free':'—'}</small></button>`).join('');
 $('#calendar-grid').querySelectorAll('button:not(:disabled)').forEach(button=>button.addEventListener('click',()=>{selected=data.dates.find(d=>d.date===button.dataset.date);requestId=crypto.randomUUID();$('#calendar-grid').querySelectorAll('button').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button))});$('#date-summary').innerHTML=summary(selected.window);$('#hold-button').disabled=false;error();}));
 }catch(e){if(version===generation){error(e.message);$('#calendar-grid').innerHTML='<p class="calendar-loading">Availability unavailable. <button id="retry-calendar">Try again</button></p>';$('#retry-calendar').onclick=load;}}
 finally{if(version===generation){loading=false;$('#calendar-grid').setAttribute('aria-busy','false');}}
}
function showHold(){
 $('#existing-hold').hidden=!hold;$('#calendar-form').hidden=!!hold;
 if(!hold)return;
 $('#existing-hold').innerHTML=`<div class="hold-card"><span class="hold-icon">✓</span><h3>Your scanner is temporarily held</h3><p>${hold.days} days · ${format(hold.rentalStart)} · £${hold.price}</p><p>${hold.method==='delivery'?'Delivery':'Local collection'} · Return by ${format(hold.returnDate)}</p><p class="hold-timer" id="hold-timer"></p><p>Online payments are not connected yet. This is a temporary hold only, not a confirmed rental.</p><button id="release-hold" class="button outline">Release hold & choose again</button></div>`;
 $('#release-hold').onclick=async()=>{const button=$('#release-hold');button.disabled=true;try{await api('/hold',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:hold.id})});hold=null;showHold();await load();}catch(e){error(e.message);button.disabled=false;}};tick();
}
function tick(){if(!hold)return;const seconds=hold.expires-Math.floor((Date.now()+clockOffset)/1000);if(seconds<=0){hold=null;showHold();if(modal.open){load().then(()=>error('Your hold expired. Choose your dates again to check current availability.'));}return;}if($('#hold-timer'))$('#hold-timer').textContent=`Held for ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} more`;
}
async function open(chosenDays){if(chosenDays){days=Number(chosenDays);$(`[name="days"][value="${days}"]`).checked=true;}modal.showModal();error();try{context=await api('/context');month=month||context.today.slice(0,7);if(context.signedIn){const data=await api('/hold');hold=data.hold;clockOffset=data.serverTime*1000-Date.now();}showHold();if(!hold)await load();}catch(e){error(e.message);}}
document.querySelectorAll('[data-book],[data-days]').forEach(button=>button.onclick=()=>open(button.dataset.days));$('.close').onclick=()=>modal.close();
modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)modal.close();}});
document.querySelectorAll('[name="days"],[name="method"]').forEach(input=>input.onchange=()=>{days=Number($('[name="days"]:checked').value);method=$('[name="method"]:checked').value;load();});
$('#month-prev').onclick=()=>{month=monthShift(month,-1);load();};$('#month-next').onclick=()=>{month=monthShift(month,1);load();};
$('#hold-button').onclick=async()=>{if(!selected||loading)return;if(!context.signedIn){location.href='/signin-with-chatgpt?return_to=/';return;}const button=$('#hold-button');button.disabled=true;button.textContent='Securing your scanner…';error();try{const data=await api('/hold',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:requestId,start:selected.date,days,method})});hold=data.reservation;clockOffset=data.serverTime*1000-Date.now();showHold();}catch(e){const message=e.message;await load();error(message);}finally{button.textContent='Hold this scanner for 15 minutes →';}};
api('/context').then(c=>{context=c;}).catch(()=>{});
setInterval(tick,1000);setInterval(()=>{if(modal.open&&!hold&&!selected&&!loading&&context)load();},30000);
})();
