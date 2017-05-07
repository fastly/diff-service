const url = require('url');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const isValidURL = require('valid-url').isUri;
const fetch = require('node-fetch');
const exec = require('child-process-promise').exec;

const DEFAULT_TTL = 3600;
const MAX_SOURCE_SIZE = 100 * 1024 * 1024;
const TMP_FS_PATH = "/tmp";

exports.compareURLs = function compareURLs (req, res) {

  Promise.resolve()
    .then(() => {
      return Promise.all(['from', 'to'].map(param => {

        if (!(param in req.query)) throw new Error('`' + param + '` is a required query parameter');
        if (!isValidURL(req.query[param])) throw new Error('Value supplied in `' + param + '` does not look like a valid URL');

        return fetch(req.query[param])
          .then(resp => {

            if (resp.headers.get('content-length') > MAX_SOURCE_SIZE) {
              throw new Error('Source size too large.  Maximum source size is ' + MAX_SOURCE_SIZE + ' bytes');
            }

            const meta = {};
            meta.name = url.parse(req.query[param]).pathname.replace(/^.*\/([^\/]+)\/?$/, '$1');

            const isCompressed = Boolean(resp.headers.get('Content-Encoding') === 'gzip' || meta.name.match(/\.(tgz|gz|gzip)$/));
            const respStream = isCompressed ?  resp.body.pipe(zlib.createGunzip()) : resp.body;

            console.log('Receiving ' + req.query[param], isCompressed ? "compressed":"", resp.headers.get('content-length'));

            const cacheHeader = resp.headers.get('cache-control') || '';
            const surrHeader = resp.headers.get('surrogate-control') || '';
            if (cacheHeader.indexOf('max-age') !== -1) {
              meta.ttl = Number.parseInt(cacheHeader.replace(/^.*max-age=(\d+).*?$/, '$1'), 10);
            } else if (cacheHeader.indexOf('s-maxage') !== -1) {
              meta.ttl = Number.parseInt(cacheHeader.replace(/^.*s-maxage=(\d+).*?$/, '$1'), 10);
            } else if (surrHeader.indexOf('max-age') !== -1) {
              meta.ttl = Number.parseInt(surrHeader.replace(/^.*max-age=(\d+).*?$/, '$1'), 10);
            } else {
              meta.ttl = DEFAULT_TTL;
            }

            meta.surrogateKey = resp.headers.get('surrogate-key') || null;

            respStream.pipe(fs.createWriteStream(path.join(TMP_FS_PATH, param)));
            return new Promise(resolve => respStream.on('finish', resolve.bind(null, meta)));
          })
        ;
      }))
    })

    // Create patch and serve it
    .then(([from, to]) => {
      console.log('Computing patch of ' + from.name + ' and ' + to.name);
      const frompath = path.join(TMP_FS_PATH, 'from');
      const topath = path.join(TMP_FS_PATH, 'to');
      const patchpath = path.join(TMP_FS_PATH, 'patch');
      const cmd = "./bsdiff-gcp "+frompath+" "+topath+" "+patchpath;
      return exec(cmd).then(result => {
        console.log(result);
        res.status(200);
        res.set('Cache-Control', 'max-age=' + Math.min(from.ttl, to.ttl));
        res.set('Content-Type', 'application/octet-stream');
        if (from.surrogateKey || to.surrogateKey) {
          res.set('Surrogate-Key', from.surrogateKey + ' ' + to.surrogateKey);
        }
        console.log("Sending patch file...");
        res.sendFile(patchpath);
      });
    })

    // In error cases, just redirect so the client downloads the destination file in full
    .catch (e => {
      console.log(e.stack || e.message || e);
      res.set('Diff-Engine-Status', e.message || e);
      if (req.query.to) {
        res.status(307);
        res.set('Location', req.query.to);
      } else {
        res.status(400);
      }
      return res.end(e.stack || e.message || e);
    })
  ;
};

exports.healthcheck = function healthcheck (req, res) {
  res.status(200).end("OK");
};
