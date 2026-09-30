let theme='light';
try{const saved=localStorage.getItem('prompt-studio-theme');if(saved==='light'||saved==='dark')theme=saved;}catch{}
document.documentElement.dataset.theme=theme;
if(window.promptDesktop){try{theme=window.promptDesktop.initial()?.theme||theme;document.documentElement.dataset.theme=theme;}catch{}}
export function themeControl(){return `<div class="theme-switch" role="group" aria-label="外观主题"><button data-action="theme" data-theme="light" aria-pressed="${theme==='light'}" title="浅色主题">浅色</button><button data-action="theme" data-theme="dark" aria-pressed="${theme==='dark'}" title="深色主题">深色</button></div>`;}
export function setTheme(value){
  if(!['light','dark'].includes(value))return;
  theme=value;document.documentElement.dataset.theme=theme;
  try{localStorage.setItem('prompt-studio-theme',theme);}catch{}
  window.promptDesktop?.setTheme(theme).catch(()=>{});
  document.querySelectorAll('[data-action="theme"]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.theme===theme)));
}
