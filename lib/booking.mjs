export const PRICES={4:75,7:95,14:135,30:225};
export const HOLD_SECONDS=15*60;
export const ACTIVE="(status IN ('booked','blocked') OR (status='hold' AND expires > ?))";
export function londonToday(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function addDays(value,days){const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export function isWorkday(value,holidays){const day=new Date(value+'T12:00:00Z').getUTCDay();return day!==0&&day!==6&&!holidays.has(value);}
export function workday(value,direction,holidays){let d=value;do{d=addDays(d,direction);}while(!isWorkday(d,holidays));return d;}
export function schedule(start,days,method,holidays,today=londonToday()){
 if(!validDate(start)||!Object.hasOwn(PRICES,days)||!['delivery','collection'].includes(method))throw new Error('Choose a valid date, rental length and delivery option.');
 if(start<addDays(today,1)||start>addDays(today,365))throw new Error('Choose a date from tomorrow up to one year ahead.');
 let dispatch=start,returnDate=addDays(start,Number(days)),received=returnDate;
 if(method==='delivery'){
  if(!isWorkday(start,holidays))throw new Error('Delivery is available on working days only.');
  dispatch=workday(start,-1,holidays);
  if(dispatch<workday(today,1,holidays))throw new Error('Allow one working day to dispatch and one working day for delivery.');
  while(!isWorkday(returnDate,holidays))returnDate=addDays(returnDate,1);
  received=workday(returnDate,1,holidays);
 }
 const cleaning=addDays(received,1),availableAgain=addDays(cleaning,1);
 return {start:dispatch,end:cleaning,rentalStart:start,returnDate,received,cleaning,availableAgain,days:Number(days),method,price:PRICES[days]};
}
export function overlaps(a,b){return a.start<=b.end&&a.end>=b.start;}
export function freeScanners(window,rows){return [1,2].filter(scanner=>!rows.some(row=>row.scanner===scanner&&overlaps(window,row)));}
// Selection and insertion are a single serialized database write, not a read-then-write.
export const INSERT_RESERVATION=`WITH scanners(scanner) AS (VALUES(1),(2))
 INSERT INTO reservations(id,scanner,start,end,rental_start,return_date,method,days,price,status,expires,owner,reference,created)
 SELECT ?,scanner,?,?,?,?,?,?,?,?,?,?,?,? FROM scanners s
 WHERE (?=0 OR s.scanner=?)
 AND NOT EXISTS(SELECT 1 FROM reservations r WHERE r.scanner=s.scanner AND r.start<=? AND r.end>=? AND ${ACTIVE})
 AND (?!='hold' OR NOT EXISTS(SELECT 1 FROM reservations r WHERE r.owner=? AND r.status='hold' AND r.expires>?))
 ORDER BY scanner LIMIT 1 RETURNING *`;
export function insertArgs(id,w,status,owner,reference,scanner,now){return [id,w.start,w.end,w.rentalStart,w.returnDate,w.method,w.days,w.price,status,status==='hold'?now+HOLD_SECONDS:null,owner,reference,now,scanner,scanner,w.end,w.start,now,status,owner,now];}
