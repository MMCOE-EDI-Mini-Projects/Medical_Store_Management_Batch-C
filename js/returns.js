document.addEventListener("DOMContentLoaded",function(){
 App.init("returns","Returns");const c=document.getElementById("pageContent");let rows=[];
 function render(){c.innerHTML=App.pageHeader("Returns & Refunds","Process customer returns and refund requests.",`<button class="btn btn-primary" id="add"><i class="bi bi-plus-lg me-1"></i>New Return</button>`)
 +App.filterBar([{type:"search",id:"q",label:"Search invoice or customer…"} ,{type:"select",id:"s",label:"All Status",options:["Pending","Approved","Rejected"]}])
 +`<div class="msms-card section-card"><div class="card-body p-0" id="t"></div></div>`;draw();q.oninput=draw;s.onchange=draw;add.onclick=form}
 function draw(){let q=(document.getElementById("q")?.value||"").toLowerCase(),s=document.getElementById("s")?.value||"";let f=rows.filter(r=>(!s||r.status===s)&&`${r.invoice} ${r.customer} ${r.medicine}`.toLowerCase().includes(q));
 t.innerHTML=App.table(f,[{key:"id",label:"Return ID"},{key:"invoice",label:"Invoice"},{key:"customer",label:"Customer"},{key:"medicine",label:"Medicine"},{key:"qty",label:"Qty"},{key:"reason",label:"Reason"},{key:"date",label:"Date"},{key:"status",label:"Status",badge:true},{label:"Actions",render:r=>r.status==="Pending"?App.actionBtn("bi-check","approve","Approve")+App.actionBtn("bi-x","reject","Reject"):App.actionBtn("bi-eye","view","View")}],{hover:true});
 document.querySelectorAll(".approve").forEach((b,i)=>b.onclick=()=>change(f[i],"Approved"));document.querySelectorAll(".reject").forEach((b,i)=>b.onclick=()=>change(f[i],"Rejected"));
 }
 async function change(r,status){await API.updateReturn(r.id,{status});await load();App.toast({type:"success",title:"Return updated",message:`${r.id} is ${status}.`})}
 function form(){document.getElementById("modalRoot").innerHTML=App.modalHtml("retModal","New Return",`<form id="f"><div class="row g-3">
 <div class="col-md-6"><label class="form-label">Invoice *</label><input class="form-control" id="invoice" required></div><div class="col-md-6"><label class="form-label">Customer *</label><input class="form-control" id="customer" required></div>
 <div class="col-md-6"><label class="form-label">Medicine *</label><input class="form-control" id="medicine" required></div><div class="col-md-6"><label class="form-label">Quantity *</label><input type="number" min="1" class="form-control" id="qty" required></div>
 <div class="col-12"><label class="form-label">Reason *</label><input class="form-control" id="reason" required></div></div></form>`,`<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" id="save">Create Return</button>`);new bootstrap.Modal(retModal).show();
 save.onclick=async()=>{if(!f.checkValidity()){f.reportValidity();return}await API.createReturn({invoice:invoice.value,customer:customer.value,medicine:medicine.value,qty:+qty.value,reason:reason.value});bootstrap.Modal.getInstance(retModal).hide();await load();App.toast({type:"success",title:"Return created",message:"Return request added."})}}
 async function load(){rows=await API.getReturns();render()}load();
});