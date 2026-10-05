import assert from 'node:assert/strict';
import test from 'node:test';
import {createSapoHealthNotifier,readSapoHealthMonitorState,runSapoHealthMonitor,runSapoHealthMonitorIfDue,sapoHealthMessage} from '../lib/sapo-health-monitor.mjs';

class FakeD1 {
 constructor(){this.rows=new Map();}
 prepare(sql){
  return {
   bind:(...args)=>({
    run:async()=>{
     if(/INSERT INTO sapo_health_monitor_state/i.test(sql))this.rows.set(args[0],{id:args[0],data:args[1],updated_at:args[2]});
     return {success:true};
    },
    first:async()=>{
     if(/SELECT data FROM sapo_health_monitor_state/i.test(sql))return this.rows.get(args[0])||null;
     return null;
    },
   }),
   run:async()=>({success:true}),
  };
 }
}

const ok={ok:true,code:'SAPO_HEALTH_OK',activeSource:'runtime_session',message:'ok'};
const expired={ok:false,code:'SAPO_SESSION_EXPIRED',status:503,activeSource:'runtime_session',message:'expired'};
const permission={ok:false,code:'SAPO_PERMISSION_DENIED',status:403,activeSource:'runtime_session',message:'permission'};

test('sapo health monitor alerts ok to error and recovered transitions',async()=>{
 const DB=new FakeD1(),alerts=[];
 let now=0,health=ok;
 const opts={now:()=>now,healthCheck:async()=>health,notifier:async alert=>{alerts.push(alert);return {ok:true};}};
 await runSapoHealthMonitor({DB},opts);
 health=expired;now=60_000;await runSapoHealthMonitor({DB},opts);
 health=ok;now=120_000;await runSapoHealthMonitor({DB},opts);
 assert.deepEqual(alerts.map(a=>a.event),['error','recovered']);
 assert.match(alerts[0].message,/đăng nhập lại Sapo/);
 assert.match(alerts[1].message,/khôi phục/);
 const state=await readSapoHealthMonitorState(DB);
 assert.equal(state.ok,true);
 assert.equal(state.code,'SAPO_HEALTH_OK');
});

test('sapo health monitor suppresses repeated same error for six hours',async()=>{
 const DB=new FakeD1(),alerts=[];
 let now=0;
 const opts={now:()=>now,healthCheck:async()=>expired,notifier:async alert=>{alerts.push(alert);return {ok:true};}};
 await runSapoHealthMonitor({DB},opts);
 now=5*3600000;await runSapoHealthMonitor({DB},opts);
 now=6*3600000+1;await runSapoHealthMonitor({DB},opts);
 assert.equal(alerts.length,2);
 assert.equal(alerts[0].key,'error:SAPO_SESSION_EXPIRED');
});

test('sapo health monitor alerts silent fallback from runtime to deployment env',async()=>{
 const DB=new FakeD1(),alerts=[];
 let now=0,health=ok;
 const opts={now:()=>now,healthCheck:async()=>health,notifier:async alert=>{alerts.push(alert);return {ok:true};}};
 await runSapoHealthMonitor({DB},opts);
 now=1000;health={ok:true,code:'SAPO_HEALTH_OK',activeSource:'deployment_env',message:'ok'};
 await runSapoHealthMonitor({DB},opts);
 assert.equal(alerts.length,1);
 assert.equal(alerts[0].event,'fallback');
 assert.match(alerts[0].message,/fallback/);
});

test('sapo health monitor does not crash when notifier fails',async()=>{
 const DB=new FakeD1();
 const result=await runSapoHealthMonitor({DB},{now:()=>0,healthCheck:async()=>permission,notifier:async()=>{throw Error('webhook secret https://example.test/secret');}});
 assert.equal(result.alertSent,true);
 assert.equal(result.alertError,'Error');
 const state=await readSapoHealthMonitorState(DB);
 assert.equal(state.lastAlertError,'Error');
 assert.equal(JSON.stringify(state).includes('secret'),false);
});

test('sapo health monitor due check uses fake timer interval',async()=>{
 const DB=new FakeD1();
 let calls=0,now=0;
 const env={DB,SAPO_HEALTH_INTERVAL_MIN:'30'};
 const opts={now:()=>now,healthCheck:async()=>{calls++;return ok;},notifier:async()=>({ok:true})};
 await runSapoHealthMonitorIfDue(env,opts);
 now=29*60000;await runSapoHealthMonitorIfDue(env,opts);
 now=30*60000+1;await runSapoHealthMonitorIfDue(env,opts);
 assert.equal(calls,2);
});

test('sapo alert webhook payload never includes cookie, token or webhook url',async()=>{
 let calledUrl='',payload='';
 const notifier=createSapoHealthNotifier({SAPO_ALERT_WEBHOOK_URL:'https://alerts.example.test/secret-token'},async(url,options)=>{calledUrl=url;payload=options.body;return new Response('{}',{status:200});});
 await notifier({event:'error',title:'T',message:sapoHealthMessage(expired),health:{...expired,cookie:'_admin_session_id=secret'},checkedAt:'2026-10-05T00:00:00.000Z'});
 assert.equal(calledUrl,'https://alerts.example.test/secret-token');
 assert.equal(payload.includes('_admin_session_id'),false);
 assert.equal(payload.includes('secret-token'),false);
 assert.equal(payload.includes('SAPO_SESSION_EXPIRED'),true);
});
