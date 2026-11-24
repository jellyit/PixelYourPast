import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Worker} from 'node:worker_threads';
import {mkdtempSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {schedule,freeScanners,INSERT_RESERVATION,insertArgs,addDays,londonToday} from '../lib/booking.mjs';
import {handleCalendar} from '../lib/calendar-api.mjs';
const schema=()=>readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort().map(f=>readFileSync('drizzle/'+f,'utf8')).join('\n');
function database(filename=':memory:'){const db=new DatabaseSync(filename);db.exec(schema());return db;}
function adapter(db){
 return {prepare(sql){
  return {bind(...args){
   return {
    async first(){return db.prepare(sql).get(...args)||null},
    async all(){return {results:db.prepare(sql).all(...args)}},
    async run(){return db.prepare(sql).run(...args)}
   };
  }};
 }};
}
const holidays=new Set(['2026-12-25','2026-12-28','2027-01-01']);
test('weekend return, inbound postage and a FULL cleaning day are reserved',()=>{
 const w=schedule('2026-11-03',4,'delivery',holidays,'2026-10-15');
 assert.equal(w.start,'2026-11-02');assert.equal(w.returnDate,'2026-11-09');assert.equal(w.received,'2026-11-10');assert.equal(w.cleaning,'2026-11-11');assert.equal(w.availableAgain,'2026-11-12');
 assert.deepEqual(freeScanners({start:'2026-11-11',end:'2026-11-20'},[{scanner:1,start:w.start,end:w.end}]),[2]);
 assert.deepEqual(freeScanners({start:'2026-11-12',end:'2026-11-20'},[{scanner:1,start:w.start,end:w.end}]),[1,2]);
});
test('bank holidays and weekends do not count as postage days',()=>{
 const w=schedule('2026-12-29',4,'delivery',holidays,'2026-10-15');assert.equal(w.start,'2026-12-24');assert.equal(w.returnDate,'2027-01-04');assert.equal(w.received,'2027-01-05');
 assert.throws(()=>schedule('2026-12-28',4,'delivery',holidays,'2026-10-15'));
});
test('collection permits weekends and blocks return day plus next full day',()=>{
 const w=schedule('2026-11-07',7,'collection',holidays,'2026-10-15');assert.equal(w.start,'2026-11-07');assert.equal(w.returnDate,'2026-11-14');assert.equal(w.end,'2026-11-15');assert.equal(w.availableAgain,'2026-11-16');assert.equal(w.price,95);
});
test('validation rejects impossible dates, unsupported prices and insufficient delivery notice',()=>{
 assert.throws(()=>schedule('2026-02-30',4,'collection',holidays,'2026-01-01'));
 assert.throws(()=>schedule('2026-11-01',5,'collection',holidays,'2026-10-15'));
 assert.throws(()=>schedule('2026-10-16',4,'delivery',holidays,'2026-10-15'));
 assert.equal(schedule('2026-11-01',30,'collection',holidays,'2026-10-15').price,225);
});
test('the SAME scanner must be free for the complete rental, not just each individual day',()=>{
 assert.deepEqual(freeScanners({start:'2026-11-01',end:'2026-11-10'},[{scanner:1,start:'2026-11-01',end:'2026-11-04'},{scanner:2,start:'2026-11-07',end:'2026-11-10'}]),[]);
});
test('12 simultaneous requests from independent database connections allocate exactly two scanners',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'pyp-concurrency-')),file=path.join(dir,'calendar.sqlite');const db=database(file);db.exec('PRAGMA journal_mode=WAL');db.close();
 const window=schedule('2026-11-01',4,'collection',holidays,'2026-10-15');
 try{const results=await Promise.all(Array.from({length:12},(_,i)=>new Promise((resolve,reject)=>{
 const code=`const {parentPort,workerData}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(workerData.file);db.exec('PRAGMA busy_timeout=10000');parentPort.postMessage(db.prepare(workerData.sql).get(...workerData.args)||null);db.close();`;
 const worker=new Worker(code,{eval:true,workerData:{file,sql:INSERT_RESERVATION,args:insertArgs('id'+i,window,'hold','user'+i,'',0,1000)}});worker.on('message',resolve);worker.on('error',reject);
 })));assert.equal(results.filter(Boolean).length,2);assert.deepEqual(results.filter(Boolean).map(r=>r.scanner).sort(),[1,2]);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('expired holds and cancelled reservations release stock; active servicing blocks it',()=>{
 const db=database(),w=schedule('2026-11-01',4,'collection',holidays,'2026-10-15');
 assert.ok(db.prepare(INSERT_RESERVATION).get(...insertArgs('a',w,'hold','a','',1,1000)));
 assert.equal(db.prepare(INSERT_RESERVATION).get(...insertArgs('b',w,'hold','b','',1,1100)),undefined);
 assert.ok(db.prepare(INSERT_RESERVATION).get(...insertArgs('b',w,'hold','b','',1,1900)));
 db.exec("UPDATE reservations SET status='cancelled' WHERE id='b'");
 assert.ok(db.prepare(INSERT_RESERVATION).get(...insertArgs('c',w,'blocked','admin','Service',1,2000)));
 assert.equal(db.prepare(INSERT_RESERVATION).get(...insertArgs('d',w,'booked','admin','Booking',1,99999)),undefined);db.close();
});
test('API protects admin, validates server price, restores holds and rejects cross-origin requests',async()=>{
 const db=database(),env={DB:adapter(db),ADMIN_EMAIL:'owner@example.test'},owner={userId:'owner',email:'owner@example.test'},visitor={userId:'visitor',email:'visitor@example.test'};
 const request=(route,method='GET',body,origin='https://example.test')=>new Request('https://example.test/api/calendar'+route,{method,headers:{Origin:origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await handleCalendar(request('/admin?month=2026-11'),env,visitor)).status,403);
 assert.equal((await handleCalendar(request('/hold','POST',{},'https://other.test'),env,owner)).status,403);
 assert.equal((await handleCalendar(request('/hold'),env,null)).status,401);
 const start=addDays(londonToday(),10),body={id:'customer-idempotency-00001',start,days:30,method:'collection',price:1};
 const first=await handleCalendar(request('/hold','POST',body),env,visitor);assert.equal(first.status,201);const saved=await first.json();assert.equal(saved.reservation.price,225);
 const repeated=await handleCalendar(request('/hold','POST',body),env,visitor);assert.equal(repeated.status,200);assert.equal((await repeated.json()).reservation.id,body.id);
 const restored=await (await handleCalendar(request('/hold'),env,visitor)).json();assert.equal(restored.hold.id,body.id);
 await handleCalendar(request('/hold','DELETE',{id:body.id}),env,owner);assert.ok((await (await handleCalendar(request('/hold'),env,visitor)).json()).hold);
 await handleCalendar(request('/hold','DELETE',{id:body.id}),env,visitor);assert.equal((await (await handleCalendar(request('/hold'),env,visitor)).json()).hold,null);
 db.close();
});
