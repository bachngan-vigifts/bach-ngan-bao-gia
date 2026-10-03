import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {generateContractNumber,reserveContractNumber} from '../lib/contract-number.mjs';

function testDb(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(`CREATE TABLE contract_counters (id TEXT PRIMARY KEY NOT NULL,type TEXT NOT NULL,year INTEGER NOT NULL,month INTEGER NOT NULL,legal_entity TEXT NOT NULL,last_sequence INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);CREATE UNIQUE INDEX contract_counters_scope_idx ON contract_counters(type,year,month,legal_entity);`);
 sqlite.exec('CREATE TABLE contract_document_numbers (quote_number TEXT,legal_entity TEXT,contract_number TEXT UNIQUE,PRIMARY KEY(quote_number,legal_entity));CREATE TABLE contract_statuses (quote_number TEXT,status TEXT,contract_number TEXT);CREATE TABLE contract_transfers (quote_number TEXT,contract_number TEXT);');
 return {prepare(sql){return {bind(...values){return {first:async()=>sqlite.prepare(sql).get(...values),run:async()=>sqlite.prepare(sql).run(...values)};}};}};
}

test('contract numbers increment independently by month and legal entity',async()=>{
 const db=testDb(),now=new Date('2026-09-07T05:00:00Z');
 const customer={customer_code:'CUZN01718',tax_code:'0309891030'};
 assert.equal(await generateContractNumber(db,{legal_entity:'BÁCH NGÂN',customer},now),'09-01/07092026/HĐKT/BN-CUZN01718');
 assert.equal(await generateContractNumber(db,{legal_entity:'Bách Ngân',customer},now),'09-02/07092026/HĐKT/BN-CUZN01718');
 assert.equal(await generateContractNumber(db,{legal_entity:'VIGIFTS',customer:{tax_code:'0309891030'}},now),'09-01/07092026/HĐKT/VG-0309891030');
 assert.equal(await generateContractNumber(db,{legal_entity:'QTV',customer:{customer_code:'KH 01-A'}},now),'09-01/07092026/HĐKT/QTV-KH01A');
});

 test('file downloads reserve a stable number without CRM and share the monthly counter',async()=>{
 const db=testDb(),p={quote_number:'BG1',legal_entity:'Bách Ngân',customer:{customer_code:'KH1'}};
 const first=await reserveContractNumber(db,p);
 assert.match(first,/^\d{2}-01\/\d{8}\/HĐKT\/BN-KH1$/);
 assert.equal(await reserveContractNumber(db,p),first);
 const second=await reserveContractNumber(db,{...p,quote_number:'BG2'});
 assert.match(second,/^\d{2}-02\//);
 await db.prepare("INSERT INTO contract_statuses VALUES (?,?,?)").bind('BG3','existing','09-99/08092026/HĐKT/BN-KH1').run();
 assert.equal(await reserveContractNumber(db,{...p,quote_number:'BG3'}),'09-99/08092026/HĐKT/BN-KH1');
 });
