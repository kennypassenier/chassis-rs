import{a as l,b as p,c as s}from"./chunk-TSZDXQCM.js";import{a as I}from"./chunk-4C666HHU.js";var k={};I(k,{EFFECTS_ATTRIBUTE:()=>m,EFFECTS_REPEAT_ATTRIBUTE:()=>d,NO_FLASH_SNIPPET:()=>F,REGISTER_PATTERN_DEFAULT:()=>g,THEME_ATTRIBUTE:()=>u,applyStoredTheme:()=>b,noFlashSnippet:()=>T});var u="data-theme",m="data-kp-effects",d="data-kp-effects-repeat",R="kp-effects:";function f(t){return`
    try {
        var p = ${e(R)} + location.pathname + ':headline:';
        for (var i = 0; i < sessionStorage.length; i++) {
            if (sessionStorage.key(i).indexOf(p) === 0) { ${t}.setAttribute(${e(d)}, ''); break; }
        }
    } catch (e) {}`}function e(t){return JSON.stringify(t).replace(/</g,"\\u003c")}var g="/css/{theme}-register.css",E=t=>t.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");function T({key:t=s,attribute:o=u,effects:n=!1,repeat:r=!0,register:c=!1}={}){if(c)return y({key:t,attribute:o,effects:n,repeat:r,...c===!0?{}:c});let a=n?`
        document.documentElement.setAttribute(${e(m)}, '');`:"",i=n&&r?f("document.documentElement"):"";return`(function () {
    try {
        var t = localStorage.getItem(${e(t)});
        if (t) document.documentElement.setAttribute(${e(o)}, t);${a}
    } catch (e) {}${i}
})();`}function y({key:t,attribute:o,effects:n,repeat:r,pattern:c=g,fallback:a=p}){let i=l.map(x=>x.name);if(!i.includes(a))throw new RangeError(`kp-themes: the register fallback "${a}" is not a theme`);let[h,...$]=c.split("{theme}"),S=$.join("{theme}"),A=n?`
    d.setAttribute(${e(m)}, '');`:"",_=n&&r?f("d"):"";return`(function () {
    var d = document.documentElement;
    try {
        var t = localStorage.getItem(${e(t)});
        if (t) d.setAttribute(${e(o)}, t);
    } catch (e) {}${A}${_}
    var n = d.getAttribute(${e(o)});
    if (${JSON.stringify(i).replace(/</g,"\\u003c")}.indexOf(n) < 0) n = ${e(a)};
    document.write('<link rel="stylesheet" href="' + ${e(E(h))} + n + ${e(E(S))} + '" data-kp-register="' + n + '" blocking="render">');
})();`}var F=T();function b({key:t=s,attribute:o=u,root:n}={}){if(typeof document>"u")return null;try{let r=localStorage.getItem(t);return r?((n??document.documentElement).setAttribute(o,r),r):null}catch{return null}}export{u as a,m as b,d as c,g as d,T as e,F as f,b as g,k as h};
