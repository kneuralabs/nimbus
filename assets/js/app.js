const DB='nimbus_v3',STORE='files';
let db,files=[],layout='grid',currentView='all',selectedIds=new Set(),searchQuery='',currentFolder=null,folderPath=[],ctxTarget=null,shareTarget=null,renameTarget=null;

// ── HTML ESCAPE ── (prevents XSS wherever user-controlled strings enter innerHTML)
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

// ── LOOKUP ──
function fileById(id){return fileById(id)}

// ── DB ──
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=e=>e.target.result.createObjectStore(STORE,{keyPath:'id'});r.onsuccess=e=>{db=e.target.result;res()};r.onerror=rej})}
function dbAll(){return new Promise((res,rej)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).getAll();r.onsuccess=e=>res(e.target.result);r.onerror=rej})}
function dbPut(item){return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(item);tx.oncomplete=res;tx.onerror=rej})}
function dbDel(id){return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=res;tx.onerror=rej})}

// ── FORMAT ──
function fmtSize(b){if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';if(b<1073741824)return(b/1048576).toFixed(1)+' MB';return(b/1073741824).toFixed(2)+' GB'}
function fmtDate(ts){const d=new Date(ts),n=new Date();if(d.toDateString()===n.toDateString())return'Today '+d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});return d.toLocaleDateString([],{month:'short',day:'numeric',year:d.getFullYear()!==n.getFullYear()?'numeric':undefined})}
function isToday(ts){return new Date(ts).toDateString()===new Date().toDateString()}
function emoji(mime='',isFolder=false){
  if(isFolder||mime==='folder')return'📁';
  if(mime.startsWith('image'))return'🖼';if(mime.startsWith('video'))return'🎬';if(mime.startsWith('audio'))return'🎵';
  if(mime.includes('pdf'))return'📄';if(mime.includes('zip')||mime.includes('rar')||mime.includes('tar'))return'🗜';
  if(mime.includes('sheet')||mime.includes('excel')||mime.includes('csv'))return'📊';
  if(mime.includes('word')||mime.includes('document'))return'📝';if(mime.startsWith('text'))return'📃';return'📦';
}

// ── THEME with ripple wave ──
function toggleTheme(e){
  const html=document.documentElement;
  const isDark=html.dataset.theme==='dark';
  // Set click origin for potential future clip-path wave
  if(e){
    const fab=document.getElementById('theme-fab');
    const r=fab.getBoundingClientRect();
    html.style.setProperty('--cx',(r.left+r.width/2)+'px');
    html.style.setProperty('--cy',(r.top+r.height/2)+'px');
  }
  html.dataset.theme=isDark?'light':'dark';
  localStorage.setItem('nimbus-theme',html.dataset.theme);
}
(function initTheme(){
  const saved=localStorage.getItem('nimbus-theme')||'light';
  document.documentElement.dataset.theme=saved;
})();

// ── RIPPLE ──
function addRipple(el,e){
  const r=document.createElement('div');r.className='ripple';
  const rect=el.getBoundingClientRect();const size=Math.max(rect.width,rect.height)*2;
  r.style.cssText=`width:${size}px;height:${size}px;left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px`;
  el.appendChild(r);setTimeout(()=>r.remove(),550);
}

// ── VIEW ──
function getViewFiles(){
  let f=files.filter(x=>!x.deleted);
  if(currentView==='images')f=f.filter(x=>x.mime&&x.mime.startsWith('image'));
  else if(currentView==='docs')f=f.filter(x=>x.mime&&(x.mime.includes('pdf')||x.mime.includes('word')||x.mime.includes('document')||x.mime.startsWith('text')));
  else if(currentView==='videos')f=f.filter(x=>x.mime&&x.mime.startsWith('video'));
  else if(currentView==='recent')f=f.filter(x=>isToday(x.added));
  else if(currentView==='starred')f=f.filter(x=>x.starred);
  else if(currentView==='trash')f=files.filter(x=>x.deleted);
  else f=f.filter(x=>x.parent===(currentFolder||null));
  if(searchQuery)f=f.filter(x=>x.name.toLowerCase().includes(searchQuery.toLowerCase()));
  return f;
}

