// Electron net 的最小 Node 替代实现（仅供 PWA 后端复用目录抓取逻辑）。
// 只覆盖 catalog.js 用到的 surface：net.request().on('response'|'error'|'login') + abort/end。
const { EventEmitter } = require('node:events');
const axios = require('axios');

function request({ url, headers = {} } = {}) {
  const emitter = new EventEmitter();
  let aborted = false;
  let controller = null;

  emitter.abort = () => {
    aborted = true;
    controller?.abort();
  };

  emitter.end = () => {
    controller = new AbortController();
    axios({
      url,
      method: 'GET',
      responseType: 'stream',
      headers,
      signal: controller.signal,
      timeout: 20000,
      maxRedirects: 5,
      validateStatus: () => true,
    }).then((response) => {
      if (aborted) { response.data.destroy(); return; }
      const stream = response.data;
      const res = new EventEmitter();
      res.statusCode = response.status;
      res.headers = response.headers || {};
      stream.on('data', (chunk) => res.emit('data', chunk));
      stream.on('end', () => res.emit('end'));
      stream.on('error', (error) => res.emit('error', error));
      stream.on('aborted', () => res.emit('aborted'));
      emitter.emit('response', res);
    }).catch((error) => {
      if (!aborted) emitter.emit('error', error);
    });
  };

  return emitter;
}

module.exports = { net: { request } };
