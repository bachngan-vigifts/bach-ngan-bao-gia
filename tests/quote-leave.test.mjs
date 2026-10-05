import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync('public/app.js','utf8');
function setup(initial={type:'HRC',quoteNo:'Q1',rows:[{id:'r1',qty:1}]}){
 const storage=new Map(),dialogs=[],listeners={},calls={save:0,reload:0};
 const button={classList:{toggle(){}}},status={};
 const ctx={state:structuredClone(initial),BN:{user:{id:'u1'}},URL,
  location:{href:'https://example.test/quote?quoteId=old&dashboardAction=new&keep=1#rows',reload(){calls.reload++;}},
  history:{replaceState(_state,_title,url){ctx.location.href=String(url);}},
  sessionStorage:{setItem(k,v){storage.set(k,v)},getItem(k){return storage.get(k)||null},removeItem(k){storage.delete(k)}},
  $:selector=>selector==='#saveQuote'?button:selector==='#saveState'?status:null,$$:()=>[],collect(){},hydrate(){},
  saveDraft(){storage.set('bn-draft:u1',JSON.stringify(ctx.state));},
  saveToLibrary:async()=>{calls.save++;return true;},
  confirm(){throw Error('Unexpected native confirmation');},
  document:{body:{append(){}},addEventListener(name,fn){listeners[name]=fn},createElement(){
   const dialog={returnValue:'',setAttribute(){},addEventListener(name,fn){this[name]=fn},showModal(){},remove(){},choose(value){this.returnValue=value;this.close();}};
   dialogs.push(dialog);return dialog;
  }},window:{addEventListener(name,fn){listeners[name]=fn}},toast(){},
  canUseQuoteType:()=>true,firstAllowedQuoteType:()=> 'HRC',makeNo:type=>'NEW-'+type,today:()=> '2026-10-05',
  currentUserOwner:()=>({owner:'User'}),defaultNotes:type=>type,openQuoteDiscountChoice(){},
 };
 vm.createContext(ctx);
 const start=source.indexOf('const quoteSavedKeysToIgnore=');
 const end=source.indexOf('BN.syncQuoteUrl=syncQuoteUrl;')+'BN.syncQuoteUrl=syncQuoteUrl;'.length;
 vm.runInContext(source.slice(start,end),ctx);
 function loadBlock(startText,endText){const start=source.indexOf(startText),end=source.indexOf(endText,start);assert(start>=0&&end>start);vm.runInContext(source.slice(start,end),ctx);}
 loadBlock('function startBlankQuote(',"$('#newQuote').onclick=");
 return {ctx,dialogs,storage,calls,listeners,loadBlock};
}

test('all leave actions use the exact supplied popup and cancel leaves the draft intact',async()=>{
 const {ctx,dialogs,calls}=setup();
 const leaving=ctx.confirmQuoteLeave();
 assert.equal(dialogs.length,1);
 assert.match(dialogs[0].innerHTML,/Lưu báo giá trước khi tạo mới\?/);
 assert.match(dialogs[0].innerHTML,/Không lưu, tạo mới/);
 assert.match(dialogs[0].innerHTML,/Lưu và tạo mới/);
 dialogs[0].choose('cancel');
 assert.equal(await leaving,false);assert.equal(ctx.state.rows.length,1);assert.equal(calls.save,0);
});

test('discard restores the last saved quote without saving a new record',async()=>{
 const {ctx,dialogs,calls,storage}=setup({type:'HRC',quoteNo:'Q1',rows:[{id:'r1',qty:1}],_record:{id:'old',revision:3}});
 ctx.markQuoteSaved();ctx.state.rows[0].qty=9;
 const leaving=ctx.confirmQuoteLeave();dialogs[0].choose('discard');
 assert.equal(await leaving,true);assert.equal(ctx.state.rows[0].qty,1);assert.equal(ctx.state._record.id,'old');
 assert.equal(calls.save,0);assert.equal(ctx.quoteHasUnsavedChanges(),false);
 assert.equal(JSON.parse(storage.get('bn-draft:u1')).rows[0].qty,1);
});

test('discarding an unsaved draft clears it and does not create a server record',async()=>{
 const {ctx,dialogs,calls}=setup();
 const leaving=ctx.confirmQuoteLeave();dialogs[0].choose('discard');
 assert.equal(await leaving,true);assert.equal(ctx.state.rows.length,0);assert.equal(ctx.state._record,undefined);assert.equal(calls.save,0);
});

test('save waits for success and save failure keeps the quotation open',async()=>{
 const {ctx,dialogs,calls}=setup();let finish;
 ctx.saveToLibrary=()=>{calls.save++;return new Promise(resolve=>finish=resolve)};
 const leaving=ctx.confirmQuoteLeave();dialogs[0].choose('save');await Promise.resolve();
 assert.equal(calls.save,1);assert.equal(ctx.state.rows.length,1);
 finish(false);assert.equal(await leaving,false);assert.equal(ctx.state.rows.length,1);
});

