document.addEventListener("DOMContentLoaded",function(){
 App.init("expiry","Expiry Tracking");const c=document.getElementById("pageContent");let rows=[];
 function render(){let buckets=[["Expired",r=>App.daysUntil(r.expiry)<0],["0–30 days",r=>App.daysUntil(r.expiry)>=0&&App.daysUntil(r.expiry)<=30],["31–60 days",r=>App.daysUntil(r.expiry)>30&&App.daysUntil(r.expiry)<=60],["61–90 days",r=>App.daysUntil(r.expiry)>60&&App.daysUntil(r.expiry)<=90]];
  c.innerHTML=App.pageHeader("Expiry Tracking","Identify batches that need attention before they expire.")
   +`<div class="row g-3 mb-3">${buckets.map(b=>`<div class="col-md-3"><div class="stat-card"><div class="stat-icon ic-orange"><i class="bi bi-clock-history"></i></div><div class="stat-label">${b[0]}</div><div class="stat-value">${rows.filter(b[1]).length}</div></div></div>`).join("")}</div>`
   +App.filterBar([{type:"search",id:"q",label:"Search medicine or batch…"}])
   +`<div class="msms-card section-card"><div class="card-body p-0" id="t"></div></div>`;draw();q.oninput=draw;
 }
 function draw(){let q=(document.getElementById("q")?.value||"").toLowerCase();let f=rows.filter(r=>(r.medicine+" "+r.batch).toLowerCase().includes(q)).sort((a,b)=>App.daysUntil(a.expiry)-App.daysUntil(b.expiry));
  document.getElementById("t").innerHTML=App.table(f,[{key:"medicine",label:"Medicine"},{key:"batch",label:"Batch"},{key:"expiry",label:"Expiry"},
  {label:"Days Left",render:r=>{let d=App.daysUntil(r.expiry);return `<strong>${d<0?"Expired":d+" days"}</strong>`}},
  {key:"qty",label:"Qty"},{key:"supplier",label:"Supplier"},{key:"status",label:"Status",badge:true}],{hover:true});
 } API.getInventory().then(x=>{rows=x;render()});
});