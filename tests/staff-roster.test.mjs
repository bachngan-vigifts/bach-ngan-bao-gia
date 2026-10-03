import test from 'node:test';
import assert from 'node:assert/strict';
import { initialPositions, initialStaff } from '../lib/initial-staff.mjs';
import { canViewQuotation } from '../lib/quotation-access.mjs';

test('approved staff roster has unique identities and valid positions', () => {
  assert.equal(initialStaff.length, 10);
  assert.equal(new Set(initialStaff.map(s=>s.id)).size, 10);
  assert.equal(new Set(initialStaff.map(s=>s.email)).size, 10);
  for (const staff of initialStaff) assert.ok(initialPositions.some(p=>p.id === staff.positionId));
  assert.deepEqual(initialStaff.filter(s=>s.role === 'manager').map(s=>s.id), ['NV001','NV002','NV10']);
});

test('all 100 employee visibility combinations match the supplied roster', () => {
  const expected = {
    NV001: initialStaff.map(s=>s.id), NV002: initialStaff.map(s=>s.id), NV10: initialStaff.map(s=>s.id),
    NV003: ['NV003','NV004','NV006'], NV004: ['NV003','NV004','NV006'], NV006: ['NV003','NV004','NV006'],
    NV005: ['NV005','NV007'], NV007: ['NV005','NV007'], NV008: ['NV008'], NV009: ['NV009'],
  };
  for (const viewer of initialStaff) for (const creator of initialStaff) {
    assert.equal(canViewQuotation({...viewer, active:true}, creator), expected[viewer.id].includes(creator.id), `${viewer.id} viewing ${creator.id}`);
  }
});