// ── RENDER ──
function render(){
  updateStats();updateStorageBar();updateBreadcrumb();updateBulkActions();
  const vf=getViewFiles(),c=document.getElementById('file-container');
  if(!vf.length){
    c.innerHTML=`<div class="empty"><svg viewBox="0 0 24 24" style="margin:0 auto 10px;display:block"><path d="M12 16V8M3 10a5 5 0 005 5h8a4 4 0 000-8h-.5A7 7 0 004.5 9"/></svg><p>${currentView==='trash'?'Trash is empty':'No files here. Upload something!'}</p></div>`;
    return;
  }
  if(layout==='grid'){
    c.innerHTML=`<div class="files-grid">${vf.map((f,i)=>`
      <div class="file-card${selectedIds.has(f.id)?' selected':''}" style="animation-delay:${i*30}ms" data-id="${f.id}" onclick="handleCardClick('${f.id}',event)" ondblclick="openItem('${f.id}')" oncontextmenu="showCtx(event,'${f.id}')">
        <div class="file-sel"><svg viewBox="0 0 10 8"><polyline points="1,4 4,7 9,1"/></svg></div>
        ${f.mime&&f.mime.startsWith('image')&&f.dataUrl?`<img class="file-thumb" src="${f.dataUrl}" loading="lazy" alt="${esc(f.name)}">`:`<div class="file-icon-wrap">${emoji(f.mime,f.isFolder)}</div>`}
        <div class="file-name" title="${esc(f.name)}">${esc(f.name)}</div>
        <div class="file-meta">${fmtSize(f.size||0)}</div>
      </div>`).join('')}</div>`;
  }else{
    c.innerHTML=`<div class="files-list">${vf.map((f,i)=>`
      <div class="file-row${selectedIds.has(f.id)?' selected':''}" style="animation-delay:${i*20}ms" data-id="${f.id}" onclick="handleCardClick('${f.id}',event)" ondblclick="openItem('${f.id}')" oncontextmenu="showCtx(event,'${f.id}')">
        <div class="fr-icon">${emoji(f.mime,f.isFolder)}</div>
        <div class="fr-info"><div class="fr-name">${esc(f.name)}</div><div class="fr-meta">${fmtDate(f.added)}</div></div>
        <div class="fr-size">${f.isFolder?'—':fmtSize(f.size||0)}</div>
        ${f.starred?`<div class="fr-star filled"><svg viewBox="0 0 14 14"><polygon points="7,1 9,5 13,5.5 10,8.5 10.5,12.5 7,10.5 3.5,12.5 4,8.5 1,5.5 5,5"/></svg></div>`:''}
      </div>`).join('')}</div>`;
  }
}

// ── ANIMATION HELPERS ──
function animateEl(id,cls,dur=500){
  const el=document.querySelector(`[data-id="${id}"]`);
  if(!el)return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(()=>{const e=document.querySelector(`[data-id="${id}"]`);if(e)e.classList.remove(cls);},dur);
}

