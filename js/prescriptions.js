document.addEventListener("DOMContentLoaded",function(){
 App.init("prescriptions","Prescriptions");const c=document.getElementById("pageContent");let rows=[];
 function render(){c.innerHTML=App.pageHeader("Prescription Management","Review, approve or reject prescription requests.",`<button class="btn btn-primary" id="upload"><i class="bi bi-upload me-1"></i>Upload Prescription</button>`)
 +App.filterBar([{type:"search",id:"q",label:"Search customer, doctor or ID…"} ,{type:"select",id:"s",label:"All Status",options:["Pending","Approved","Rejected"]}])
 +`<div class="msms-card section-card"><div class="card-body p-0" id="t"></div></div>`;draw();q.oninput=draw;s.onchange=draw;upload.onclick=uploadForm}
 function draw(){let q=(document.getElementById("q")?.value||"").toLowerCase(),s=document.getElementById("s")?.value||"";let f=rows.filter(r=>(!s||r.status===s)&&`${r.id} ${r.customer} ${r.doctor}`.toLowerCase().includes(q));
 c.querySelector("#t").innerHTML=App.table(f,[{key:"id",label:"ID"},{key:"customer",label:"Customer"},{key:"doctor",label:"Doctor"},{key:"date",label:"Date"},{key:"status",label:"Status",badge:true},{key:"invoice",label:"Invoice"},
 {label:"Actions",render:r=>r.status==="Pending"?App.actionBtn("bi-check-circle","approve","Approve")+App.actionBtn("bi-x-circle","reject","Reject"):App.actionBtn("bi-eye","view","View")}],{hover:true});
 c.querySelectorAll(".approve").forEach((b,i)=>b.onclick=()=>setStatus(f[i],"Approved"));c.querySelectorAll(".reject").forEach((b,i)=>b.onclick=()=>setStatus(f[i],"Rejected"));
 c.querySelectorAll(".view").forEach((b,i)=>b.onclick=()=>App.toast({type:"info",title:f[i].id,message:`${f[i].customer} · ${f[i].doctor}`}));
 }
 async function setStatus(r,status){await API.updatePrescription(r.id,{status});await load();App.toast({type:"success",title:"Prescription updated",message:`${r.id} is ${status}.`})}
 function uploadForm(){document.getElementById("modalRoot").innerHTML=App.modalHtml("rxModal","Upload Prescription",`<form id="rf"><div class="mb-3"><label class="form-label">Prescription file *</label><input class="form-control" id="file" type="file" accept="image/*,.pdf" required></div><div class="row g-3"><div class="col-md-6"><label class="form-label">Customer *</label><input class="form-control" id="customer" required></div><div class="col-md-6"><label class="form-label">Doctor</label><input class="form-control" id="doctor"></div></div></form>`,`<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" id="save">Upload</button>`);new bootstrap.Modal(rxModal).show();
 save.onclick=async()=>{if(!rf.checkValidity()){rf.reportValidity();return}await API.uploadPrescription(file.files[0],{customer:customer.value,doctor:doctor.value||"—"});bootstrap.Modal.getInstance(rxModal).hide();await load();App.toast({type:"success",title:"Uploaded",message:"Prescription added to pending queue."})}}
 async function load(){rows=await API.getPrescriptions();render()}load();
});