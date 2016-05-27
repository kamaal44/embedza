'use strict';


const assert   = require('assert');
const Embedza  = require('..');
const nock     = require('nock');


describe('API', function () {

  it('.addFetcher()', function (done) {
    let embedza = new Embedza();

    embedza.addFetcher({
      id: 'test-fetcher',
      priority: -999,
      fn: function (env, callback) {
        callback('test fetcher error');
      }
    });

    embedza.addDomain('example.org');

    embedza.render('http://example.org/12345', 'block', function (err) {
      assert.strictEqual(err, 'test fetcher error');
      done();
    });
  });


  it('.addMixin()', function (done) {
    let embedza = new Embedza();

    embedza.addMixin({
      id: 'test-mixin',
      fn: function (env, callback) {
        callback('test mixin error');
      }
    });

    // Mock `.request`
    embedza.request = function (url, opt, callback) {
      if (!callback) {
        callback = opt;
        opt = null;
      }

      callback(null, { statusCode: 200 }, '{}');
    };

    embedza.render('https://vimeo.com/channels/staffpicks/135373919', 'block', function (err) {
      assert.strictEqual(err, 'test mixin error');
      done();
    });
  });


  it('.addMixinAfter()', function (done) {
    let embedza = new Embedza();

    embedza.addMixinAfter({
      id: 'test-mixin-after',
      fn: function (env, callback) {
        callback('test mixin after error');
      }
    });

    // Mock `.request`
    embedza.request = function (url, opt, callback) {
      if (!callback) {
        callback = opt;
        opt = null;
      }

      callback(null, { statusCode: 200 }, '{}');
    };

    embedza.render('https://vimeo.com/channels/staffpicks/135373919', 'block', function (err) {
      assert.strictEqual(err, 'test mixin after error');
      done();
    });
  });


  it('.rule()', function () {
    let embedza = new Embedza();

    embedza.addDomain('test.com');

    let rule = embedza.rule('test.com');

    assert.ok(rule.enabled);
    assert.strictEqual(rule.id, 'test.com');
  });


  it('.forEach() - disable domain', function (done) {
    let embedza = new Embedza();

    embedza.forEach(function (domain) {
      if (domain.id === 'youtube.com') {
        domain.enabled = false;
      }
    });

    // Mock `.request`
    embedza.request = function (url, opt, callback) {
      if (!callback) {
        callback = opt;
        opt = null;
      }

      callback(null, { statusCode: 200 }, '{}');
    };

    embedza.info('https://www.youtube.com/watch?v=jNQXAC9IVRw', function (err, res) {
      if (err) {
        done(err);
        return;
      }

      assert.equal(res, null);

      embedza.info('https://vimeo.com/channels/staffpicks/135373919', function (err, res) {
        if (err) {
          done(err);
          return;
        }

        assert.strictEqual(res.src, 'https://vimeo.com/channels/staffpicks/135373919');
        done();
      });
    });
  });


  describe('.addDomain()', function () {

    it('.addDomain() with domain name', function (done) {
      let embedza = new Embedza();

      // Mock `.request`
      embedza.request = function (url, opt, callback) {
        if (!callback) {
          callback = opt;
          opt = null;
        }

        callback(null, { statusCode: 200 }, '');
      };

      embedza.info('https://example.com/', function (err, res) {
        if (err) {
          done(err);
          return;
        }

        assert.equal(res, null);

        embedza.addDomain('example.com');

        embedza.info('https://example.com/', function (err, res) {
          if (err) {
            done(err);
            return;
          }

          assert.strictEqual(res.src, 'https://example.com/');
          done();
        });
      });
    });


    it('.addDomain() disabled', function () {
      let embedza = new Embedza({ enabledProviders: [ 'test.com', 'youtube.com' ] });

      embedza.addDomain('example.com');

      return embedza.info('https://example.com/asd')
        .then(res => {
          assert.equal(res, null);
        });
    });


    it('.addDomain() with options', function (done) {
      let embedza = new Embedza();
      let server = nock('https://example.com')
        .get('/asd')
        .reply(200, `
          <head>
            <meta name="twitter:image" content="https://example.com/123.jpg">
            <meta name="twitter:image:width" content="222">
            <meta name="twitter:image:height" content="333">
          </head>
        `);

      embedza.addDomain({
        id: 'example.com',
        match: /^https?:\/\/example.com\/.*/,
        fetchers: [
          'meta',
          function (env, cb) {
            env.result.fetchersExtraTest1 = true;
            cb();
          },
          {
            fn: function (env, cb) {
              env.result.fetchersExtraTest2 = true;
              cb();
            },
            priority: 0
          }
        ],
        mixins: [
          'twitter-thumbnail',
          function (env, cb) {
            env.result.mixinsExtraTest = true;
            cb();
          }
        ],
        mixinsAfter: [
          'ssl-force',
          function (env, cb) {
            env.result.mixinsAfterExtraTest = true;
            cb();
          }
        ]
      });

      embedza.info('https://example.com/asd', function (err, res) {
        if (err) {
          done(err);
          return;
        }

        assert.deepEqual(res.snippets, [ {
          type: 'image',
          href: 'https://example.com/123.jpg',
          tags: [ 'thumbnail', 'twitter', 'ssl' ],
          media: { width: 222, height: 333 }
        } ]);

        assert.ok(res.fetchersExtraTest1);
        assert.ok(res.fetchersExtraTest2);
        assert.ok(res.mixinsExtraTest);
        assert.ok(res.mixinsAfterExtraTest);

        server.done();
        done();
      });
    });
  });


  describe('.info()', function () {
    it('from cache', function () {
      let embedza = new Embedza({
        cache: { get: (__, cb) => { cb(null, { info: { foo: 'bar' } }); } },
        enabledProviders: [ 'test.com' ]
      });

      return embedza.info('http://test.com/bla')
        .then(res => {
          assert.deepStrictEqual(res, { foo: 'bar' });
        });
    });


    it('from cache with error', function () {
      let embedza = new Embedza({
        cache: { get: (__, cb) => { cb('err'); } },
        enabledProviders: [ 'test.com' ]
      });

      return embedza.info('http://test.com/bla')
        .catch(err => {
          assert.strictEqual(err, 'err');
        });
    });


    it('bad url', function () {
      let embedza = new Embedza();

      return embedza.info('badurl')
        .then(res => {
          assert.ok(!res);
        });
    });
  });


  describe('.render()', function () {
    it('inline', function () {
      let embedza = new Embedza({ enabledProviders: [ 'example.com' ] });
      let server = nock('https://example.com')
        .get('/asd')
        .reply(200, '<head><meta name="title" value="test"></head>');

      return embedza.render('https://example.com/asd', 'inline')
        .then(res => {
          assert.strictEqual(
            res.html,
            '<a class="ez-domain-example_com ez-inline" target="_blank" ' +
            'href="https://example.com/asd" rel="nofollow">test</a>'
          );
          server.done();
        });
    });


    it('not enough data', function () {
      let embedza = new Embedza({ enabledProviders: [ 'example.com' ] });
      let server = nock('https://example.com')
        .get('/asd')
        .reply(200, '');

      return embedza.render('https://example.com/asd', [ 'player', 'rich', 'test' ])
        .then(res => {
          assert.ok(!res);
          server.done();
        });
    });


    it('inline with info', function () {
      let embedza = new Embedza();

      return embedza.render({ domain: 'a', src: 'b', meta: { title: 'c' } }, 'inline')
        .then(res => {
          assert.strictEqual(
            res.html,
            '<a class="ez-domain-a ez-inline" target="_blank" href="b" rel="nofollow">c</a>'
          );
        });
    });


    it('bar url', function () {
      let embedza = new Embedza({ enabledProviders: [ 'badurl.badurl' ] });

      return embedza.render('http://badurl.badurl/asd', 'inline')
        .catch(err => {
          assert.strictEqual(err.message, 'getaddrinfo ENOTFOUND badurl.badurl badurl.badurl:80');
        });
    });
  });
});
