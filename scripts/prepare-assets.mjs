import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const manifest=JSON.parse(await readFile('resources/static-assets.json','utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
let complete=true;
for(const f of manifest.files){try{if(hash(await readFile('public/'+f.path))!==f.sha256)complete=false;}catch{complete=false;}}
if(complete){console.log('Public dictionary/OCR assets verified');process.exit(0);}
const parts=await Promise.all(manifest.parts.map(async p=>{const b=await readFile('resources/'+p.name);if(hash(b)!==p.sha256)throw Error('Asset part checksum failed: '+p.name);return b;}));
const archive=Buffer.concat(parts);
if(hash(archive)!==manifest.sha256)throw Error('Asset archive checksum failed');
await mkdir('.asset-cache',{recursive:true});
const path='.asset-cache/static-assets.tar.gz';await writeFile(path,archive);
const names=execFileSync('tar',['-tzf',path],{encoding:'utf8'}).trim().split('\n');
const allowed=new Set(manifest.files.map(f=>f.path));
if(names.length!==allowed.size||names.some(p=>!allowed.has(p)||p.includes('..')||! /^(dict|ocr)\//.test(p)))throw Error('Unexpected archive path');
execFileSync('tar',['-xzf',path,'-C','public']);
for(const f of manifest.files)if(hash(await readFile('public/'+f.path))!==f.sha256)throw Error('Extracted asset checksum failed: '+f.path);
await rm('.asset-cache',{recursive:true,force:true});
console.log('Restored and verified '+manifest.files.length+' public assets');
