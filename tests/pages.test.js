import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeBase,assetURL} from '../src/paths.js';
import {PUBLIC_SITE,shareURL,receiveShare} from '../src/share.js';
test('GitHub子路径下分享往返，片段不发送至服务器',()=>{
 const url=shareURL(PUBLIC_SITE,'study book study & run');
 assert.equal(new URL(url).pathname,'/wordbook-fresh/');assert.equal(new URL(url).search,'');
 assert.deepEqual(receiveShare(url).words,['study','book','run']);
});
test('静态资源路径和非法基础路径',()=>{
 assert.equal(assetURL('/dict/st.json','/wordbook-fresh/'),'/wordbook-fresh/dict/st.json');
 for(const base of ['wordbook-fresh','/foo','https://example.org/','/../'])assert.throws(()=>normalizeBase(base));
});
test('快捷指令教程使用正式地址及可执行的配置步骤',()=>{
 const guide=readFileSync(new URL('../public/iphone-guide.html',import.meta.url),'utf8');
 assert.ok(guide.includes(shareURL(PUBLIC_SITE,'')));assert.ok(!guide.includes('127.0.0.1'));
 for(const text of ['共享表单','URL','确认','OCR'])assert.ok(guide.includes(text));
});
test('添加页真实教程和复制正式地址动作均接入',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 assert.ok(app.includes('从其他App收藏'));assert.ok(app.includes('iphone-guide.html'));
 assert.ok(app.includes('shareURL(PUBLIC_SITE, "")')||app.includes('shareURL(PUBLIC_SITE,"")'));
});
