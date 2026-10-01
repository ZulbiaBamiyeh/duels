// Turns the single-file build into an HTML fragment (no <html>/<head>/<body> wrappers),
// for hosts that supply their own document skeleton.
import fs from 'node:fs';
const src = fs.readFileSync('dist-single/index.html', 'utf8');
const head = src.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta (charset|name="viewport")[^>]*>\s*/g, '');
const body = src.match(/<body>([\s\S]*?)<\/body>/)[1];
fs.writeFileSync('dist-single/fragment.html', `${head.trim()}\n${body.trim()}\n`);
console.log('wrote dist-single/fragment.html');
