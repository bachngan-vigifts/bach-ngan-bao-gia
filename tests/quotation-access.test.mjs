import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { canViewQuotation, canEditQuotation, quotationScope, quoteShareKeys } from '../lib/quotation-access.mjs';

test('visibility is shared only by assigned position, managers see all, inactive users see none', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE staff_members (id TEXT, position_id TEXT); CREATE TABLE staff_quotations (id TEXT, creator_id TEXT)');
  for (const [id, position] of [['a','sales'], ['b','sales'], ['c','admin'], ['d',null]]) {
    db.prepare('INSERT INTO staff_members VALUES (?, ?)').run(id, position);
    db.prepare('INSERT INTO staff_quotations VALUES (?, ?)').run(id, id);
  }
  const cases = [
    [{ id:'a', positionId:'sales', role:'employee', active:true }, ['a','b']],
    [{ id:'c', positionId:'admin', role:'employee', active:true }, ['c']],
    [{ id:'d', positionId:null, role:'employee', active:true }, ['d']],
    [{ id:'x', positionId:null, role:'employee', active:true }, []],
    [{ id:'x', role:'manager', active:true }, ['a','b','c','d']],
    [{ id:'a', positionId:'sales', role:'manager', active:false }, []],
  ];
  for (const [viewer, expected] of cases) {
    const scope = quotationScope(viewer);
    const rows = db.prepare(`SELECT q.id FROM staff_quotations q JOIN staff_members m ON m.id=q.creator_id WHERE ${scope.sql} ORDER BY q.id`).all(...scope.bindings);
    assert.deepEqual(rows.map(r=>r.id), expected);
    for (const creator of db.prepare('SELECT id, position_id AS positionId FROM staff_members').all()) {
      assert.equal(canViewQuotation(viewer, creator), expected.includes(creator.id));
    }
  }
  db.close();
});

test('shared visibility does not grant permission to overwrite another employee quotation', () => {
  const viewer = {id:'a', positionId:'sales', role:'employee', active:true};
  assert.equal(canEditQuotation(viewer, {id:'a'}), true);
  assert.equal(canEditQuotation(viewer, {id:'b', positionId:'sales'}), false);
  assert.equal(canEditQuotation({...viewer, active:false}, {id:'a'}), false);
});

test('quote share overrides expose selected quote numbers to a position', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE staff_members (id TEXT, position_id TEXT); CREATE TABLE staff_quotations (id TEXT, quote_no TEXT, creator_id TEXT)');
  db.prepare('INSERT INTO staff_members VALUES (?, ?)').run('manager','manager');
  db.prepare('INSERT INTO staff_members VALUES (?, ?)').run('saleadmin','sale-admin');
  db.prepare('INSERT INTO staff_quotations VALUES (?, ?, ?)').run('quote-a','BGVIGIFTS-20260916-0326','manager');
  db.prepare('INSERT INTO staff_quotations VALUES (?, ?, ?)').run('quote-b','BGVIGIFTS-20260916-9999','manager');
  const viewer = {id:'saleadmin', positionId:'sale-admin', role:'employee', active:true};
  const scope = quotationScope(viewer, quoteShareKeys('BGVIGIFTS-20260916-0326:sale-admin', viewer));
  const rows = db.prepare(`SELECT q.id FROM staff_quotations q JOIN staff_members m ON m.id=q.creator_id WHERE ${scope.sql} ORDER BY q.id`).all(...scope.bindings);
  assert.deepEqual(rows.map(row => row.id), ['quote-a']);
  db.close();
});
