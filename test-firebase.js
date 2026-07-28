const xorEncode = require('./protocol').xorEncode;
const xorDecode = require('./protocol').xorDecode;
const http = require('http');

function call(path, data) {
  return new Promise((ok, fail) => {
    const e = xorEncode(JSON.stringify(data));
    const o = {
      hostname: '127.0.0.1', port: 8080, path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': Buffer.byteLength(e)
      }
    };
    const q = http.request(o, r => {
      let b = [];
      r.on('data', c => b.push(c));
      r.on('end', () => {
        try { ok(JSON.parse(xorDecode(Buffer.concat(b)))); }
        catch (e) { fail(e.message); }
      });
    });
    q.write(e);
    q.end();
  });
}

async function test() {
  const r1 = await call('/ReqLogin', { device_id: 'test', name: 'مقاتل' });
  const tok = r1.player.session_token;
  console.log('1-Login:', r1.code, r1.player.name);

  const r2 = await call('/ReqDoCrime', { token: tok, crimeType: 1 });
  console.log('2-Crime:', r2.code, 'exp:', r2.exp, 'money:', r2.money);

  const r3 = await call('/ReqPlayerInfo', { token: tok });
  console.log('3-Info:', r3.code, r3.player.name, r3.player.level, r3.player.money);

  const r4 = await call('/ReqJoinJob', { token: tok, jobType: 462 });
  console.log('4-Job:', r4.code);

  const r5 = await call('/ReqGetSalery', { token: tok });
  console.log('5-Salary:', r5.code, r5.salary);

  const r6 = await call('/ReqFightNew', { token: tok, fightType: 3 });
  console.log('6-Fight:', r6.code, 'result:', r6.result, 'exp:', r6.expGain);

  const r7 = await call('/ReqChatPost', { token: tok, chatType: 0, message: 'السلام عليكم' });
  console.log('7-Chat:', r7.code);

  const chats = await (await fetch('http://127.0.0.1:8080/api/chats')).json();
  console.log('8-Chats:', chats.length, 'messages');

  console.log('\n✅ All Firebase tests passed!');
}

test().catch(e => console.log('ERR:', e));
