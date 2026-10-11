import { escapeHtml } from "../../shared/render-email.js";

const css = `
@font-face{font-family:Inter;src:url('/fonts/inter-latin.woff2') format('woff2');font-weight:400 700;font-display:swap}
@font-face{font-family:Switzer;src:url('/fonts/switzer-600.woff2') format('woff2');font-weight:600;font-display:swap}
:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;color:#f0f0f5;background:#0b0c0f;-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;background:radial-gradient(80% 60% at 10% 0%,rgba(137,66,20,.22),transparent 70%);font-size:15px;line-height:1.65}
main{width:min(100% - 40px,720px);margin:0 auto;padding:72px 0 48px}
h1,h2{font-family:Switzer,Inter,system-ui,sans-serif;font-weight:600;text-wrap:balance;overflow-wrap:anywhere}
h1{font-size:36px;line-height:1.2;letter-spacing:-.035em;margin:0 0 16px}
h2{font-size:20px;line-height:1.4;margin:0 0 12px}
p{color:#aeaeb2;text-wrap:pretty;margin:0 0 24px}
a{color:#ffa457;text-underline-offset:4px}
a:hover{color:#ffc796}
form{margin:28px 0 40px;padding:24px;background:rgba(255,255,255,.04);border-radius:12px}
label{display:block;font-size:13px;font-weight:500;margin-bottom:8px}
input,button{font:inherit;border:0;border-radius:9px;min-height:44px}
input{padding:10px 14px;background:rgba(255,255,255,.07);color:#f5f5f7;width:100%;margin-bottom:12px;font-size:16px}
input::placeholder{color:#98989d}
button{padding:10px 20px;background:#f48120;color:#211307;cursor:pointer;font-size:14px;font-weight:500;transition:background-color .15s}
button:hover{background:#ff963e}
a:focus-visible,input:focus-visible,button:focus-visible{outline:2px solid #ffa457;outline-offset:3px}
small{color:#98989d;font-size:12px}
.archive-heading{margin-top:40px}
.archive-empty{padding:24px;background:rgba(255,255,255,.04);border-radius:12px}
article{padding:24px 0}
article h2{margin:6px 0 8px}
article p{margin-bottom:0}
.archive-message{color-scheme:light;color:#252c32;background:#fff;border-radius:12px;overflow:auto;margin-top:24px}
.archive-message p{color:inherit}
img{max-width:100%;height:auto}
footer{margin-top:48px;color:#98989d;font-size:12px}
.back-link{display:inline-flex;min-height:36px;align-items:center;margin-bottom:20px;font-size:13px;text-decoration:none}
@media(max-width:600px){main{width:calc(100% - 36px);padding-top:40px}h1{font-size:30px}form{padding:20px}button{width:100%}}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
`;

export function page(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b0c0f"><title>${escapeHtml(title)}</title><style>${css}</style></head><body><main>${body}<footer>Mailcheap</footer></main></body></html>`;
}
