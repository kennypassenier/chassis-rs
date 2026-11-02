/* @kp-soft/themes v12.1.0, dist/js/ (gates/bundle-split.mjs). Generated; do not edit. */
import{i as T,j as g}from"./chunk-ZASD6JE4.js";import{m as E}from"./chunk-XB6CQZES.js";import{j as h}from"./chunk-WMKPQ742.js";import{a,b as p,c as m,t as f}from"./chunk-PELN7MTG.js";import{a as l}from"./chunk-OG6L4GK2.js";var O={};l(O,{NEEDS:()=>T,READY_ATTRIBUTE:()=>$,attachAll:()=>x});var N={};l(N,{EFFECTS_ATTRIBUTE:()=>i,NO_FLASH_SNIPPET:()=>F,REGISTER_PATTERN_DEFAULT:()=>A,THEME_ATTRIBUTE:()=>u,applyStoredTheme:()=>s,noFlashSnippet:()=>y});var u="data-theme",i="data-kp-effects";function r(t){return JSON.stringify(t).replace(/</g,"\\u003c")}var A="/css/{theme}-register.css",S=t=>t.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");function y({key:t=m,attribute:e=u,effects:o=!1,register:n=!1}={}){if(n)return w({key:t,attribute:e,effects:o,...n===!0?{}:n});let c=o?`
        document.documentElement.setAttribute(${r(i)}, '');`:"";return`(function () {
    try {
        var t = localStorage.getItem(${r(t)});
        if (t) document.documentElement.setAttribute(${r(e)}, t);${c}
    } catch (e) {}
})();`}function w({key:t,attribute:e,effects:o,pattern:n=A,fallback:c=p}){let d=a.map(L=>L.name);if(!d.includes(c))throw new RangeError(`kp-themes: the register fallback "${c}" is not a theme`);let[R,...b]=n.split("{theme}"),_=b.join("{theme}"),I=o?`
    d.setAttribute(${r(i)}, '');`:"";return`(function () {
    var d = document.documentElement;
    try {
        var t = localStorage.getItem(${r(t)});
        if (t) d.setAttribute(${r(e)}, t);
    } catch (e) {}${I}
    var n = d.getAttribute(${r(e)});
    if (${JSON.stringify(d).replace(/</g,"\\u003c")}.indexOf(n) < 0) n = ${r(c)};
    document.write('<link rel="stylesheet" href="' + ${r(S(R))} + n + ${r(S(_))} + '" data-kp-register="' + n + '" blocking="render">');
})();`}var F=y();function s({key:t=m,attribute:e=u,root:o}={}){if(typeof document>"u")return null;try{let n=localStorage.getItem(t);return n?((o??document.documentElement).setAttribute(e,n),n):null}catch{return null}}var $="data-kp-auto-ready";function x(t=document){return new g(t).start()}if(typeof document<"u"){if(s(),h(),E(),document.documentElement.hasAttribute("data-kp-theme-from-query"))try{let e=new URLSearchParams(location.search).get("theme");e!==null&&a.some(o=>o.name===e)&&f(e)}catch{}let t=()=>{let e=x();e.ready.then(()=>document.documentElement.setAttribute($,e.modules.join(" ")))};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",t,{once:!0}):t()}export{u as a,i as b,A as c,y as d,F as e,s as f,N as g,$ as h,x as i,O as j};
//# sourceMappingURL=chunk-RCFU47JF.js.map
