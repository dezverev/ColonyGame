const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('../server/config');

const PUBLIC = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
};

function createHandler() {
  return (req, res) => {
    const url = req.url.split('?')[0]; // strip query string
    const filePath = path.join(PUBLIC, url === '/' ? 'index.html' : url);

    const ext = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    });
  };
}

/**
 * Start static file server. Returns { port, close() }.
 * Pass port: 0 for an OS-assigned ephemeral port.
 */
function startStaticServer(options = {}) {
  const port = options.port != null ? options.port : config.CLIENT_PORT;
  return new Promise((resolve) => {
    const server = http.createServer(createHandler());
    server.listen(port, () => {
      const actualPort = server.address().port;
      if (!options.silent) {
        console.log(`[static] Serving ${PUBLIC} on http://localhost:${actualPort}`);
      }
      resolve({
        port: actualPort,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

// If run directly (not required), start on default port
if (require.main === module) {
  startStaticServer();
}

module.exports = { startStaticServer };
