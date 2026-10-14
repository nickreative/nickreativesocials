export function renderReceipt(item: {slot:number;client:string;platform:string;post_id:string;caption:string;feedback:string;reviewer_name:string;submitted_at:string;thumbnail_url?:string;media_urls?:string[]}) {
 const escape=(value:string)=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
 const labels:Record<string,string>={livencommunities:'Liven Communities',suitecollection:'Suite Collection',pocky:'Pocky',vicalates:'Vicalates',belmo:'Belmo Group',belmogroup:'Belmo Group'};
 const client=labels[item.client]||item.client;
 const number=String(item.slot).padStart(3,'0');
 const time=new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Brisbane',day:'numeric',month:'long',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(item.submitted_at));
 const link=`https://nickreativesocials.vercel.app/client/portal/?post=${encodeURIComponent(item.post_id)}`;
 const intro=`Your feedback has been received. Thank you, ${item.reviewer_name}, for sharing your feedback on Post ${number} for ${client}. Your submission was saved in the content portal on ${time} (Brisbane time, AEST), and the post and your submitted feedback are included below for your records.`;
 const closing='If you would like to discuss your feedback further, you can reply to this email to reach Nick directly.';
 const media=(item.media_urls||[]).filter(url=>{try{const parsed=new URL(url);return parsed.protocol==='https:'&&parsed.hostname==='tgvtmwdmwnzwqjzqxbkj.supabase.co';}catch{return false;}});
 const mediaText=media.length?`\n\nThe media included with this post can be viewed using these links:\n${media.join('\n')}`:'';
 const mediaHtml=media.length?`<p>The media included with this post can be viewed using ${media.map((url,index)=>`<a style="color:#703a45" href="${escape(url)}">media link ${index+1}</a>`).join(', ')}.</p>`:'';
 const subject=`Receipt for feedback on Post ${number}`;
 const text=`${intro}\n\nPost ${number} (${item.platform||'Instagram'})\n${item.caption||'No caption was supplied for this post.'}${mediaText}\n\nSubmitted feedback\n${item.feedback}\n\n${closing}\n\nView the post in the content portal: ${link}`;
 const html=`<div style="font-family:Helvetica,Arial,sans-serif;color:#542832;background:#f8f3ec;line-height:1.65;padding:28px;max-width:640px;margin:auto"><h1 style="font-family:Georgia,serif;font-weight:400;color:#703a45">Nickreative</h1><h2 style="font-size:21px;font-weight:400">Your feedback has been received</h2><p>${escape(intro)}</p><h3 style="font-size:15px;margin-top:28px">Post ${number} · ${escape(item.platform||'Instagram')}</h3><div style="border-left:3px solid #703a45;padding:12px 18px;background:#eee1d4">${escape(item.caption||'No caption was supplied for this post.').replaceAll('\n','<br>')}</div>${mediaHtml}<h3 style="font-size:15px;margin-top:28px">Submitted feedback</h3><div style="border-left:3px solid #703a45;padding:12px 18px;background:#eee1d4">${escape(item.feedback).replaceAll('\n','<br>')}</div><p style="margin-top:28px">${closing}</p><p><a style="color:#703a45" href="${link}">View the post in the content portal</a></p></div>`;
 return {subject,text,html};
}
