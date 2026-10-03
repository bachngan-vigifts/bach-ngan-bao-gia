/* Approved contract data is read-only for staff; the server enforces the same rule. */
function installContractLock(){
 const selectors='.workspace input,.workspace textarea,.workspace select,.workspace button,.workspace [contenteditable],.quote-type,#saveQuote,#deleteQuote,#createContractCrm,#mobileContract,#openSupplierOrder,#addBlank,#openSearch2';
 function locked(){return state?._record?.contractApproval?.status==='approved'&&BN.user?.role!=='manager';}
 function sync(){const lock=locked();document.body.classList.toggle('contract-readonly',lock);document.querySelectorAll(selectors).forEach(el=>{if(lock){if(!el.hasAttribute('data-contract-lock')){el.dataset.contractLock=JSON.stringify({disabled:el.disabled,editable:el.getAttribute('contenteditable')});}if('disabled'in el)el.disabled=true;if(el.hasAttribute('contenteditable'))el.contentEditable='false';}else if(el.dataset.contractLock){const before=JSON.parse(el.dataset.contractLock);if('disabled'in el)el.disabled=!!before.disabled;if(before.editable!==null)el.setAttribute('contenteditable',before.editable);delete el.dataset.contractLock;}});}
 const oldHydrate=hydrate;hydrate=function(...args){const result=oldHydrate.apply(this,args);queueMicrotask(sync);return result;};
 let queued=false;new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(()=>{queued=false;sync();});}}).observe(document.body,{childList:true,subtree:true});
 document.addEventListener('click',e=>{if(locked()&&e.target.closest(selectors)){e.preventDefault();e.stopImmediatePropagation();}},true);
 BN.refreshContractReadOnly=sync;
 window.addEventListener('focus',async()=>{const id=state?._record?.id;if(!id)return;try{const record=await BN.api('/quotes/'+encodeURIComponent(id));if(state._record?.id!==id)return;Object.assign(state._record,{canEdit:record.canEdit,contractApproval:record.contractApproval,canExportContract:record.canExportContract});sync();BN.refreshContractDocumentAction?.();}catch{}});
 sync();
}
if(typeof hydrate==='function'&&BN.user)installContractLock();else window.addEventListener('bn-staff-ready',installContractLock,{once:true});

