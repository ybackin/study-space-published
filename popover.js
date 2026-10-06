// One coordinator per document. Panels and triggers may live in different DOM
// trees (including portals); composedPath also handles shadow DOM boundaries.
const coordinators = new WeakMap();
function coordinator(doc) {
  if (coordinators.has(doc)) return coordinators.get(doc);
  const state = {active:null};
  doc.addEventListener('pointerdown', event => {
    const active=state.active;
    if (!active) return;
    const path=event.composedPath();
    if (!active.regions().some(node=>node && (path.includes(node)||node.contains(event.target)))) active.close();
  },true);
  doc.addEventListener('keydown',event=>{if(event.key==='Escape')state.active?.close();},true);
  coordinators.set(doc,state);
  return state;
}
export function createPopover({document:doc=window.document,panel,triggers=()=>[],onOpen=()=>{},onClose=()=>{}}) {
  const state=coordinator(doc);
  let opened=false;
  const get=value=>typeof value==='function'?value():value;
  const api={
    regions:()=>[get(panel),...get(triggers)],
    isOpen:()=>opened,
    open(){if(opened)return;state.active?.close();opened=true;state.active=api;onOpen();},
    close(){if(!opened)return;opened=false;if(state.active===api)state.active=null;onClose();},
    toggle(){opened?api.close():api.open();},
    destroy(){api.close();},
  };
  return api;
}
