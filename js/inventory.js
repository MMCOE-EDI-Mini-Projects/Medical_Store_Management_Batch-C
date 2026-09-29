document.addEventListener("DOMContentLoaded",function(){
 App.init("inventory","Inventory");
 const content=document.getElementById("pageContent"); let rows=[];
 function render(){
  content.innerHTML=App.pageHeader("Inventory","Manage batch-level stock, prices and expiry.",`<button class="btn btn-primary" id="addStock"><i class="bi bi-plus-lg me-1"></i>Add Stock</button>`)
   +App.filterBar([{type:"search",id:"search",label:"Search medicine or batch…"} ,{type:"select",id:"status",label:"All Status",options:["In Stock","Low Stock","Expiring Soon","Out of Stock"]}])
   +`<div class="msms-card section-card"><div class="card-body p-0" id="table"></div></div>`;
  draw(); document.getElementById("search").oninput=draw;document.getElementById("status").onchange=draw;
  document.getElementById("addStock").onclick=()=>modal();
 }
 function draw(){let q=(document.getElementById("search")?.value||"").toLowerCase(),s=document.getElementById("status")?.value||"";
  let f=rows.filter(r=>(!s||r.status===s)&&(!q||`${r.medicine} ${r.batch}`.toLowerCase().includes(q)));
  document.getElementById("table").innerHTML=App.table(f,[
   {key:"medicine",label:"Medicine"},{key:"batch",label:"Batch"},{key:"expiry",label:"Expiry"},
   {key:"qty",label:"Qty",render:r=>`<strong>${r.qty}</strong>`},{key:"purchase",label:"Purchase",render:r=>App.money(r.purchase)},
   {key:"selling",label:"Selling",render:r=>App.money(r.selling)},{key:"supplier",label:"Supplier"},
   {key:"status",label:"Status",badge:true},{label:"Actions",render:r=>App.actionBtn("bi-pencil","edit","Adjust stock")}
  ],{hover:true});
  document.querySelectorAll(".action-btn.edit").forEach((b,i)=>b.onclick=()=>modal(f[i]));
 }
 function modal(row){
  let r=row||{medicine:"",batch:"",mfg:new Date().toISOString().slice(0,10),expiry:"",qty:0,purchase:0,selling:0,supplier:""};
  document.getElementById("modalRoot").innerHTML=App.modalHtml("invModal",row?"Adjust Inventory":"Add Inventory",`
   <form id="f"><div class="row g-3">
   <div class="col-md-6"><label class="form-label">Medicine *</label><input class="form-control" id="medicine" value="${r.medicine}" required></div>
   <div class="col-md-6"><label class="form-label">Batch *</label><input class="form-control" id="batch" value="${r.batch}" required></div>
   <div class="col-md-6"><label class="form-label">Manufacturing Date</label><input type="date" class="form-control" id="mfg" value="${r.mfg}"></div>
   <div class="col-md-6"><label class="form-label">Expiry Date *</label><input type="date" class="form-control" id="expiry" value="${r.expiry}" required></div>
   <div class="col-md-4"><label class="form-label">Quantity *</label><input type="number" min="0" class="form-control" id="qty" value="${r.qty}" required></div>
   <div class="col-md-4"><label class="form-label">Purchase Price</label><input type="number" min="0" step=".01" class="form-control" id="purchase" value="${r.purchase}"></div>
   <div class="col-md-4"><label class="form-label">Selling Price</label><input type="number" min="0" step=".01" class="form-control" id="selling" value="${r.selling}"></div>
   <div class="col-12"><label class="form-label">Supplier</label><input class="form-control" id="supplier" value="${r.supplier}"></div>
   </div></form>`,`<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" id="save">Save</button>`);
  new bootstrap.Modal(document.getElementById("invModal")).show();
  document.getElementById("save").onclick=async()=>{let f=document.getElementById("f");if(!f.checkValidity()){f.reportValidity();return}
   let d={medicine:medicine.value,batch:batch.value,mfg:mfg.value,expiry:expiry.value,qty:+qty.value,purchase:+purchase.value,selling:+selling.value,supplier:supplier.value};
   await (row?API.updateInventory(row.id,d):API.addInventory(d)); bootstrap.Modal.getInstance(document.getElementById("invModal")).hide();load();App.toast({type:"success",title:"Saved",message:"Inventory updated."});
  };
 }
 async function load(){rows=await API.getInventory();render()} load();
});