// ── STATS with count-up ──
function animateNumber(el,target,suffix=''){
  const start=parseInt(el.textContent)||0;
  if(start===target){el.textContent=target+suffix;return;}
  const dur=350,step=16,steps=dur/step;let cur=0;
  const inc=()=>{cur++;const val=Math.round(start+(target-start)*(cur/steps));el.textContent=val+suffix;if(cur<steps)requestAnimationFrame(inc);}
  requestAnimationFrame(inc);
}
function updateStats(){
  const all=files.filter(x=>!x.deleted&&!x.isFolder);
  animateNumber(document.getElementById('stat-files'),all.length);
  document.getElementById('stat-size').textContent=fmtSize(all.reduce((a,b)=>a+(b.size||0),0));
  animateNumber(document.getElementById('stat-today'),all.filter(x=>isToday(x.added)).length);
}
function updateStorageBar(){
  const used=files.filter(x=>!x.deleted&&!x.isFolder).reduce((a,b)=>a+(b.size||0),0);
  const pct=Math.min(100,(used/(5*1024*1024*1024))*100);
  document.getElementById('storage-label').textContent=`${fmtSize(used)} of 5 GB`;
  setTimeout(()=>{document.getElementById('storage-fill').style.width=pct.toFixed(2)+'%'},100);
}
function updateBreadcrumb(){
  const bc=document.getElementById('breadcrumb');
  const parts=[{id:null,name:'Home'},...folderPath];
  bc.innerHTML=parts.map((p,i)=>{
    if(i===parts.length-1)return`<span class="breadcrumb-item current">${esc(p.name)}</span>`;
    return`<span class="breadcrumb-item" onclick="navToFolder('${p.id}')">${esc(p.name)}</span><span class="breadcrumb-sep">/</span>`;
  }).join('');
}
function updateBulkActions(){
  const el=document.getElementById('bulk-actions');
  const ta=document.getElementById('trash-actions');
  const db=document.getElementById('trash-delete-btn');
  const inTrash=currentView==='trash';
  // In trash: show dedicated trash-actions bar; hide generic bulk-actions
  if(ta){ta.style.display=inTrash?'flex':'none';}
  if(db){db.disabled=selectedIds.size===0;db.style.opacity=selectedIds.size===0?'.45':'1';}
  if(!el)return;
  const showing=selectedIds.size>0&&!inTrash;
  if(showing&&el.style.display==='none'){
    el.style.display='flex';
    el.style.animation='fadeInUp .22s cubic-bezier(.34,1.4,.64,1)';
    setTimeout(()=>el.style.animation='',220);
  }else if(!showing){
    el.style.display='none';
  }
}

// ── NAV ──
function setView(v,el){
  currentView=v;currentFolder=null;folderPath=[];selectedIds.clear();searchQuery='';
  document.getElementById('search-input').value='';
  document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));
  if(el)el.classList.add('active');render();
}
function setLayout(l){
  layout=l;
  const gb=document.getElementById('grid-btn'),lb=document.getElementById('list-btn');
  gb.style.background=l==='grid'?'var(--text)':'none';gb.style.color=l==='grid'?'var(--bg)':'var(--muted)';
  lb.style.background=l==='list'?'var(--text)':'none';lb.style.color=l==='list'?'var(--bg)':'var(--muted)';
  render();
}
function filterFiles(){searchQuery=document.getElementById('search-input').value;render()}
function handleCardClick(id,e){
  if(e.ctrlKey||e.metaKey||e.shiftKey){if(selectedIds.has(id))selectedIds.delete(id);else selectedIds.add(id);}
  else{selectedIds.clear();selectedIds.add(id);}
  updateBulkActions();render();
  const el=document.querySelector(`[data-id="${id}"]`);
  if(el)addRipple(el,e);
}
function openItem(id){
  const f=fileById(id);if(!f)return;
  if(f.isFolder){currentFolder=id;folderPath.push({id,name:f.name});selectedIds.clear();render();}
  else previewFile(f);
}
function navToFolder(id){
  if(!id){currentFolder=null;folderPath=[];}
  else{const idx=folderPath.findIndex(x=>x.id===id);if(idx>=0){folderPath=folderPath.slice(0,idx+1);currentFolder=id;}}
  selectedIds.clear();render();
}

