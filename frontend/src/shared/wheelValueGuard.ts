/** Keep the value and focus intact; route wheel motion to the scroll container. */
export function installWheelValueGuard(){
 const listener=(event:WheelEvent)=>{
  const target=event.target instanceof Element?event.target.closest('input,select,[role="spinbutton"],[role="slider"],[role="combobox"]'):null;
  if(!target||!(target.matches('select,[role="spinbutton"],[role="slider"],[role="combobox"]')||target.matches('input[type="number"],input[type="range"],input[type="date"],input[type="month"],input[type="week"],input[type="time"],input[type="datetime-local"]')))return;
  event.preventDefault();event.stopPropagation();
  const factor=event.deltaMode===1?16:event.deltaMode===2?window.innerHeight:1;
  const top=event.deltaY*factor,left=event.deltaX*factor;
  for(let parent=target.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
   const style=getComputedStyle(parent);
   if(/auto|scroll/.test(style.overflowY)&&((top>0&&parent.scrollTop+parent.clientHeight<parent.scrollHeight)||(top<0&&parent.scrollTop>0))){parent.scrollBy({top,left,behavior:'instant'});return}
  }
  window.scrollBy({top,left,behavior:'instant'});
 };
 document.addEventListener('wheel',listener,{capture:true,passive:false});
 return ()=>document.removeEventListener('wheel',listener,true);
}
