import test from 'node:test';
import assert from 'node:assert/strict';
import {adjacent, moveItem, validateFiles, IMAGE_MS} from '../assets/js/highlights-model.js';
test('playback skips empty highlights, crosses groups and finishes', () => {
 const groups = [{media:[1,2]}, {media:[]}, {media:[3]}];
 assert.deepEqual(adjacent(groups,0,0,1),{group:0,item:1});
 assert.deepEqual(adjacent(groups,0,1,1),{group:2,item:0});
 assert.deepEqual(adjacent(groups,2,0,-1),{group:0,item:1});
 assert.equal(adjacent(groups,0,0,-1),null);
 assert.equal(adjacent(groups,2,0,1),null);
 assert.equal(IMAGE_MS,5000);
});
test('reordering preserves originals, and upload rejection happens before changes', () => {
 const items=['first','second','third'];
 assert.deepEqual(moveItem(items,2,0),['third','first','second']);
 assert.deepEqual(items,['first','second','third']);
 assert.throws(()=>validateFiles([{name:'bad.exe',type:'application/octet-stream',size:10}]));
 assert.throws(()=>validateFiles([{name:'large.mp4',type:'video/mp4',size:51*1024*1024}]));
 assert.throws(()=>validateFiles([{name:'x.jpg',type:'image/jpeg',size:5}],100));
 assert.equal(validateFiles([{name:'movie.mp4',type:'video/mp4',size:500}])[0].kind,'video');
});
