/* global TrelloPowerUp, ProgressReport */
      const t = TrelloPowerUp.iframe({
        appKey: "93b1fabac6fe3f9a688c9b4cc836f97d",
        appName: "Progress Tracker",
      });

      let mode = "weekly";
      let report = null;

      const SERIES = ["#22a06b","#4c6ef5","#e9a23b","#7c6ff0","#4bce97","#e5684a"];
      const icon = (p) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
      const ICONS = {
        check:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>',
        target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
        clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        warn:'<path d="M12 4 2 20h20L12 4Z"/><path d="M12 10v4M12 17.5v.5"/>',
        cal:'<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="m10 15 1.4 1.4L14 14"/>',
        dl:'<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 21h16"/>',
      };

      /* ── charts: fixed 100-based scale for %, gridlines, labels, graceful sparse data ── */
      const CH={w:320,h:132,l:34,r:10,t:16,b:22};
      function gridlines(max,fmt){
        const steps=[0,.5,1];const g=[];
        steps.forEach(s=>{
          const y=CH.h-CH.b-s*(CH.h-CH.t-CH.b);
          g.push(`<line x1="${CH.l}" y1="${y.toFixed(1)}" x2="${CH.w-CH.r}" y2="${y.toFixed(1)}" stroke="var(--track)" stroke-width="1"/>`+
                 `<text x="${CH.l-6}" y="${(y+3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--muted)">${fmt(s*max)}</text>`);
        });
        return g.join("");
      }
      function emptyChart(msg){
        return `<svg viewBox="0 0 ${CH.w} ${CH.h}" width="100%" role="img" aria-label="${msg}">
          <text x="${CH.w/2}" y="${CH.h/2}" text-anchor="middle" font-size="11" fill="var(--muted)">${msg}</text></svg>`;
      }
      function barChart(values,labels){
        if(!values.length||values.every(v=>v===0&&values.length<2))
          return values.length?barChartDraw(values,labels):emptyChart("No periods recorded yet");
        return barChartDraw(values,labels);
      }
      function barChartDraw(values,labels){
        const max=100; /* deadline % — fixed scale so bars are comparable across periods */
        const innerW=CH.w-CH.l-CH.r,innerH=CH.h-CH.t-CH.b,base=CH.h-CH.b;
        const n=values.length;
        const bw=Math.min(26,Math.max(10,innerW/n*0.5));
        const step=innerW/n;
        let bars="";
        values.forEach((v,i)=>{
          const bh=Math.max(2,v/max*innerH);
          const x=CH.l+i*step+(step-bw)/2, y=base-bh;
          bars+=`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="var(--accent)" opacity="${0.55+0.45*(i+1)/n}"/>`+
                `<text x="${(x+bw/2).toFixed(1)}" y="${(y-4).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="600" fill="var(--dim)">${v}%</text>`+
                (labels&&labels[i]?`<text x="${(x+bw/2).toFixed(1)}" y="${base+13}" text-anchor="middle" font-size="8.5" fill="var(--muted)">${labels[i]}</text>`:"");
        });
        return `<svg viewBox="0 0 ${CH.w} ${CH.h}" width="100%" role="img" aria-label="Deadline achievement bar chart">
          ${gridlines(max,v=>v+"%")}${bars}</svg>`;
      }
      function lineChart(values,labels){
        if(!values.length||(values.length===1&&values[0]===0))
          return emptyChart("No tracked sessions yet");
        const max=Math.max(...values,1)*1.15;
        const innerW=CH.w-CH.l-CH.r,innerH=CH.h-CH.t-CH.b,base=CH.h-CH.b;
        const step=values.length>1?innerW/(values.length-1):0;
        const pts=values.map((v,i)=>[CH.l+(values.length>1?i*step:innerW/2),base-(v/max)*innerH]);
        const poly=pts.map(p=>`${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
        const area=`${CH.l},${base} ${poly} ${pts[pts.length-1][0].toFixed(1)},${base}`;
        const dots=pts.map((p,i)=>
          `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="var(--card)" stroke="#4bce97" stroke-width="2"/>`+
          `<text x="${p[0].toFixed(1)}" y="${(p[1]-7).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="600" fill="var(--dim)">${values[i]}</text>`+
          (labels&&labels[i]?`<text x="${p[0].toFixed(1)}" y="${base+13}" text-anchor="middle" font-size="8.5" fill="var(--muted)">${labels[i]}</text>`:"")
        ).join("");
        return `<svg viewBox="0 0 ${CH.w} ${CH.h}" width="100%" role="img" aria-label="Hours tracked line chart">
          ${gridlines(max,v=>v.toFixed(v>=10?0:1)+"h")}
          <polygon points="${area}" fill="#4bce97" opacity="0.09"/>
          ${values.length>1?`<polyline points="${poly}" fill="none" stroke="#4bce97" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`:""}
          ${dots}</svg>`;
      }
      function ratingColors(r){
        if(r==="Excellent")return["var(--green-bg)","var(--green-fg)","#22a06b"];
        if(r==="Good")return["var(--blue-bg)","var(--blue-fg)","#4c6ef5"];
        return["var(--amber-bg)","var(--amber-fg)","#e9a23b"];
      }
      const app=()=>document.getElementById("app");
      function fit(){t.sizeTo("body").catch(()=>{});}

      function showState(html){app().innerHTML=`<div class="state">${html}</div>`;fit();}

      async function connect(){
        try{await t.getRestApi().authorize({scope:"read",expiration:"never"});load();}
        catch(e){showState(`<h2>Couldn't connect</h2><div>${e.message||"Authorization was cancelled."}</div><button id="cbtn">Try again</button>`);
          const b=document.getElementById("cbtn");if(b)b.onclick=connect;}
      }

      function renderDashboard(){
        const d=report,m=d.metrics;
        const rows=d.history.length?d.history.map(r=>{
          const[bg,fg,bar]=ratingColors(r.rating);
          return `<tr><td style="color:var(--dim)">${r.range}</td><td>${r.total}</td><td>${r.completed}</td>
            <td><div style="display:flex;align-items:center;gap:6px"><div class="track"><div style="width:${r.deadline}%;height:100%;background:${bar}"></div></div><span style="font-size:10.5px;color:var(--dim)">${r.deadline}%</span></div></td>
            <td><span class="badge" style="background:${bg};color:${fg}">${r.rating}</span></td></tr>`;
        }).join(""):`<tr><td colspan="5" class="empty-cell">No stored periods yet — this ${mode==="monthly"?"month":"week"} is being recorded now and history will build over time.</td></tr>`;

        const metric=(chipBg,chipFg,iconKey,val,lbl,tip)=>`
          <div class="card metric">
            <div class="chip" style="background:${chipBg};color:${chipFg}">${icon(ICONS[iconKey])}</div>
            <div class="mtext">
              <div class="val" style="color:${chipFg}">${val}</div>
              <div class="lbl">${lbl}</div>
            </div>
            <div class="tip">${tip}</div>
          </div>`;

        app().innerHTML=`
          <div class="topbar"><h1>History reports &amp; export</h1>
            <div class="seg"><button data-mode="weekly" class="${mode==="weekly"?"on":""}">Weekly report</button><button data-mode="monthly" class="${mode==="monthly"?"on":""}">Monthly report</button></div>
          </div>
          <div class="metrics">
            ${metric("var(--green-bg)","var(--green-fg)","check",m.active,"Total active cards","Total cards where work is ongoing")}
            ${metric("var(--blue-bg)","var(--blue-fg)","target",m.achieved,"Completed cards","Cards that reached 100% progress")}
            ${metric("var(--amber-bg)","var(--amber-fg)","clock",m.hours,"Total hours tracked","Total hours you worked across tracked cards")}
            ${metric("var(--red-bg)","var(--red-fg)","warn",m.overtime,"Overtime warning","Cards where tracked time exceeded the estimate")}
          </div>
          <div class="charts">
            <div class="card" style="padding:12px 14px">
              <div class="chart-head"><span class="ct">Deadline achievement</span><span class="ch">last ${d.deadlineTrend.length||0} ${mode==="monthly"?"months":"weeks"}</span></div>
              ${barChart(d.deadlineTrend,d.trendLabels)}
            </div>
            <div class="card" style="padding:12px 14px">
              <div class="chart-head"><span class="ct">Hours tracked</span><span class="ch">per day</span></div>
              ${lineChart(d.hoursTracked,d.hoursLabels)}
            </div>
          </div>
          <div class="card prod">
            <div class="chip" style="background:var(--blue-bg);color:var(--blue-fg)">${icon(ICONS.cal)}</div>
            <span class="cap">Most productive day</span>
            <span class="day">${d.productivityDay}</span>
            <span class="note">Most tasks completed on the board</span>
          </div>
          <div class="sec-h">Stored history reports</div>
          <div class="card" style="padding:2px 12px"><table><thead><tr>
            <th style="width:27%">Period</th><th style="width:10%">Total</th><th style="width:13%">Done</th><th style="width:26%">Deadline</th><th style="width:24%">Rating</th>
          </tr></thead><tbody>${rows}</tbody></table></div>
          <button class="export" id="export">${icon(ICONS.dl)}Export ${mode} CSV</button>`;

        document.querySelectorAll(".seg button").forEach(b=>b.onclick=()=>{mode=b.dataset.mode;load();});
        document.getElementById("export").onclick=exportCSV;
        fit();
      }

      function exportCSV(){
        if(!report||!report.history.length)return;
        const header=["Period / date range","Total cards","Completed","Overtime","Deadline achieved (%)","Performance rating"];
        const lines=report.history.map(r=>[r.range,r.total,r.completed,r.overtime,r.deadline,r.rating].map(c=>`"${String(c).replace(/"/g,'""')}"`).join(","));
        const csv=[header.join(","),...lines].join("\n");
        const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
        const url=URL.createObjectURL(blob),a=document.createElement("a");
        a.href=url;a.download=`progress-${mode}-report.csv`;a.click();URL.revokeObjectURL(url);
      }

      async function load(){
        showState("Loading report…");
        let res;
        try{res=await ProgressReport.build(t,mode);}
        catch(e){showState(`<h2>Something went wrong</h2><div>${e.message||e}</div><button id="rbtn">Retry</button>`);
          const b=document.getElementById("rbtn");if(b)b.onclick=load;return;}
        if(res.needsAuth){showState(`<h2>Connect Trello to load your report</h2><div>Reports read your board's cards to build metrics.</div><button id="cbtn">Connect Trello</button>`);
          const b=document.getElementById("cbtn");if(b)b.onclick=connect;return;}
        if(res.error){showState(`<h2>Couldn't load board data</h2><div>${res.error}</div><button id="rbtn">Retry</button>`);
          const b=document.getElementById("rbtn");if(b)b.onclick=load;return;}
        report=res;renderDashboard();
      }

      function detectTheme(ctx){
        const url=new URLSearchParams(location.search).get("theme");
        const th=(ctx&&ctx.theme)||url;
        // Default dark (matches the board + rest of the Power-Up); light only if Trello explicitly says so
        return th==="light"?"light":"dark";
      }
      Promise.resolve(t.getContext?t.getContext():null)
        .then(ctx=>{document.documentElement.dataset.theme=detectTheme(ctx);})
        .catch(()=>{document.documentElement.dataset.theme="dark";})
        .finally(load);