// ── UPLOAD with animation ──
function triggerUpload(){document.getElementById('file-input').click()}
async function handleFiles(fileList){
  const prog=document.getElementById('upload-progress');
  prog.style.display='block';prog.style.animation='fadeInUp .22s ease';
  prog.innerHTML='<div style="font-size:11px;font-weight:500;margin-bottom:6px;color:var(--muted)">Uploading…</div>';
  const addedIds=[];
  for(const file of fileList){
    const slug='u_'+Math.random().toString(36).slice(2);
    prog.insertAdjacentHTML('beforeend',`<div class="up-item"><div class="up-name">${esc(file.name)}</div><div class="up-bar"><div class="up-fill" id="${slug}_bar"></div></div><div class="up-pct" id="${slug}_pct">0%</div></div>`);
    await new Promise(res=>{
      const reader=new FileReader();let pv=0;
      const iv=setInterval(()=>{pv=Math.min(pv+Math.random()*25,90);const b=document.getElementById(slug+'_bar'),p=document.getElementById(slug+'_pct');if(b)b.style.width=pv.toFixed(0)+'%';if(p)p.textContent=pv.toFixed(0)+'%';},60);
      reader.onload=async e=>{
        clearInterval(iv);
        const b=document.getElementById(slug+'_bar'),p=document.getElementById(slug+'_pct');
        if(b){b.style.width='100%';b.classList.add('done');}if(p)p.textContent='✓';
        const id='f_'+Date.now()+'_'+Math.random().toString(36).slice(2);
        const item={id,name:file.name,size:file.size,mime:file.type||'application/octet-stream',added:Date.now(),starred:false,deleted:false,dataUrl:e.target.result,parent:currentFolder||null};
        files.push(item);addedIds.push(id);await dbPut(item);render();
        // ADD animation: after render, flash the new card
        setTimeout(()=>animateEl(id,'added',500),50);
        res();
      };
      reader.readAsDataURL(file);
    });
  }
  setTimeout(()=>{
    prog.style.display='none';prog.innerHTML='';
    showToast(`✅ Uploaded ${fileList.length} file${fileList.length>1?'s':''}`,fileList.length>0?'t-success':'');
  },700);
}
function onDragOver(e){e.preventDefault();document.getElementById('drop-zone').classList.add('drag')}
function onDragLeave(){document.getElementById('drop-zone').classList.remove('drag')}
function onDrop(e){e.preventDefault();document.getElementById('drop-zone').classList.remove('drag');handleFiles(e.dataTransfer.files)}

// ── FOLDER ──
function openNewFolder(){openModal('folder-modal');setTimeout(()=>document.getElementById('folder-name-input').focus(),160)}
async function createFolder(){
  const name=document.getElementById('folder-name-input').value.trim();if(!name)return;
  const id='d_'+Date.now();
  const item={id,name,size:0,mime:'folder',isFolder:true,added:Date.now(),starred:false,deleted:false,parent:currentFolder||null};
  files.push(item);await dbPut(item);closeModal('folder-modal');render();
  setTimeout(()=>animateEl(id,'added',500),50);
  showToast('📁 Folder created','t-success');
}

// ── DELETE ANIMATION ──
async function removeWithAnimation(id){
  const el=document.querySelector(`[data-id="${id}"]`);
  if(el){
    const isRow=el.classList.contains('file-row');
    el.classList.add('removing');
    el.style.animation=isRow
      ? 'deleteRowSweep .35s cubic-bezier(.4,0,1,1) forwards'
      : 'deleteSweep .32s cubic-bezier(.4,0,1,1) forwards';
    el.style.pointerEvents='none';
    await new Promise(r=>setTimeout(r,320));
  }
}
async function deleteSelected(){
  if(!selectedIds.size)return;
  const count=selectedIds.size;
  for(const id of selectedIds){
    await removeWithAnimation(id);
    const f=fileById(id);if(!f)continue;
    if(currentView==='trash'){await dbDel(id);files=files.filter(x=>x.id!==id);}
    else{f.deleted=true;await dbPut(f);}
  }
  showToast(currentView==='trash'?`🗑 ${count} item${count>1?'s':''} permanently deleted`:`🗑 Moved to trash`,'t-danger');
  selectedIds.clear();render();
}

