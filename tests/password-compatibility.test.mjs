import test from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import {hashPassword,verifyPassword} from '../lib/staff-api.mjs';
test('portable password hashing matches standard PBKDF2 and verifies existing credentials', async()=>{
 const stored=await hashPassword('12345678');
 const [,iterations,salt,hash]=stored.split('$');
 assert.equal(hash,pbkdf2Sync('12345678',salt,Number(iterations),32,'sha256').toString('hex'));
 assert.equal(await verifyPassword('12345678',stored),true);
 assert.equal(await verifyPassword('87654321',stored),false);
 await assert.rejects(hashPassword('1234567'),e=>e.status===400);
});
