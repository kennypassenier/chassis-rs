/* @kp-soft/themes v12.1.0, dist/js/ (gates/bundle-split.mjs). Generated; do not edit. */
import{i as S,j as y}from"./chunk-KAJ4CMPH.js";import{m as g}from"./chunk-E6ORA5GK.js";import{j as T}from"./chunk-N7BLDCZV.js";import{a as c,b as p,c as m,t as h}from"./chunk-4WRE6OW2.js";import{c as f,f as E}from"./chunk-XZE4YPAG.js";import{a as l}from"./chunk-OG6L4GK2.js";var O={};l(O,{NEEDS:()=>S,READY_ATTRIBUTE:()=>x,attachAll:()=>_});var F={};l(F,{EFFECTS_ATTRIBUTE:()=>u,NO_FLASH_SNIPPET:()=>D,REGISTER_PATTERN_DEFAULT:()=>$,THEME_ATTRIBUTE:()=>i,applyStoredTheme:()=>s,noFlashSnippet:()=>R});var i="data-theme",u="data-kp-effects";function n(t){return JSON.stringify(t).replace(/</g,"\\u003c")}var $="/css/{theme}-register.css",A=t=>t.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");function R({key:t=m,attribute:o=i,effects:e=!1,register:r=!1}={}){if(r)return w({key:t,attribute:o,effects:e,...r===!0?{}:r});let a=e?`
        document.documentElement.setAttribute(${n(u)}, '');`:"";return`(function () {
    try {
        var t = localStorage.getItem(${n(t)});
        if (t) document.documentElement.setAttribute(${n(o)}, t);${a}
    } catch (e) {}
})();`}function w({key:t,attribute:o,effects:e,pattern:r=$,fallback:a=p}){let d=c.map(v=>v.name);if(!d.includes(a))throw new RangeError(`kp-themes: the register fallback "${a}" is not a theme`);let[b,...I]=r.split("{theme}"),L=I.join("{theme}"),N=e?`
    d.setAttribute(${n(u)}, '');`:"";return`(function () {
    var d = document.documentElement;
    try {
        var t = localStorage.getItem(${n(t)});
        if (t) d.setAttribute(${n(o)}, t);
    } catch (e) {}${N}
    var n = d.getAttribute(${n(o)});
    if (${JSON.stringify(d).replace(/</g,"\\u003c")}.indexOf(n) < 0) n = ${n(a)};
    document.write('<link rel="stylesheet" href="' + ${n(A(b))} + n + ${n(A(L))} + '" data-kp-register="' + n + '" blocking="render">');
})();`}var D=R();function s({key:t=m,attribute:o=i,root:e}={}){if(typeof document>"u")return null;try{let r=localStorage.getItem(t);return r?((e??document.documentElement).setAttribute(o,r),r):null}catch{return null}}var x="data-kp-auto-ready";function _(t=document){return new y(t).start()}if(typeof document<"u"){if(s(),T(),g(),f("nl",()=>import("./chunk-4AHC5MYG.js").then(e=>e.NL_STRINGS)),document.documentElement.hasAttribute("data-kp-theme-from-query"))try{let e=new URLSearchParams(location.search).get("theme");e!==null&&c.some(r=>r.name===e)&&h(e)}catch{}let t=()=>{E().then(o)},o=()=>{let e=_();e.ready.then(()=>document.documentElement.setAttribute(x,e.modules.join(" ")))};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",t,{once:!0}):t()}export{i as a,u as b,$ as c,R as d,D as e,s as f,F as g,x as h,_ as i,O as j};
//# sourceMappingURL=chunk-KGTHPJ6X.js.map
