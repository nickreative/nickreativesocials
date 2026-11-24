import {supabase,check} from './portfolio-data.js';
export const DEFAULT_HEADER={heading:'Artistic Director. Photographer. Editor.',subheading:'Photography by Nicholas Goodridge.\nBrisbane & wherever the story takes me.'};
export async function readHeader(){
  return check(await supabase.from('portfolio_settings').select('id,heading,subheading,updated_at').eq('id','homepage').single());
}
export async function writeHeader(values,version){
  const result=await supabase.from('portfolio_settings').update(values).eq('id','homepage').eq('updated_at',version).select('id,heading,subheading,updated_at').single();
  if(result.error?.code==='PGRST116')throw new Error('The header changed in another session. Your draft is kept; copy it before refreshing.');
  return check(result);
}
export function headerValues(heading,subheading){
  const values={heading:heading.trim(),subheading:subheading.replace(/\r\n?/g,'\n').trim()};
  if(!values.heading||values.heading.length>200)throw new Error('Enter a heading of 1–200 characters.');
  if(values.subheading.length>500)throw new Error('Keep the subheading within 500 characters.');
  return values;
}
