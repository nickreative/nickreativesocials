import assert from 'node:assert/strict';
import fs from 'node:fs';
const dataURL=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const model=dataURL(fs.readFileSync(new URL('../assets/js/calendar-model.js',import.meta.url),'utf8'));
const seasons=fs.readFileSync(new URL('../assets/js/calendar-seasons.js',import.meta.url),'utf8').replace("'./calendar-model.js'",JSON.stringify(model));
const {seasonalDates,defaultDateHeading,dateHeading}=await import(dataURL(seasons));
for(const [year,date] of [[2026,'04-05'],[2027,'03-28'],[2028,'04-16'],[2029,'04-01']]){assert.equal(defaultDateHeading(`${year}-${date}`),'Easter Sunday');}
assert.equal(defaultDateHeading('2026-05-10'),"Mother's Day");assert.equal(defaultDateHeading('2026-09-06'),"Father's Day");assert.equal(defaultDateHeading('2027-05-09'),"Mother's Day");assert.equal(defaultDateHeading('2027-09-05'),"Father's Day");
assert.equal(defaultDateHeading('2026-12-25'),'Christmas Day');assert.equal(defaultDateHeading('2027-06-30'),'End of financial year');
assert.equal(dateHeading('2026-12-25',[{heading_date:'2026-12-25',heading:''}]),'');assert.equal(dateHeading('2026-12-25',[{heading_date:'2026-12-25',heading:'Christmas office closure'}]),'Christmas office closure');
assert.equal(seasonalDates(2026).size,17);
console.log('PASS: verified Easter dates 2026–2029, Australian family days, seasonal dates and custom/hidden headings.');
