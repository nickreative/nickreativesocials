import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../assets/js/calendar-model.js',import.meta.url),'utf8');
const {monthCells,localDate,monthRange,canEditIdea}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
for(let year=2024;year<=2027;year++)for(let month=0;month<12;month++){
 const cells=monthCells(year,month);assert.equal(cells.length%7,0);assert.equal(cells[0].getDay(),1);assert.equal(cells.at(-1).getDay(),0);
 const own=cells.filter(d=>d.getMonth()===month);assert.equal(own.length,new Date(year,month+1,0).getDate());assert.equal(new Set(cells.map(localDate)).size,cells.length);
}
assert.deepEqual(monthRange(2026,11),['2026-12-01','2027-01-01']);
assert.equal(canEditIdea({created_by:'a'},{id:'b',app_metadata:{role:'client'},user_metadata:{role:'admin'}}),false);
assert.equal(canEditIdea({created_by:'a'},{id:'a',app_metadata:{role:'client'}}),true);
assert.equal(canEditIdea({created_by:'a'},{id:'b',app_metadata:{role:'admin'}}),true);
console.log('PASS: calendar weeks, leap years, year rollover, dates and edit permissions.');
