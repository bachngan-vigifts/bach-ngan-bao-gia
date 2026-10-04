(function(){
  const $=selector=>document.querySelector(selector);
  const card=()=>$('.customer-card');
  const toggle=()=>$('#customerInfoToggle');
  const customerInput=()=>$('#customerName');

  function setCustomerSummary(){
    const button=toggle(),wrap=card();
    if(!button||!wrap)return;
    const expanded=wrap.classList.contains('is-expanded');
    const name=(customerInput()?.value||'').trim()||'Khách hàng';
    button.setAttribute('aria-expanded',String(expanded));
    button.innerHTML='<span class="customer-summary-name"></span>';
    button.querySelector('.customer-summary-name').textContent=name;
  }

  function expandCustomerCard(){
    const wrap=card();
    if(!wrap)return;
    wrap.classList.add('is-expanded');
    setCustomerSummary();
  }

  function init(){
    const button=toggle(),input=customerInput();
    if(button){
      button.addEventListener('click',event=>{
        event.preventDefault();
        event.stopImmediatePropagation();
        card()?.classList.toggle('is-expanded');
        setCustomerSummary();
      },true);
    }
    input?.addEventListener('input',setCustomerSummary);
    input?.addEventListener('change',setCustomerSummary);
    $('#mobileAddRowNav')?.addEventListener('click',event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      expandCustomerCard();
      setTimeout(()=>input?.focus(),180);
    },true);
    $('#mobileTemplateNav')?.addEventListener('click',event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      document.querySelector('#newQuote')?.click();
    },true);
    setCustomerSummary();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();
