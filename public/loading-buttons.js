(function(){
  const active=new WeakMap();
  let recent=null;
  const immediate='#printQuote,#saveQuote,#sendWebhook,#sendContract,#createContractCrm,#downloadContractFile,#printDeliveryNote,#mobilePrintDeliveryNote,#staffLogout,#staffManage,#staffBackup,#stockReview,#stockApply,#stockTemplate,#saveProductEdit,#createProduct,[type="submit"],[data-action],[data-open],[data-remove],.library-more';
  function begin(button){
    if(!button||button.matches('[data-no-loading]')||/^(hủy|huỷ|đóng|quay lại)/i.test(button.textContent.trim()))return;
    let state=active.get(button);
    if(!state){state={count:0,timer:0,started:Date.now()};active.set(button,state);button.classList.add('is-processing');button.setAttribute('aria-busy','true');}
    clearTimeout(state.timer);
    return state;
  }
  function finish(button,delay=450){
    const state=active.get(button);if(!state)return;
    clearTimeout(state.timer);state.timer=setTimeout(()=>{
      if(state.count>0)return;
      button.classList.remove('is-processing');button.removeAttribute('aria-busy');active.delete(button);
    },Math.max(delay-(Date.now()-state.started),0));
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('button');if(!button)return;
    if(button.classList.contains('is-processing')){event.preventDefault();event.stopImmediatePropagation();return;}
    const click={button,at:Date.now()};recent=click;
    if(button.matches(immediate))begin(button);
    setTimeout(()=>{finish(button,0);if(recent===click)recent=null;},0);
  },true);
  const originalFetch=window.fetch.bind(window);
  window.fetch=function(){
    const button=recent&&Date.now()-recent.at<1500?recent.button:null;
    const state=begin(button);if(state)state.count++;
    return originalFetch.apply(window,arguments).finally(()=>{if(state){state.count--;finish(button);}});
  };
})();
