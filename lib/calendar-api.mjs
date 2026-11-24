import {ACTIVE,PRICES,HOLD_SECONDS,validDate,addDays,schedule,freeScanners,londonToday,INSERT_RESERVATION,insertArgs} from './booking.mjs';
import holidayData from '../content/bank-holidays.json' with {type:'json'};
const holidays=new Set(holidayData['england-and-wales'].events.map(x=>x.date));
const holidayEnd=holidayData['england-and-wales'].events.map(x=>x.date).sort().at(-1);
const respond=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const clean=row=>row?{id:row.id,scanner:row.scanner,start:row.start,end:row.end,rentalStart:row.rental_start,returnDate:row.return_date,method:row.method,days:row.days,price:row.price,status:row.status,expires:row.expires,reference:row.reference}:null;
export async function handleCalendar(request,env,user){
 const url=new URL(request.url),route=url.pathname.replace('/api/calendar','')||'/';
 const now=Math.floor(Date.now()/1000),today=londonToday();
 const admin=!!user&&!!env.ADMIN_EMAIL&&user.email.toLowerCase()===env.ADMIN_EMAIL.toLowerCase();
 if(!env.DB)return respond({error:'The calendar is not connected yet. Please try again later.'},503);
 const db=env.DB.withSession?env.DB.withSession('first-primary'):env.DB;
 try{
  if(request.method==='GET'&&route==='/context')return respond({signedIn:!!user,admin,today,prices:PRICES,holdSeconds:HOLD_SECONDS,holidayRegion:'England and Wales',paymentsEnabled:false});
  if(request.method==='GET'&&route==='/availability'){
   const month=url.searchParams.get('month'),days=Number(url.searchParams.get('days')),method=url.searchParams.get('method');
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||'')||!Object.hasOwn(PRICES,days)||!['delivery','collection'].includes(method))return respond({error:'Invalid calendar options.'},400);
   const first=month+'-01';if(first<today.slice(0,7)+'-01'||first>addDays(today,365).slice(0,7)+'-01')return respond({error:'Choose a month within the next year.'},400);
   const last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10);
   const {results:rows}=await db.prepare(`SELECT scanner,start,end FROM reservations WHERE ${ACTIVE} AND start<=? AND end>=?`).bind(now,addDays(last,45),addDays(first,-10)).all();
   const dates=[];for(let day=first;day<=last;day=addDays(day,1)){
    try{const window=schedule(day,days,method,holidays,today);if(method==='delivery'&&window.end>holidayEnd)throw new Error('Postage dates are not available this far ahead yet.');const free=freeScanners(window,rows);dates.push({date:day,available:free.length,window,reason:free.length?'':'Both scanners are already reserved.'});}
    catch(error){dates.push({date:day,available:0,reason:error.message});}
   }
   return respond({dates,month,days,method,checkedAt:now});
  }
  if(!user)return respond({error:'Please sign in to hold a scanner.',signIn:'/signin-with-chatgpt?return_to=/'},401);
  if(request.method==='GET'&&route==='/hold'){
   const row=await db.prepare("SELECT * FROM reservations WHERE owner=? AND status='hold' AND expires>? ORDER BY created DESC LIMIT 1").bind(user.userId,now).first();return respond({hold:clean(row),serverTime:now});
  }
  if(request.method==='GET'&&route==='/admin'){
   if(!admin)return respond({error:'Owner access is required.'},403);
   const month=url.searchParams.get('month');if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))return respond({error:'Choose a valid month.'},400);
   const first=month+'-01',last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10);
   const {results}=await db.prepare(`SELECT * FROM reservations WHERE ${ACTIVE} AND start<=? AND end>=? ORDER BY rental_start,scanner`).bind(now,last,first).all();return respond({reservations:results.map(clean),month});
  }
  if(!['POST','DELETE'].includes(request.method))return respond({error:'Not found.'},404);
  if(request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return respond({error:'Please use the booking form on this website.'},403);
  if(!request.headers.get('Content-Type')?.includes('application/json'))return respond({error:'JSON is required.'},415);
  const raw=await request.text();if(raw.length>4096)return respond({error:'Request is too large.'},413);
  let body;try{body=JSON.parse(raw)}catch{return respond({error:'Invalid request.'},400)}
  if(!body||typeof body!=='object'||Array.isArray(body))return respond({error:'Invalid request.'},400);
  if(request.method==='DELETE'&&route==='/hold'){
   if(typeof body.id!=='string')return respond({error:'Choose a hold to release.'},400);
   await db.prepare("UPDATE reservations SET status='cancelled' WHERE id=? AND owner=? AND status='hold'").bind(body.id,user.userId).run();return respond({released:true});
  }
  if(request.method==='DELETE'&&route==='/admin'){
   if(!admin)return respond({error:'Owner access is required.'},403);
   if(typeof body.id!=='string')return respond({error:'Choose a reservation.'},400);
   await db.prepare("UPDATE reservations SET status='cancelled' WHERE id=?").bind(body.id).run();return respond({cancelled:true});
  }
  if(request.method==='POST'&&(route==='/hold'||route==='/admin')){
   if(route==='/admin'&&!admin)return respond({error:'Owner access is required.'},403);
   if(typeof body.id!=='string'||!/^[-a-zA-Z0-9]{20,80}$/.test(body.id))return respond({error:'Invalid reservation reference. Please reload.'},400);
   const prior=await db.prepare('SELECT * FROM reservations WHERE id=?').bind(body.id).first();
   if(prior){if(prior.owner!==user.userId)return respond({error:'Reference unavailable.'},409);if(prior.status==='cancelled'||(prior.status==='hold'&&prior.expires<=now))return respond({error:'That hold has ended. Please choose your dates again.'},409);return respond({reservation:clean(prior),serverTime:now});}
   let window,status='hold',scanner=0,reference='';
   if(route==='/admin'){
    if(!['booked','blocked'].includes(body.kind))return respond({error:'Choose a booking or servicing block.'},400);
    scanner=Number(body.scanner);if(![0,1,2].includes(scanner))return respond({error:'Choose scanner 1, 2 or first available.'},400);
    reference=typeof body.reference==='string'?body.reference.trim().slice(0,120):'';if(!reference)return respond({error:'Add a booking reference or reason.'},400);
    status=body.kind==='blocked'?'blocked':'booked';
   }
   if(status==='blocked'){
    if(![1,2].includes(scanner)||!validDate(body.start)||!validDate(body.end)||body.start<today||body.end<body.start||body.end>addDays(today,400))return respond({error:'Select one scanner and a valid date range from today.'},400);
    window={start:body.start,end:body.end,rentalStart:body.start,returnDate:body.end,method:'service',days:0,price:0};
   }else{
    try{window=schedule(body.start,Number(body.days),body.method,holidays,today);if(body.method==='delivery'&&window.end>holidayEnd)throw new Error('Postage dates are not available this far ahead yet.');}catch(error){return respond({error:error.message},400)}
   }
   const row=await db.prepare(INSERT_RESERVATION).bind(...insertArgs(body.id,window,status,user.userId,reference,scanner,now)).first();
   if(!row)return respond({error:'No scanner is available for the full period, or you already have an active hold. Refresh the calendar or release your hold.'},409);
   return respond({reservation:clean(row),window,serverTime:now},201);
  }
  return respond({error:'Not found.'},404);
 }catch(error){console.error('Calendar request failed',route,error instanceof Error?error.message:'Unknown error');return respond({error:'We could not update the calendar. Please try again. No booking is confirmed.'},503);}
}