async function purgeTrash(){
  const trashed=files.filter(x=>x.deleted);
  if(!trashed.length){showToast('Trash is already empty');return;}
  const count=trashed.length;
  await Promise.all(trashed.map(f=>removeWithAnimation(f.id)));
  for(const f of trashed){await dbDel(f.id);}
  files=files.filter(x=>!x.deleted);
  showToast(`🗑 ${count} item${count>1?'s':''} permanently deleted`,'t-danger');
  selectedIds.clear();render();
}


// ── STAR with pop animation ──
async function starSelected(){
  for(const id of selectedIds){
    const f=fileById(id);if(!f)continue;
    f.starred=!f.starred;await dbPut(f);
    animateEl(id,'starred-flash',500);
  }
  const isStarred=files.find(x=>selectedIds.has(x.id))?.starred;
  showToast(isStarred?'⭐ Starred':'Unstarred');
  selectedIds.clear();render();
}
function shareSelected(){const id=[...selectedIds][0];if(!id)return;const f=fileById(id);if(f)openShareModal(f);}

// ── PREVIEW ──
function previewFile(f){
  document.getElementById('preview-title').textContent=f.name;
  const body=document.getElementById('preview-body');
  if(!f.dataUrl){body.innerHTML=`<div class="preview-icon">${emoji(f.mime)}</div><div class="preview-name">${esc(f.name)}</div><div class="preview-info">${fmtSize(f.size)}</div>`;openModal('preview-modal');return;}
  let html='';
  if(f.mime.startsWith('image'))html=`<img class="preview-img" src="${f.dataUrl}" alt="${esc(f.name)}">`;
  else if(f.mime.startsWith('video'))html=`<video class="preview-video" src="${f.dataUrl}" controls></video>`;
  else if(f.mime.startsWith('audio'))html=`<div class="preview-icon">🎵</div><audio class="preview-audio" src="${f.dataUrl}" controls></audio>`;
  else if(f.mime.includes('pdf'))html=`<iframe class="preview-pdf" src="${f.dataUrl}"></iframe>`;
  else if(f.mime.startsWith('text')){
    try{
      // Use TextDecoder so UTF-8 text files (non-ASCII) render correctly instead of mojibake
      const bytes=Uint8Array.from(atob(f.dataUrl.split(',')[1]),c=>c.charCodeAt(0));
      const text=new TextDecoder('utf-8').decode(bytes);
      html=`<pre class="preview-text">${esc(text).slice(0,8000)}</pre>`;
    }catch(e){html=`<div class="preview-icon">${emoji(f.mime)}</div>`;}
  }
  else html=`<div class="preview-icon">${emoji(f.mime)}</div><div class="preview-name">${esc(f.name)}</div><div class="preview-info">${fmtSize(f.size)}</div>`;
  html+=`<div class="preview-actions"><button class="btn btn-sm btn-icon-label" onclick="downloadFile('${f.id}')" title="Download"><svg viewBox="0 0 14 14" style="width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:1.8"><line x1="7" y1="2" x2="7" y2="9"/><polyline points="4,7 7,10 10,7"/><line x1="2" y1="12" x2="12" y2="12"/></svg><span class="btn-label">Download</span></button><button class="btn btn-sm btn-icon-label" onclick="openShareModal(fileById('${f.id}'))" title="Share"><svg viewBox="0 0 14 14" style="width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:1.8"><circle cx="11" cy="3" r="1.8" fill="none"/><circle cx="3" cy="7" r="1.8" fill="none"/><circle cx="11" cy="11" r="1.8" fill="none"/><line x1="4.8" y1="6.1" x2="9.2" y2="4.2"/><line x1="4.8" y1="7.9" x2="9.2" y2="9.8"/></svg><span class="btn-label">Share</span></button></div>`;
  body.innerHTML=html;openModal('preview-modal');
}
function downloadFile(id){const f=fileById(id);if(!f||!f.dataUrl)return;const a=document.createElement('a');a.href=f.dataUrl;a.download=f.name;a.click();showToast('⬇ Downloading '+f.name);}

