import http from 'node:http';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../src/local-drive/',import.meta.url),routes=new Map([['/',['index.html','text/html']],['/bridge.js',['bridge.js','text/javascript']],['/Store.js',['Store.js','text/javascript']]]);
const server=http.createServer((req,res)=>{
 if(!['127.0.0.1:8765','localhost:8765'].includes(req.headers.host)||req.method!=='GET'){res.writeHead(403);res.end();return;}
 const route=routes.get(new URL(req.url,'http://127.0.0.1:8765').pathname);if(!route){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':route[1]+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; connect-src 'none'"});res.end(fs.readFileSync(fileURLToPath(new URL(route[0],root))));
});
server.listen(8765,'127.0.0.1',()=>console.log('SimuLine local folder helper: http://127.0.0.1:8765\nKeep this process running. Select Connect local Drive folder in the app Settings.'));
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Port 8765 is in use. Stop the previous helper or use its existing window.':error.message);process.exitCode=1;});
