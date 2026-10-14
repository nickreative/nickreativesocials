export const localDate = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function monthCells(year, month) {
  const first = new Date(year, month, 1, 12);
  const offset = (first.getDay()+6)%7;
  const days = new Date(year, month+1, 0, 12).getDate();
  const count = Math.ceil((offset+days)/7)*7;
  return Array.from({length:count}, (_,i) => new Date(year,month,i-offset+1,12));
}
export function monthRange(year,month) { return [localDate(new Date(year,month,1,12)),localDate(new Date(year,month+1,1,12))]; }
export function canEditIdea(idea,user) {return user.app_metadata?.role==='admin' || idea.created_by===user.id;}