// ── SHARE ──
function openShareModal(f){if(!f)return;shareTarget=f;document.getElementById('share-info').innerHTML=`<strong>${esc(f.name)}</strong> &bull; ${fmtSize(f.size||0)}`;const link=f.dataUrl||'';document.getElementById('share-link').value=link.length>200?link.slice(0,200)+'…':link;openModal('share-modal');}
function copyShareLink(){if(!shareTarget?.dataUrl){showToast('No data');return;}navigator.clipboard.writeText(shareTarget.dataUrl).then(()=>showToast('🔗 Link copied!','t-info')).catch(()=>{document.getElementById('share-link').select();document.execCommand('copy');showToast('Copied!');});}
function downloadShareFile(){if(!shareTarget)return;downloadFile(shareTarget.id);}
function exportShareHtml(){
  if(!shareTarget?.dataUrl){showToast('No file selected');return;}const f=shareTarget;
  let content='';
  if(f.mime.startsWith('image'))content=`<img src="${f.dataUrl}" style="max-width:100%;border-radius:8px">`;
  else if(f.mime.startsWith('video'))content=`<video src="${f.dataUrl}" controls style="max-width:100%"></video>`;
  else if(f.mime.startsWith('audio'))content=`<audio src="${f.dataUrl}" controls></audio>`;
  else content=`<p><a href="${f.dataUrl}" download="${esc(f.name)}" style="color:#1A65B8">${esc(f.name)}</a></p>`;
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(f.name)}</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap" rel="stylesheet"><style>body{font-family:Inter,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#f7f7f5;padding:20px}h2{font-size:16px;margin-bottom:16px;color:#111}</style></head><body><h2>${esc(f.name)}</h2>${content}</body></html>`;
  const blob=new Blob([html],{type:'text/html'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=f.name.replace(/\.[^.]+$/,'')+'-shared.html';a.click();showToast('📄 Exported as HTML');
}

// ── CONTEXT MENU ──
function showCtx(e,id){e.preventDefault();e.stopPropagation();ctxTarget=id;selectedIds.clear();selectedIds.add(id);updateBulkActions();render();const m=document.getElementById('ctx-menu');m.style.display='block';const x=Math.min(e.clientX,window.innerWidth-175),y=Math.min(e.clientY,window.innerHeight-240);m.style.left=x+'px';m.style.top=y+'px';m.style.animation='fadeInUp .15s cubic-bezier(.34,1.4,.64,1)';}
function hideCtx(){const m=document.getElementById('ctx-menu');m.style.display='none';}
function ctxPreview(){hideCtx();const f=fileById(ctxTarget);if(f&&!f.isFolder)previewFile(f);}
function ctxDownload(){hideCtx();downloadFile(ctxTarget);}
function ctxShare(){hideCtx();const f=fileById(ctxTarget);if(f)openShareModal(f);}
async function ctxStar(){hideCtx();const f=fileById(ctxTarget);if(!f)return;f.starred=!f.starred;await dbPut(f);animateEl(ctxTarget,'starred-flash',500);render();showToast(f.starred?'⭐ Starred':'Unstarred');}

// ── RENAME (now uses modal instead of prompt) ──
function ctxRename(){
  hideCtx();
  const f=fileById(ctxTarget);if(!f)return;
  renameTarget=ctxTarget;
  const inp=document.getElementById('rename-input');
  inp.value=f.name;
  openModal('rename-modal');
  setTimeout(()=>{inp.focus();inp.select();},160);
}
async function confirmRename(){
  const name=document.getElementById('rename-input').value.trim();
  if(!name)return;
  const f=fileById(renameTarget);if(!f)return;
  if(name===f.name){closeModal('rename-modal');return;}
  f.name=name;
  await dbPut(f);
  closeModal('rename-modal');
  render();
  // MODIFY animation
  setTimeout(()=>animateEl(renameTarget,'modified',500),50);
  showToast('✏️ Renamed','t-info');
  renameTarget=null;
}

async function ctxDelete(){
  hideCtx();
  await removeWithAnimation(ctxTarget);
  const f=fileById(ctxTarget);if(!f)return;
  if(currentView==='trash'){
    await dbDel(ctxTarget);files=files.filter(x=>x.id!==ctxTarget);
    showToast('🗑 Permanently deleted','t-danger');
  }else{
    f.deleted=true;await dbPut(f);
    showToast('🗑 Moved to trash','t-danger');
  }
  selectedIds.clear();render();
}

// ── MODAL ──
function openModal(id){const m=document.getElementById(id);if(m)m.classList.add('open')}
function closeModal(id){const _m=document.getElementById(id);if(_m)_m.classList.remove('open');if(id==='preview-modal')document.getElementById('preview-body').innerHTML='';}

// ── TOAST ── (now with types: t-success, t-danger, t-info)
let _t;
function showToast(msg,type=''){
  const t=document.getElementById('toast');
  const icon=document.getElementById('toast-icon');
  const msgEl=document.getElementById('toast-msg');
  // detect icon from msg
  const emojiMatch=msg.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u);
  if(emojiMatch){icon.textContent=emojiMatch[0].trim();msgEl.textContent=msg.replace(emojiMatch[0],'').trim();}
  else{icon.textContent='';msgEl.textContent=msg;}
  t.className='toast'+(type?' '+type:'');
  t.classList.add('show');
  clearTimeout(_t);_t=setTimeout(()=>t.classList.remove('show'),2500);
}

