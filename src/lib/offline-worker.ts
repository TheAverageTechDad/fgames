/** Fetch through the page's service worker before starting a background task.
 * Some browsers bypass the offline cache for a Worker's initial module request.
 * Vite emits these workers as self-contained scripts, so a local Blob is safe.
 */
export async function createOfflineWorker(url:string):Promise<Worker>{
 const response=await fetch(url);
 if(!response.ok)throw new Error('The background task could not be loaded.');
 const source=URL.createObjectURL(new Blob([await response.text()],{type:'text/javascript'}));
 try{
  const worker=new Worker(source,{type:'module'});
  const release=()=>URL.revokeObjectURL(source);
  worker.addEventListener('message',release,{once:true});worker.addEventListener('error',release,{once:true});
  const terminate=worker.terminate.bind(worker);worker.terminate=()=>{release();terminate();};
  return worker;
 }catch(error){URL.revokeObjectURL(source);throw error;}
}
