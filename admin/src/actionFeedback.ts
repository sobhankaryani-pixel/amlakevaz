// Track the actual network lifetime of the clicked action, including response bodies.
let installed=false;
export function installActionFeedback(){
 if(installed)return;installed=true;
 let current:HTMLButtonElement|null=null;
 const counts=new WeakMap<HTMLButtonElement,number>();
 const original=globalThis.fetch.bind(globalThis);
 const mark=(button:HTMLButtonElement)=>{current=button;button.dataset.actionBusy='true';setTimeout(()=>{if(current===button)current=null;if(!counts.get(button))delete button.dataset.actionBusy},180)};
 document.addEventListener('click',event=>{const button=(event.target as Element)?.closest?.('button');if(!(button instanceof HTMLButtonElement)||button.disabled)return;if(counts.get(button)){event.preventDefault();event.stopImmediatePropagation();return}mark(button)},true);
 document.addEventListener('submit',event=>{const button=(event as SubmitEvent).submitter;if(button instanceof HTMLButtonElement)mark(button)},true);
 globalThis.fetch=async(input,init)=>{
  const button=current;
  if(button){counts.set(button,(counts.get(button)||0)+1);button.dataset.actionBusy='true'}
  try{const response=await original(input,init);if(button)await response.clone().arrayBuffer();return response}
  finally{if(button){const remaining=Math.max(0,(counts.get(button)||1)-1);counts.set(button,remaining);if(!remaining)delete button.dataset.actionBusy}}
 };
}