test('repeated clicks open one popup and allow only the first requested action',async()=>{
 const {ctx,dialogs,calls}=setup();const first=ctx.confirmQuoteLeave();
 assert.equal(await ctx.confirmQuoteLeave(),false);assert.equal(dialogs.length,1);
 dialogs[0].choose('discard');assert.equal(await first,true);assert.equal(calls.save,0);
});

test('new quotes remove old quote links while retaining unrelated URL parameters',()=>{
 const {ctx,calls}=setup();ctx.startBlankQuote({type:'B2B'});
 const url=new URL(ctx.location.href);assert.equal(url.searchParams.has('quoteId'),false);assert.equal(url.searchParams.has('dashboardAction'),false);
 assert.equal(url.searchParams.get('keep'),'1');assert.equal(url.hash,'#rows');assert.equal(ctx.state.type,'B2B');assert.equal(calls.save,0);
});

test('saved quote links use the actual record ID and remove obsolete launch actions',()=>{
 const {ctx}=setup();assert.equal(typeof ctx.BN.syncQuoteUrl,'function');ctx.BN.syncQuoteUrl('saved-quote');
 const url=new URL(ctx.location.href);assert.equal(url.searchParams.get('quoteId'),'saved-quote');assert.equal(url.searchParams.has('dashboardAction'),false);
});

test('F5 discard reloads once without a second unload warning or database save',async()=>{
 const env=setup(),{ctx,dialogs,calls,listeners,loadBlock}=env;
 loadBlock('async function reloadQuotePage(', 'let selectedQuoteRow=');
 let prevented=0;listeners.keydown({key:'F5',preventDefault(){prevented++}});
 assert.equal(prevented,1);assert.equal(calls.reload,0);dialogs[0].choose('discard');
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.reload,1);assert.equal(calls.save,0);
 let warned=false;listeners.beforeunload({preventDefault(){warned=true}});assert.equal(warned,false);
});

test('F5 cancellation and failed saving do not reload or lose the draft',async()=>{
 const {ctx,dialogs,calls,listeners,loadBlock}=setup();loadBlock('async function reloadQuotePage(', 'let selectedQuoteRow=');
 listeners.keydown({key:'F5',preventDefault(){}});dialogs[0].choose('cancel');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.reload,0);assert.equal(ctx.state.rows.length,1);
 ctx.saveToLibrary=async()=>false;listeners.keydown({key:'r',ctrlKey:true,preventDefault(){}});dialogs[1].choose('save');
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.reload,0);assert.equal(ctx.state.rows.length,1);
});

test('clean F5 stays native and toolbar refresh retains the browser safeguard',()=>{
 const {ctx,listeners,loadBlock}=setup({rows:[]});loadBlock('async function reloadQuotePage(', 'let selectedQuoteRow=');
 let prevented=false;listeners.keydown({key:'F5',preventDefault(){prevented=true}});assert.equal(prevented,false);
 ctx.state.rows.push({id:'r1'});let warned=false;listeners.beforeunload({preventDefault(){warned=true}});assert.equal(warned,true);
});

test('changing HRC to B2B saves the old quote first and starts an unpersisted copy',async()=>{
 const {ctx,dialogs,calls,loadBlock}=setup({type:'HRC',quoteNo:'BGHRC-001',rows:[{id:'r1',qty:1}],_record:{id:'old',revision:3}});
 ctx.markQuoteSaved();ctx.state.rows[0].qty=2;
 const button={dataset:{type:'B2B'}};ctx.$$=selector=>selector==='.quote-type'?[button]:[];
 ctx.saveToLibrary=async()=>{calls.save++;ctx.markQuoteSaved();return true};
 loadBlock('const canKeepRowsOnTypeChange=',"$('#openSearch').onclick=");
 const action=button.onclick();assert.equal(dialogs.length,1);dialogs[0].choose('save');await action;
 assert.equal(calls.save,1);assert.equal(ctx.state.type,'B2B');assert.equal(ctx.state.rows[0].qty,2);
 assert.equal(ctx.state._record,undefined);assert.equal(new URL(ctx.location.href).searchParams.has('quoteId'),false);
});

test('discarding before type change drops unsaved rows and opens the selected template',async()=>{
 const {ctx,dialogs,calls,loadBlock}=setup();const button={dataset:{type:'VIGIFTS'}};ctx.$$=()=>[button];let opened;
 ctx.openQuoteDiscountChoice=type=>{opened=type};loadBlock('const canKeepRowsOnTypeChange=',"$('#openSearch').onclick=");
 const action=button.onclick();dialogs[0].choose('discard');await action;
 assert.equal(ctx.state.rows.length,0);assert.equal(opened,'VIGIFTS');assert.equal(calls.save,0);
});

test('a mobile new quote uses the same URL and draft reset as desktop',async()=>{
 const {ctx,dialogs,calls,loadBlock}=setup();loadBlock('async function createNewQuoteWithType(',"$('#mobileTemplateNav')");
 const action=ctx.createNewQuoteWithType('B2B');dialogs[0].choose('discard');await action;
 assert.equal(ctx.state.type,'B2B');assert.equal(ctx.state.rows.length,0);assert.equal(calls.save,0);
 assert.equal(new URL(ctx.location.href).searchParams.has('quoteId'),false);
});
