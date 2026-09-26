export type UiThemePreference='system'|'light'|'dark';
export type ResolvedUiTheme='light'|'dark';

const STORAGE_KEY='lourex-ui-theme';
const DARK_QUERY='(prefers-color-scheme: dark)';
const THEME_COLORS:Record<ResolvedUiTheme,string>={light:'#f4f7fb',dark:'#081321'};

let mediaQuery:MediaQueryList|null=null;
let mediaHandler:((event:MediaQueryListEvent)=>void)|null=null;

function safePreference(value:string|null):UiThemePreference{
  return value==='light'||value==='dark'||value==='system'?value:'system';
}

export function getUiThemePreference():UiThemePreference{
  try{return safePreference(window.localStorage.getItem(STORAGE_KEY));}catch{return 'system';}
}

export function resolveUiTheme(preference:UiThemePreference=getUiThemePreference()):ResolvedUiTheme{
  if(preference==='light'||preference==='dark')return preference;
  try{return window.matchMedia(DARK_QUERY).matches?'dark':'light';}catch{return 'dark';}
}

export function applyUiTheme(preference:UiThemePreference=getUiThemePreference(),persist=false):ResolvedUiTheme{
  const resolved=resolveUiTheme(preference);
  const root=document.documentElement;
  root.dataset.uiTheme=resolved;
  root.dataset.uiThemePreference=preference;
  const booting=root.dataset.lourexBooting==='true'&&Boolean(document.querySelector('#root > .loading-screen'));
  root.style.colorScheme=resolved;
  root.style.backgroundColor=THEME_COLORS[resolved];
  if(booting)root.style.setProperty('--boot-bg',THEME_COLORS[resolved]);
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute('content',THEME_COLORS[resolved]);
  if(persist){try{window.localStorage.setItem(STORAGE_KEY,preference);}catch{}}
  try{window.dispatchEvent(new CustomEvent('lourex-ui-theme-change',{detail:{preference,resolved}}));}catch{}
  return resolved;
}

export function setUiThemePreference(preference:UiThemePreference):ResolvedUiTheme{
  return applyUiTheme(preference,true);
}

export function cycleUiThemePreference():UiThemePreference{
  const current=getUiThemePreference();
  const next:UiThemePreference=current==='system'?'light':current==='light'?'dark':'system';
  setUiThemePreference(next);
  return next;
}

export function startUiThemeSync():()=>void{
  applyUiTheme(getUiThemePreference(),false);
  try{
    mediaQuery=window.matchMedia(DARK_QUERY);
    mediaHandler=()=>{if(getUiThemePreference()==='system')applyUiTheme('system',false);};
    mediaQuery.addEventListener?.('change',mediaHandler);
  }catch{}
  return ()=>{
    try{if(mediaQuery&&mediaHandler)mediaQuery.removeEventListener?.('change',mediaHandler);}catch{}
    mediaQuery=null;
    mediaHandler=null;
  };
}

export function uiThemeLabel(preference:UiThemePreference):string{
  if(preference==='light')return 'Light';
  if(preference==='dark')return 'Dark';
  return 'System';
}
