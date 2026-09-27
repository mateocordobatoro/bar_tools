// Local-only visual fixture renderer. No Supabase client, .env, cookie or RPC access.
// Static SSR of the actual workspace; production buttons deliberately have no handlers.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {stateFor} from './mobile-fixtures.mjs';
const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(path,mocks={}){const js=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;const module={exports:{}};vm.runInNewContext(`(function(require,module,exports){${js}\n})`,{Intl,crypto})(n=>n in mocks?mocks[n]:require(n),module,module.exports);return module.exports;}
const model=load('lib/bartender/model.ts');
const pages=['prep','simple','missing','multi','run','blocked','progress','stock','changed','session','pending','saving'];
const server=createServer((req,res)=>{
 if(req.method!=='GET'||req.headers.host!=='127.0.0.1:3107'){res.writeHead(403);res.end();return;}
 const page=new URL(req.url,'http://127.0.0.1:3107').pathname.slice(1)||'prep';
 if(!pages.includes(page)){res.writeHead(404);res.end();return;}
 const Component=load('app/bartender/workspace.tsx',{'@/lib/bartender/model':model,'@/lib/bartender/use-workspace':{useWorkspace:()=>stateFor(page)}}).default;
 const html=renderToStaticMarkup(React.createElement(Component,{staffId:'local-fixture'}));
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"});
 res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mobile review — ${page}</title><style>${css}</style><body><main class="bartender-shell"><header class="work-header"><div><div class="eyebrow">BarThings · Bartender</div><h1>Prep workspace</h1><small>Local synthetic fixture · no writes</small></div><button class="secondary">Sign out</button></header>${html}</main><footer style="padding:16px">Review fixtures: ${pages.map(p=>`<a style="display:inline-block;padding:12px" href="/${p}">${p}</a>`).join(' ')}</footer></body></html>`);
});
server.listen(3107,'127.0.0.1',()=>console.log('Read-only mobile fixtures: http://127.0.0.1:3107/prep (no hosted access)'));
