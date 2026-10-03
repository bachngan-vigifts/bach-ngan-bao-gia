import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webNotificationTarget,listWebNotifications} from '../lib/web-push-notifications.mjs';
test('each notification routes to its own record',()=>{
 assert.equal(webNotificationTarget({eventType:'quote_updated',data:{quoteId:'q-1'}}),'/quote?quoteId=q-1');
 assert.equal(webNotificationTarget({eventType:'contract_download',data:{quoteNo:'BG/001'}}),'/quote?quote=BG%2F001');
 assert.equal(webNotificationTarget({eventType:'incoming_stock_created',data:{shipmentId:'s-1'}}),'/quote?dashboardAction=incoming&shipmentId=s-1');
 assert.equal(webNotificationTarget({eventType:'supplier_order_approved',data:{orderId:'o-1'}}),'/quote?supplierOrderId=o-1');
 assert.equal(webNotificationTarget({data:{shiftId:'shift-1'}}),'/work-reports.html?cashShift=shift-1');
 for(const url of ['https://evil.example','//evil.example','/\\evil.example'])assert.equal(webNotificationTarget({url}),'/quote');
});
test('existing download notices resolve the saved quotation id',async()=>{
 const db={prepare(sql){return {bind(){return this},all:async()=>({results:[{id:'n-1',eventType:'contract_download',url:'/quote',dataJson:'{"quoteNo":"BG-1"}'}]}),first:async()=>{assert.ok(sql.includes('quote_no=?'));return {id:'saved-q-1'}}}}};
 const result=await listWebNotifications(db,{id:'m-1',role:'manager'});
 assert.equal(result.notifications[0].url,'/quote?quoteId=saved-q-1');
});
test('push click navigates an existing tab to the notification record instead of leaving it on its current page',async()=>{
 const listeners={},navigated=[];
 const client={url:'https://site.example/quote?dashboardAction=new',focus:async()=>{},navigate:async url=>navigated.push(url)};
 const context={URL,self:{location:{origin:'https://site.example'},addEventListener:(name,fn)=>listeners[name]=fn},clients:{matchAll:async()=>[client]},fetch:async()=>({ok:true,json:async()=>({notifications:[{id:'n-1',url:'/quote?quoteId=q-1'}]})})};
 vm.createContext(context);vm.runInContext(readFileSync('public/push-sw.js','utf8'),context);
 let completion;listeners.notificationclick({notification:{close(){},data:{id:'n-1',url:'/quote'}},waitUntil(promise){completion=promise}});await completion;
 assert.deepEqual(navigated,['https://site.example/quote?quoteId=q-1']);
});
