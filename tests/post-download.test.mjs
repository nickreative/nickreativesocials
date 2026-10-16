import test from 'node:test';
import assert from 'node:assert/strict';
import {downloadStem,mediaFilename,postZip,MAX_BUNDLE_BYTES} from '../assets/js/post-download-model.js';

test('platform and carousel order have distinct safe names, preserving original formats',()=>{
  const stem=downloadStem('Liven Communities',3,'facebook');
  assert.equal(stem,'liven-communities-post-003-facebook');
  assert.equal(mediaFilename(stem,1,'https://store/photo.JPG?token=123'),'liven-communities-post-003-facebook-02.jpg');
  assert.equal(mediaFilename(stem,9,'blob:local','video/quicktime'),'liven-communities-post-003-facebook-10.mov');
  assert.equal(mediaFilename(stem,0,'https://store/not-media.html','image/png'),'liven-communities-post-003-facebook-01.png');
});
test('ZIP contains original binary bytes, ordered filenames and UTF-8 caption',async()=>{
  const files=[new File([new Uint8Array([0,255,10,20])],'01.mp4',{type:'video/mp4'}),new File(['123456789'],'02.jpg'),new File(['Café — ready 🐾\nSecond line'],'caption.txt')];
  const blob=await postZip(files), bytes=new Uint8Array(await blob.arrayBuffer()), view=new DataView(bytes.buffer);
  let offset=0;
  for(const file of files){
    assert.equal(view.getUint32(offset,true),0x04034b50);
    const length=view.getUint16(offset+26,true), start=offset+30+length;
    assert.equal(new TextDecoder().decode(bytes.slice(offset+30,start)),file.name);
    assert.deepEqual(bytes.slice(start,start+file.size),new Uint8Array(await file.arrayBuffer()));
    if(file.name==='02.jpg')assert.equal(view.getUint32(offset+14,true),0xcbf43926); // canonical CRC32 vector
    offset=start+file.size;
  }
  assert.equal(view.getUint32(offset,true),0x02014b50);
  assert.equal(view.getUint32(bytes.length-22,true),0x06054b50);
  assert.equal(view.getUint16(bytes.length-12,true),3);
});
test('bundle guard and cancellation fail before producing a partial ZIP',async()=>{
  await assert.rejects(()=>postZip([{size:MAX_BUNDLE_BYTES+1}]),/too large/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(()=>postZip([new File(['a'],'a.txt')],controller.signal),{name:'AbortError'});
});
