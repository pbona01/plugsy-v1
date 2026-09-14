import { useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import toast from 'react-hot-toast';

let widgetLoading: Promise<void> | null = null;
function loadWidget() {
  if (typeof (window as any).Connect === 'function') return Promise.resolve();
  if (!widgetLoading) widgetLoading = new Promise<void>((resolve,reject) => {
    const script=document.createElement('script'); script.src='https://widget.dojah.io/widget.js';
    script.onload=()=>resolve(); script.onerror=()=>{script.remove();widgetLoading=null;reject(new Error('Dojah could not load. Please retry.'));};
    document.head.appendChild(script);
  });
  return widgetLoading;
}

export default function SellerVerification({ seller, onComplete }: { seller:any; onComplete:()=>Promise<void> }) {
  const {getToken}=useAuth(); const [busy,setBusy]=useState(false);
  const request=async(action:string)=>{
    const token=await getToken();
    const response=await fetch(`/api/marketplace?action=${action}`,{method:'POST',headers:{Authorization:`Bearer ${token||''}`}});
    const result=await response.json(); if(!response.ok||!result.success)throw new Error(result.error||'Verification is unavailable.');return result;
  };
  const check=async()=>{setBusy(true);try{const result=await request('check-verification');toast(result.status==='verified'?'Identity verified.':result.status==='pending'?'Verification is still being reviewed.':'Verification did not pass. Please review your documents and try again.');await onComplete();}catch(error:any){toast.error(error.message);}finally{setBusy(false);}};
  const start=async()=>{
    if(!window.confirm('Continue to Dojah to verify your ID and selfie? Dojah will process your verification details. Plugsy stores only the verification reference and status.'))return;
    setBusy(true);
    try{
      const result=await request('start-verification');if(result.status==='verified'){await onComplete();return;}
      await loadWidget();
      const widget=new (window as any).Connect({app_id:result.widget.appId,p_key:result.widget.publicKey,type:'custom',config:{widget_id:result.widget.widgetId},reference_id:result.widget.reference,
        onSuccess:()=>{void check();},onError:()=>toast.error('Verification could not finish. Please retry.'),onClose:()=>{void onComplete();}});
      widget.setup();widget.open();
    }catch(error:any){toast.error(error.message);}finally{setBusy(false);}
  };
  return <section className="mx-auto mt-6 max-w-7xl rounded-2xl border border-brand-border bg-brand-surface p-5">
    <h3 className="text-lg font-bold">Verify your seller identity</h3>
    <p className="mt-2 text-sm text-brand-text-secondary">Secure verification by Dojah using your NIN, passport or driving licence and a selfie. The available options depend on Plugsy’s configured Dojah flow.</p>
    <p className="mt-3 text-xs text-brand-text-secondary">Status: {seller?.verification_status || 'unverified'}. We never approve from a browser callback alone.</p>
    <div className="mt-4 flex flex-wrap gap-3"><button disabled={busy||seller?.verification_status==='verified'} onClick={()=>void start()} className="btn-primary h-11 px-5 text-sm disabled:opacity-50">{busy?'Please wait…':'Verify with Dojah'}</button>
    {seller?.verification_status==='pending'&&<button disabled={busy} onClick={()=>void check()} className="h-11 rounded-xl border border-brand-border px-5 text-sm">Check result</button>}</div>
  </section>;
}
