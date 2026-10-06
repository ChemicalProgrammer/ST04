// Shared bounded pool: multiple scenario cards cannot each exhaust the CPU.
export function createSimulationWorkerPool(factory, size) {
  const slots=[],queue=[];let nextId=0,closed=false,idleTimer;
  function dispose(slot){clearTimeout(slot.startup);slot.worker?.terminate();slot.worker=null;slot.ready=false;}
  function fail(slot,error){const job=slot.job;slot.job=null;dispose(slot);if(job)job.reject(error);pump();}
  function start(slot){
    try {
      slot.worker=factory();const worker=slot.worker;slot.ready=false;
      slot.startup=setTimeout(()=>fail(slot,new Error('SIMULATION_WORKER_UNAVAILABLE')),10000);
      slot.worker.onerror=()=>{if(slot.worker===worker)fail(slot,new Error('SIMULATION_WORKER_UNAVAILABLE'));};
      slot.worker.onmessage=event=>{
        if(slot.worker!==worker)return;
        const message=event.data;
        if(message.type==='ready'){clearTimeout(slot.startup);slot.ready=true;dispatch(slot);return;}
        const job=slot.job;if(!job||message.id!==job.id)return;
        if(message.type==='progress'){job.options.progress?.(message.value);return;}
        slot.job=null;
        if(message.type==='error')job.reject(new Error(message.message));else job.resolve(message.response);
        pump();
      };
    }catch(error){fail(slot,new Error('SIMULATION_WORKER_UNAVAILABLE'));}
  }
  function dispatch(slot){
    if(!slot.ready||!slot.job)return;
    try{slot.worker.postMessage({id:slot.job.id,input:slot.job.input,summaryOnly:slot.job.options.summaryOnly,detail:slot.job.options.detail});}
    catch(error){fail(slot,new Error('SIMULATION_WORKER_UNAVAILABLE'));}
  }
  function pump(){
    if(closed)return;
    while(queue.length){
      let slot=slots.find(s=>!s.job);
      if(!slot&&slots.length<size){slot={worker:null,job:null};slots.push(slot);}
      if(!slot)break;
      const job=queue.shift();if(job.options.cancelled?.()){job.reject(new Error('BATCH_CANCELLED'));continue;}
      slot.job=job;if(!slot.worker)start(slot);else dispatch(slot);
    }
    if(!queue.length&&slots.every(s=>!s.job)){clearTimeout(idleTimer);idleTimer=setTimeout(()=>slots.forEach(dispose),5000);}
  }
  function cancel(job){
    const index=queue.indexOf(job);
    if(index>=0)queue.splice(index,1);
    const slot=slots.find(s=>s.job===job);
    if(slot){slot.job=null;dispose(slot);}
    job.reject(new Error('BATCH_CANCELLED'));pump();
  }
  function run(input,options={}){
    if(closed)return Promise.reject(new Error('SIMULATION_WORKER_UNAVAILABLE'));
    clearTimeout(idleTimer);
    return new Promise((resolve,reject)=>{
      let settled=false,timer;
      const job={id:++nextId,input,options,resolve:value=>{if(settled)return;settled=true;clearInterval(timer);resolve(value);},reject:error=>{if(settled)return;settled=true;clearInterval(timer);reject(error);}};
      timer=setInterval(()=>{if(options.cancelled?.())cancel(job);},50);
      queue.push(job);pump();
    });
  }
  function close(error=new Error('BATCH_CANCELLED')){closed=true;clearTimeout(idleTimer);queue.splice(0).forEach(j=>j.reject(error));slots.forEach(s=>{s.job?.reject(error);s.job=null;dispose(s);});}
  return {run,close,size};
}
