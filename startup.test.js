const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');

for (const primary of [false, true]) {
  test(primary ? '主实例注册窗口初始化' : '重复启动退出且不注册窗口初始化', () => {
    let quits = 0, readyCallbacks = 0;
    const app = {
      setName() {}, setAppUserModelId() {}, setPath() {}, on() {},
      getPath: () => __dirname,
      requestSingleInstanceLock: () => primary,
      exit: code => { assert.equal(code, 0); quits++; },
      whenReady: () => ({ then: () => { readyCallbacks++; } }),
    };
    const fakeFs = {
      mkdirSync() {}, writeFileSync() {}, unlinkSync() {},
      readFileSync: () => '{}',
    };
    const load = name => name === 'electron' ? { app } : name === 'node:fs' ? fakeFs : require(name);
    new Function('require', '__dirname', source)(load, __dirname);
    assert.equal(quits, primary ? 0 : 1);
    assert.equal(readyCallbacks, primary ? 1 : 0);
  });
}
