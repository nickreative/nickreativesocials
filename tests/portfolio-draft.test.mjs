import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PortfolioDraft} from '../assets/js/portfolio-draft.js';
const rows=()=>Array.from({length:4},(_,i)=>({id:String(i),title:'',alt_text:`Original ${i}`,published:true,category_id:'hotels',updated_at:'v1',sort_order:i}));
test('four alt-text edits survive selection, filtering, refresh and one acknowledged save',()=>{
 const model=new PortfolioDraft();model.merge(rows());
 for(let i=0;i<4;i++)model.edit(String(i),{alt_text:`New description ${i}`});
 model.merge(rows());
 model.accept({...model.row('0'),updated_at:'v2'});
 assert.equal(model.edits.size,3);
 for(let i=1;i<4;i++)assert.equal(model.row(String(i)).alt_text,`New description ${i}`);
 assert.equal(model.base.get('1').updated_at,'v1');
 for(let i=1;i<4;i++)model.accept({...model.row(String(i)),updated_at:'v2'});
 assert.equal(model.dirty,false);
});
test('reordering and uploads keep edits and unsaved arrangement until acknowledged',()=>{
 const model=new PortfolioDraft();model.merge(rows());model.edit('1',{alt_text:'Keep this text'});model.move('3','0');
 model.merge([...rows(),{...rows()[0],id:'upload',sort_order:4}]);
 assert.deepEqual(model.order,['3','0','1','2','upload']);assert.equal(model.row('1').alt_text,'Keep this text');assert.equal(model.orderDirty,true);
 model.accept({...model.row('1'),updated_at:'v2'});
 model.acceptOrder(model.rows.map((row,i)=>({...row,sort_order:i,updated_at:'v3'})));
 assert.equal(model.dirty,false);
});
test('failed saves retain draft values and original version for conflict detection',()=>{
 const model=new PortfolioDraft();model.merge(rows());model.edit('0',{alt_text:'Unsaved work',category_id:'food'});
 model.merge(rows().map(row=>({...row,alt_text:'Changed elsewhere',updated_at:'v2'})));
 assert.equal(model.row('0').alt_text,'Unsaved work');assert.equal(model.row('0').category_id,'food');assert.equal(model.base.get('0').updated_at,'v1');assert.equal(model.edits.size,1);
});
test('returning a field to its saved value clears only that field',()=>{
 const model=new PortfolioDraft();model.merge(rows());model.edit('0',{title:'Draft title',alt_text:'Draft alt'});model.edit('0',{title:''});
 assert.deepEqual(model.edits.get('0'),{alt_text:'Draft alt'});model.edit('0',{alt_text:'Original 0'});assert.equal(model.dirty,false);
});
