/* ============================================================
   SAMUI LUXURY STAYS — Site scripts
   ============================================================ */
(function(){
  'use strict';

  /* Header scroll state (only on pages with a transparent overlay hero) */
  var hdr=document.getElementById('hdr');
  if(hdr && hdr.dataset.overlay==='true'){
    var onScroll=function(){hdr.classList.toggle('scrolled',window.scrollY>40);};
    window.addEventListener('scroll',onScroll,{passive:true});
    onScroll();
  }

  /* Mobile menu */
  var burger=document.getElementById('burger'),menu=document.getElementById('menu');
  if(burger&&menu){
    burger.addEventListener('click',function(){menu.classList.toggle('open');burger.classList.toggle('x');});
    menu.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click',function(){menu.classList.remove('open');burger.classList.remove('x');});
    });
  }

  /* Scroll reveal */
  var reveals=document.querySelectorAll('.reveal');
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){
      es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});
    },{threshold:.16,rootMargin:'0px 0px -8% 0px'});
    reveals.forEach(function(el){io.observe(el);});
  }else{
    reveals.forEach(function(el){el.classList.add('in');});
  }

  /* Hero video plays directly (fallback photo sits behind it via CSS stacking,
     so if the video ever fails to load, the photo shows through automatically). */
  var v=document.getElementById('herovid');
  if(v){
    v.addEventListener('error',function(){v.style.display='none';});
    var playPromise=v.play();
    if(playPromise&&playPromise.catch)playPromise.catch(function(){});
  }

  /* Testimonials rotator */
  var quoteEl=document.getElementById('quote');
  if(quoteEl){
    var data=[
      {q:'They manage our villa with a level of care we never expected from a distance. Reporting is impeccable, and guests leave <em>five-star reviews every time.</em>',a:'Charles &amp; Vivienne L.',r:'Villa owners · London, United Kingdom'},
      {q:'Truly the first management company that has felt like a genuine partner. Discreet, proactive, and <em>completely transparent</em> with every baht.',a:'Mr. A. Karlsson',r:'Villa owner · Stockholm, Sweden'},
      {q:'Our rental income is up and our worries are gone. They anticipate problems we never even <em>knew existed.</em>',a:'The Tan Family',r:'Villa owners · Singapore'}
    ];
    var aEl=document.getElementById('qauthor'),dots=document.getElementById('qdots'),qi=0,timer;
    data.forEach(function(_,i){
      var b=document.createElement('button');if(!i)b.className='on';
      b.setAttribute('aria-label','Testimonial '+(i+1));
      b.addEventListener('click',function(){show(i,true);});dots.appendChild(b);
    });
    function show(i,manual){
      qi=i;quoteEl.style.opacity=0;aEl.style.opacity=0;
      setTimeout(function(){
        quoteEl.innerHTML=data[i].q;aEl.innerHTML='<b>'+data[i].a+'</b><span>'+data[i].r+'</span>';
        quoteEl.style.opacity=1;aEl.style.opacity=1;
        Array.prototype.forEach.call(dots.children,function(d,j){d.classList.toggle('on',j===i);});
      },350);
      if(manual){clearInterval(timer);timer=setInterval(next,7000);}
    }
    function next(){show((qi+1)%data.length);}
    timer=setInterval(next,7000);
  }

  /* FAQ accordion */
  document.querySelectorAll('.faq-q').forEach(function(q){
    q.addEventListener('click',function(){
      var item=q.parentElement,a=item.querySelector('.faq-a');
      var open=item.classList.toggle('open');
      a.style.maxHeight=open?a.scrollHeight+'px':null;
    });
  });

  /* Contact form — submits to Formspree via AJAX so the visitor stays on the page.
     If the form action still contains YOUR_FORM_ID (not yet configured), it shows
     the thank-you message without sending, so the page still behaves nicely. */
  var form=document.getElementById('contactForm');
  if(form){
    form.addEventListener('submit',function(e){
      e.preventDefault();
      var ok=document.getElementById('formOk');
      var err=document.getElementById('formErr');
      var btn=form.querySelector('button[type="submit"]');
      if(ok)ok.style.display='none';
      if(err)err.style.display='none';
      var action=form.getAttribute('action')||'';

      function showOk(){
        if(ok)ok.style.display='block';
        form.querySelectorAll('input,textarea,select').forEach(function(f){if(f.type!=='hidden')f.value='';});
      }

      // Not configured yet: show thank-you without sending.
      if(action.indexOf('YOUR_FORM_ID')!==-1||!action){showOk();return;}

      if(btn){btn.disabled=true;btn.style.opacity=.7;}
      fetch(action,{method:'POST',body:new FormData(form),headers:{'Accept':'application/json'}})
        .then(function(r){
          if(r.ok){showOk();}
          else if(err){err.style.display='block';}
        })
        .catch(function(){if(err)err.style.display='block';})
        .finally(function(){if(btn){btn.disabled=false;btn.style.opacity=1;}});
    });
  }

  /* Footer year */
  var yr=document.getElementById('year');
  if(yr){yr.textContent=new Date().getFullYear();}

  /* Villa listing tabs: filter by Rental / For Sale / All */
  var vtabs=document.getElementById('vtabs');
  var grid=document.getElementById('portfolioGrid');
  if(vtabs&&grid){
    var cards=grid.querySelectorAll('.vcard');
    vtabs.querySelectorAll('.vtab').forEach(function(tab){
      tab.addEventListener('click',function(){
        vtabs.querySelectorAll('.vtab').forEach(function(t){t.classList.remove('active');});
        tab.classList.add('active');
        var filter=tab.getAttribute('data-filter');
        cards.forEach(function(card){
          var types=(card.getAttribute('data-type')||'').split(' ');
          var show=filter==='all'||types.indexOf(filter)!==-1;
          card.hidden=!show;
        });
      });
    });
  }
})();
