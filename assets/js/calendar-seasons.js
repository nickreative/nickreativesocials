import {localDate} from './calendar-model.js';
// Gregorian Easter calculation; messaging dates use the actual occasion, not substitute holidays.
export function easterSunday(year){
 const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
 const month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;
 return new Date(year,month-1,day,12);
}
function nthSunday(year,month,n){const first=new Date(year,month,1,12);return new Date(year,month,1+(7-first.getDay())%7+(n-1)*7,12);}
export function seasonalDates(year){
 const dates=new Map();
 const add=(date,label)=>{const key=localDate(date);dates.set(key,[...(dates.get(key)||[]),label]);};
 const fixed=[[1,1,"New Year's Day"],[1,26,'Australia Day'],[3,1,'Autumn begins'],[4,25,'ANZAC Day'],[6,1,'Winter begins'],[6,30,'End of financial year'],[9,1,'Spring begins'],[12,1,'Summer begins'],[12,24,'Christmas Eve'],[12,25,'Christmas Day'],[12,26,'Boxing Day'],[12,31,"New Year's Eve"]];
 fixed.forEach(([month,day,label])=>add(new Date(year,month-1,day,12),label));
 const easter=easterSunday(year);add(new Date(year,easter.getMonth(),easter.getDate()-2,12),'Good Friday');add(easter,'Easter Sunday');add(new Date(year,easter.getMonth(),easter.getDate()+1,12),'Easter Monday');
 add(nthSunday(year,4,2),"Mother's Day");add(nthSunday(year,8,1),"Father's Day");
 return dates;
}
export function defaultDateHeading(date){const d=new Date(`${date}T12:00:00`);return (seasonalDates(d.getFullYear()).get(date)||[]).join(' · ');}
export function dateHeading(date,overrides){return overrides.find(row=>row.heading_date===date)?.heading ?? defaultDateHeading(date);}
