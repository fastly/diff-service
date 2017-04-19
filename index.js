const fs = require('fs');
const path = require('path');
const url = require('url');
const zlib = require('zlib');

const exec = require('child-process-promise').exec;
const isValidURL = require('valid-url').isUri;
const mkDir = require('mkdirp-promise');
const fetch = require('node-fetch');

const DEFAULT_TTL = 3600;
const MAX_SOURCE_SIZE = 10 * 1024 * 1024;

exports.compareURLs = function compareURLs (req, res) {

  const jobid = Math.random().toString(36).substring(10);
  const paths = {
    from: path.join('jobs', jobid, 'from'),
    to: path.join('jobs', jobid, 'to'),
    patch: path.join('jobs', jobid, 'patch')
  };

  Promise.resolve()
    .then(() => Promise.all([mkDir(paths.from), mkDir(paths.to)]))
    .then(() => Promise.all(['from', 'to'].map(param => {

      if (!(param in req.query)) throw new Error('`' + param + '` is a required query parameter');
      if (!isValidURL(req.query[param])) throw new Error('Value supplied in `' + param + '` does not look like a valid URL');

      console.log('Starting download of ' + req.query[param]);

      return fetch(req.query[param])
        .then(resp => {

          console.log('Receiving ' + req.query[param]);

          if (resp.headers.get('content-length') > MAX_SOURCE_SIZE) {
            throw new Error('Source size too large.  Maximum source size is ' + MAX_SOURCE_SIZE + ' bytes');
          }

          const meta = {};
          meta.jobid = jobid;
          meta.name = url.parse(req.query[param]).pathname.replace(/^.*\/([^\/]+)\/?$/, '$1');
          meta.path = path.join(paths[param], meta.name);

          const isCompressed = resp.headers.get('Content-Encoding') === 'gzip' || meta.name.match(/\.(tgz|gz|gzip)$/);
          const pipe = isCompressed ?  resp.body.pipe(zlib.createGunzip()) : resp.body;

          console.log('Streaming to '+meta.path, isCompressed);
          pipe.pipe(fs.createWriteStream(meta.path));

          if (resp.headers.get('cache-control').indexOf('max-age') !== -1) {
            meta.ttl = Number.parseInt(resp.headers.get('cache-control').replace(/^.*max-age=(\d+).*?$/, '$1'), 10);
          } else if (resp.headers.get('cache-control').indexOf('s-maxage') !== -1) {
            meta.ttl = Number.parseInt(resp.headers.get('cache-control').replace(/^.*s-maxage=(\d+).*?$/, '$1'), 10);
          } else if (resp.headers.get('surrogate-control').indexOf('max-age') !== -1) {
            meta.ttl = Number.parseInt(resp.headers.get('surrogate-control').replace(/^.*max-age=(\d+).*?$/, '$1'), 10);
          } else {
            meta.ttl = DEFAULT_TTL;
          }

          meta.surrogateKey = resp.headers['surrogate-key'] || null;

          return new Promise(resolve => resp.body.on('finish', resolve.bind(null, meta)));
        })
      ;
    })))

    // Create patch and serve it
    .then(([from, to]) => {
      console.log('Computing patch...');
      return exec('./bsdiff ' + from.path + ' ' + to.path + ' ' + paths.patch)
        .then(() => {
          res.status(200);
          res.set('Cache-Control', 'max-age=' + Math.min(from.ttl, to.ttl));
          if (from.surrogateKey || to.surrogateKey) {
            res.set('Surrogate-Key', from.surrogateKey + ' ' + to.surrogateKey);
          }
          console.log("Sending patch file...");
          res.sendFile(path.resolve(paths.patch));
        })
      ;
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
