import { buildApp } from './apps/api/src/index.ts';
const app = await buildApp();
await app.listen({ port: 3001, host: '127.0.0.1' });
try {
  const origin='http://localhost:3000';
  for (const payload of [
    { label:'plain', url:'http://127.0.0.1:3001/trpc/bonds.requestRetailerBond', body:{companyId:'00000000-0000-0000-0000-000000000000'} },
    { label:'jsonwrap', url:'http://127.0.0.1:3001/trpc/bonds.requestRetailerBond', body:{json:{companyId:'00000000-0000-0000-0000-000000000000'}} },
    { label:'batchwrap', url:'http://127.0.0.1:3001/trpc/bonds.requestRetailerBond?batch=1', body:{0:{json:{companyId:'00000000-0000-0000-0000-000000000000'}}} },
  ]) {
    const r=await fetch(payload.url,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(payload.body)});
    console.log('---'+payload.label+'---');
    console.log(r.status);
    console.log(await r.text());
  }
} finally {
  await app.close();
}
