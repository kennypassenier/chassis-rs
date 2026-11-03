function e(n){if(n===null||typeof n!="object")return!1;let t=n.ownerDocument?.defaultView?.HTMLElement;return typeof t=="function"?n instanceof t:n instanceof HTMLElement}export{e as a};
