document.addEventListener("DOMContentLoaded",function(){
 App.init("reports","Reports");const c=document.getElementById("pageContent");
 c.innerHTML=App.pageHeader("Reports & Analytics","Sales, inventory and procurement insights.",`<button class="btn btn-light" id="print"><i class="bi bi-printer me-1"></i>Print</button>`)
 +`<div class="row g-3"><div class="col-lg-8"><div class="msms-card section-card"><div class="card-header"><i class="bi bi-graph-up text-primary"></i>Monthly Sales</div><div class="card-body"><div class="chart-wrap"><canvas id="sales"></canvas></div></div></div></div>
 <div class="col-lg-4"><div class="msms-card section-card h-100"><div class="card-header"><i class="bi bi-pie-chart text-primary"></i>Inventory Mix</div><div class="card-body"><div class="chart-wrap"><canvas id="mix"></canvas></div></div></div></div>
 <div class="col-12"><div class="msms-card section-card"><div class="card-header"><i class="bi bi-truck text-primary"></i>Purchases by Supplier</div><div class="card-body"><div class="chart-wrap"><canvas id="sup"></canvas></div></div></div></div></div>`;
 API.getReports().then(r=>{new Chart(sales,{type:"bar",data:{labels:r.monthlySales.labels,datasets:[{label:"Sales",data:r.monthlySales.data}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});
 new Chart(mix,{type:"doughnut",data:{labels:r.inventoryMix.labels,datasets:[{data:r.inventoryMix.data}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"bottom"}}}});
 new Chart(sup,{type:"bar",data:{labels:r.purchasesBySupplier.labels,datasets:[{label:"Purchases",data:r.purchasesBySupplier.data}]},options:{indexAxis:"y",responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true}}}})});
 print.onclick=()=>window.print();
});