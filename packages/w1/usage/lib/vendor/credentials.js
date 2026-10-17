var t=/^[A-Za-z_][A-Za-z0-9_]*$/;function r(e){if(!t.test(e))throw new TypeError(`credential ref "${e}" must match ${String(t)}`);return e}export{r as credentialRef};