// ── GLOBAL EVENTS ──
document.addEventListener('click',e=>{
  hideCtx();
  if(!e.target.closest('.file-card')&&!e.target.closest('.file-row')&&!e.target.closest('#bulk-actions')){selectedIds.clear();updateBulkActions();}
});
document.querySelectorAll('.overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open')}));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){hideCtx();document.querySelectorAll('.overlay.open').forEach(o=>o.classList.remove('open'));}});


// ── GITHUB SYNC ──
const GH_KEY='nimbus-gh';
function ghGetSaved(){return JSON.parse(localStorage.getItem(GH_KEY)||'{}')}
function ghSetSaved(obj){localStorage.setItem(GH_KEY,JSON.stringify({...ghGetSaved(),...obj}))}

// Dot left-click: connect if not set up, otherwise commit immediately
function ghDotClick(){
  if(ghGetSaved().token){ghCommitAll();}
  else{openGithubModal();}
}

// Dot right-click: show disconnect menu when connected
function ghDotRightClick(e){
  if(!ghGetSaved().token){openGithubModal();return;}
  e.preventDefault();e.stopPropagation();
  const m=document.getElementById('gh-dot-menu');
  m.style.display='block';
  const r=document.getElementById('gh-dot').getBoundingClientRect();
  m.style.left=Math.min(r.left,window.innerWidth-140)+'px';
  m.style.top=(r.bottom+6)+'px';
}
function ghDotMenuDisconnect(){
  document.getElementById('gh-dot-menu').style.display='none';
  ghDisconnect();
}

function openGithubModal(){
  const saved=ghGetSaved();
  const st=document.getElementById('gh-status-connect');if(st){st.className='gh-status';st.textContent='';}
  document.getElementById('gh-token').value='';
  if(saved.repo)document.getElementById('gh-repo').value=saved.repo;
  if(saved.branch)document.getElementById('gh-branch').value=saved.branch||'main';
  const btn=document.getElementById('gh-connect-btn');if(btn)btn.disabled=false;
  openModal('github-modal');
  setTimeout(()=>document.getElementById('gh-token').focus(),160);
}

