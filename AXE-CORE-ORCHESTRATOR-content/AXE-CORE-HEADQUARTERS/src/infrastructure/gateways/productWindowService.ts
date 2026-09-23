import { sbGetRows } from '@/infrastructure/gateways/axeCoreApiService';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';

interface RegisteredProduct { id:string; name:string; prod_url:string; internal_path:string; enabled:boolean }
const slug=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,42);

/** Open a registered AXE product as its own desktop surface, using the live app registry. */
export async function openRegisteredProductShell(name:string,monitorIndex=0):Promise<void>{
  const rows=await sbGetRows<RegisteredProduct>('registered_apps',{limit:10,filterCol:'name',filterVal:name});
  const app=rows.find(x=>x.enabled!==false&&x.name.toLowerCase()===name.toLowerCase());
  if(!app)throw new Error(`${name} is not registered in AXE Apps.`);
  const target=app.prod_url?.trim()||(app.internal_path?.trim()?`${window.location.origin}${window.location.pathname}#${app.internal_path.startsWith('/')?app.internal_path:`/${app.internal_path}`}`:'');
  if(!target)throw new Error(`${name} has no desktop URL or internal surface registered.`);
  if(!isTauriRuntime()){window.open(target,'_blank','noopener,noreferrer');return;}
  const {availableMonitors}=await import('@tauri-apps/api/window');
  const monitors=(await availableMonitors()).sort((a,b)=>a.position.x-b.position.x);
  const raw=monitors[monitorIndex]??monitors[0];if(!raw)throw new Error('No monitor available.');const scale=raw.scaleFactor;
  const {WebviewWindow}=await import('@tauri-apps/api/webviewWindow');const label=`axe-product-${slug(app.name)}`;const existing=await WebviewWindow.getByLabel(label);
  if(existing){await existing.show();await existing.setFocus();return;}
  const win=new WebviewWindow(label,{url:target,title:app.name,x:raw.position.x/scale+36,y:raw.position.y/scale+36,width:Math.min(1440,raw.size.width/scale-72),height:Math.min(920,raw.size.height/scale-72),theme:'dark',decorations:true,resizable:true,center:false});
  await new Promise<void>((resolve,reject)=>{win.once('tauri://created',()=>resolve());win.once('tauri://error',ev=>reject(new Error(String(ev.payload))));});
}
