'use strict';
const button=document.querySelector('#demo-toggle'),image=document.querySelector('#demo-image');
if(button&&image){
 let playing=false,timer;
 const stop=()=>{clearTimeout(timer);playing=false;image.src=image.dataset.poster;button.textContent='▶ '+button.dataset.play;button.setAttribute('aria-pressed','false');};
 button.hidden=false;
 button.addEventListener('click',()=>{if(playing){stop();return;}playing=true;image.src=image.dataset.animation;button.textContent='■ '+button.dataset.stop;button.setAttribute('aria-pressed','true');timer=setTimeout(stop,15200);});
 // Motion starts only after an explicit click; stop it when leaving the page.
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
 image.addEventListener('error',()=>{if(playing)stop();});
}