function ghConnect(){
  const token=document.getElementById('gh-token').value.trim();
  const repo=document.getElementById('gh-repo').value.trim();
  const branch=document.getElementById('gh-branch').value.trim()||'main';
  const status=document.getElementById('gh-status-connect');
  const btn=document.getElementById('gh-connect-btn');
  if(!token){status.className='gh-status err';status.textContent='⚠ Please enter a token.';return;}
  if(!repo){status.className='gh-status err';status.textContent='⚠ Please enter a repository (owner/repo).';return;}
  status.className='gh-status loading';status.textContent='Verifying token…';
  if(btn)btn.disabled=true;
  fetch('https://api.github.com/user',{headers:{'Authorization':'token '+token}})
    .then(r=>{
      if(r.ok)return r.json().then(u=>{
        ghSetSaved({token,repo,branch});
        document.getElementById('gh-dot').classList.add('connected');
        closeModal('github-modal');
        showToast('🔗 Connected as '+u.login,'t-success');
      });
      throw new Error('Invalid token (status '+r.status+')');
    })
    .catch(e=>{
      status.className='gh-status err';status.textContent='⚠ '+e.message;
      if(btn)btn.disabled=false;
    });
}

function ghDisconnect(){
  const s=ghGetSaved();delete s.token;
  localStorage.setItem(GH_KEY,JSON.stringify(s));
  document.getElementById('gh-dot').classList.remove('connected');
  showToast('Disconnected from GitHub');
}

// Show a persistent progress toast (no auto-dismiss)
function ghShowProgress(msg){
  clearTimeout(_t);
  const t=document.getElementById('toast'),icon=document.getElementById('toast-icon'),msgEl=document.getElementById('toast-msg');
  icon.textContent='☁️';msgEl.textContent=msg;
  t.className='toast t-info show';
}

// Commit a single file to storage/<name> in the repo; get existing SHA first to allow updates
async function ghPutFile(headers,repo,branch,name,b64){
  const url='https://api.github.com/repos/'+repo+'/contents/storage/'+encodeURIComponent(name);
  let sha=null;
  const check=await fetch(url+'?ref='+encodeURIComponent(branch),{headers});
  if(check.ok){sha=(await check.json()).sha;}
  const body={message:'Sync '+name+' via Nimbus',content:b64,branch};
  if(sha)body.sha=sha;
  const res=await fetch(url,{method:'PUT',headers,body:JSON.stringify(body)});
  if(!res.ok){const err=await res.json();throw new Error((err.message||res.status)+' ['+name+']');}
}

async function ghCommitAll(){
  const saved=ghGetSaved();
  if(!saved.token){openGithubModal();return;}
  const toSync=files.filter(x=>!x.deleted&&!x.isFolder&&x.dataUrl);
  if(!toSync.length){showToast('No files to sync','t-info');return;}
  const headers={'Authorization':'token '+saved.token,'Content-Type':'application/json'};
  const {repo,branch='main'}=saved;
  let done=0;const total=toSync.length;
  ghShowProgress('Syncing 0 / '+total+'…');
  for(const f of toSync){
    try{
      await ghPutFile(headers,repo,branch,f.name,f.dataUrl.split(',')[1]);
      done++;
      ghShowProgress('Syncing '+done+' / '+total+'…');
    }catch(e){
      showToast('⚠ '+e.message,'t-danger');
      return;
    }
  }
  showToast('✅ '+total+' file'+(total>1?'s':'')+' synced to storage/','t-success');
}


// ── BOOT ──
(function(){const s=ghGetSaved();if(s.token){document.getElementById('gh-dot').classList.add('connected');}})();
// Hide gh-dot-menu on any outside click
document.addEventListener('click',()=>{ const m=document.getElementById('gh-dot-menu');if(m)m.style.display='none'; });
openDB().then(async()=>{files=await dbAll();render()}).catch(()=>render());
