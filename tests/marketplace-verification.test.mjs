import test from 'node:test';
import assert from 'node:assert/strict';
import { dojahOutcome, fetchDojahVerification } from '../api/_marketplaceVerification.js';
import handler, {canPublishPublicly} from '../api/marketplace.js';
const reference='MP-KYC-test-reference';
const valid={reference_id:reference,verification_status:'Completed',status:true,id_type:'NIN',data:{government_data:{status:true},selfie:{status:true}}};
test('public discovery hides expired, unverified and disabled seller plans',()=>{
  const seller={verification_status:'verified',public_selling_enabled:true,public_plan_expires_at:'2026-10-01T00:00:00Z'};
  assert.equal(canPublishPublicly(seller,Date.parse('2026-09-14')),true);
  assert.equal(canPublishPublicly(seller,Date.parse('2026-10-01')),false);
  assert.equal(canPublishPublicly({...seller,verification_status:'pending'},Date.parse('2026-09-14')),false);
  assert.equal(canPublishPublicly({...seller,public_selling_enabled:false},Date.parse('2026-09-14')),false);
});
test('server verification requires the stored reference and successful required checks',()=>{
  assert.equal(dojahOutcome(valid,reference),'verified');
  assert.throws(()=>dojahOutcome(valid,'different-reference'),/REFERENCE_MISMATCH/);
  assert.equal(dojahOutcome({...valid,status:false},reference),'rejected');
  assert.equal(dojahOutcome({...valid,data:{government_data:{status:true}}},reference),'rejected');
  assert.equal(dojahOutcome({...valid,id_type:'BVN'},reference),'rejected');
  assert.equal(dojahOutcome({...valid,data:{...valid.data,address:{status:false}}},reference),'rejected');
  assert.equal(dojahOutcome({...valid,verification_status:'Pending'},reference),'pending');
});
test('Dojah lookup uses server-only authentication and opaque reference',async()=>{
  const previous={app:process.env.DOJAH_APP_ID,secret:process.env.DOJAH_SECRET_KEY};
  process.env.DOJAH_APP_ID='test-app';process.env.DOJAH_SECRET_KEY='test-secret';
  try { await fetchDojahVerification(reference,async(url,options)=>{
    assert.equal(new URL(url).searchParams.get('reference_id'),reference);
    assert.equal(options.headers.Authorization,'test-secret');assert.equal(options.headers.AppId,'test-app');
    return new Response(JSON.stringify(valid));
  }); } finally { for(const [key,value] of [['DOJAH_APP_ID',previous.app],['DOJAH_SECRET_KEY',previous.secret]]) { if(value===undefined)delete process.env[key];else process.env[key]=value; } }
});
test('paid Premium activation remains off in preview',async()=>{
  const previous=process.env.MARKETPLACE_PAYMENTS_ENABLED;delete process.env.MARKETPLACE_PAYMENTS_ENABLED;
  let payload;const res={setHeader(){},status(value){this.statusCode=value;return this;},json(value){payload=value;return this;}};
  try {await handler({method:'POST',url:'/api/marketplace?action=activate-premium',headers:{},query:{action:'activate-premium'},body:{}},res);assert.equal(res.statusCode,403);assert.equal(payload.code,'MARKETPLACE_PREVIEW');}
  finally {if(previous===undefined)delete process.env.MARKETPLACE_PAYMENTS_ENABLED;else process.env.MARKETPLACE_PAYMENTS_ENABLED=previous;}
});
