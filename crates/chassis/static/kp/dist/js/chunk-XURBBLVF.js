/* @kp-soft/themes v12.1.0, dist/js/ (gates/bundle-split.mjs). Generated; do not edit. */
import{a as m,b as l,c as u}from"./chunk-BE2OWCC2.js";import{a as $}from"./chunk-OG6L4GK2.js";var y={};$(y,{EFFECTS_ATTRIBUTE:()=>s,NO_FLASH_SNIPPET:()=>x,REGISTER_PATTERN_DEFAULT:()=>d,THEME_ATTRIBUTE:()=>i,applyStoredTheme:()=>_,noFlashSnippet:()=>f});var i="data-theme",s="data-kp-effects";function e(t){return JSON.stringify(t).replace(/</g,"\\u003c")}var d="/css/{theme}-register.css",p=t=>t.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");function f({key:t=u,attribute:r=i,effects:o=!1,register:n=!1}={}){if(n)return A({key:t,attribute:r,effects:o,...n===!0?{}:n});let c=o?`
        document.documentElement.setAttribute(${e(s)}, '');`:"";return`(function () {
    try {
        var t = localStorage.getItem(${e(t)});
        if (t) document.documentElement.setAttribute(${e(r)}, t);${c}
    } catch (e) {}
})();`}function A({key:t,attribute:r,effects:o,pattern:n=d,fallback:c=l}){let a=m.map(S=>S.name);if(!a.includes(c))throw new RangeError(`kp-themes: the register fallback "${c}" is not a theme`);let[E,...g]=n.split("{theme}"),T=g.join("{theme}"),h=o?`
    d.setAttribute(${e(s)}, '');`:"";return`(function () {
    var d = document.documentElement;
    try {
        var t = localStorage.getItem(${e(t)});
        if (t) d.setAttribute(${e(r)}, t);
    } catch (e) {}${h}
    var n = d.getAttribute(${e(r)});
    if (${JSON.stringify(a).replace(/</g,"\\u003c")}.indexOf(n) < 0) n = ${e(c)};
    document.write('<link rel="stylesheet" href="' + ${e(p(E))} + n + ${e(p(T))} + '" data-kp-register="' + n + '" blocking="render">');
})();`}var x=f();function _({key:t=u,attribute:r=i,root:o}={}){if(typeof document>"u")return null;try{let n=localStorage.getItem(t);return n?((o??document.documentElement).setAttribute(r,n),n):null}catch{return null}}export{i as a,s as b,d as c,f as d,x as e,_ as f,y as g};
//# sourceMappingURL=chunk-XURBBLVF.js.map
