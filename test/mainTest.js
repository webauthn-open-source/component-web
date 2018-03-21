"use strict";

var turnOnDebugLogging = false;

var WebComponent = require("../index.js");
var Component = require("component-class");
var assert = require("chai").assert;
var request = require('supertest');

var dummyComponentManager = {
    registerType: function() {},
    getType: function() {},
    register: function() {},
    get: function(name) {
        if (name === "logger") return dummyLogger;
        if (name === "cert-manager") return dummyCertManager;
    },
    clear: function() {},
    config: function() {},
    init: function() {},
    shutdown: function() {},
    componentList: new Map(),
    typeList: new Map()
};

var dummyLogger = {
    create: function() {
        return new Proxy(function() {}, {
            get: function() {
                return function(...msg) {
                    if (turnOnDebugLogging) console.log(...msg);
                };
            },
        });
    }
};

var fs = require("fs");
var dummyCertManager = {
    config: function() {
        return {
            cert: fs.readFileSync("test/helpers/certs/cert.pem", "utf8"),
            key: fs.readFileSync("test/helpers/certs/key.pem", "utf8")
        };
    }
};

describe("web component", function() {
    it("can be created", function() {
        var wc = new WebComponent(dummyComponentManager);
        assert.instanceOf(wc, Component);
    });

    it("can init and shutdown", function() {
        var wc = new WebComponent(dummyComponentManager);
        var res = wc.init();
        assert.isUndefined(res);
        res = wc.shutdown();
        assert.isUndefined(res);
    });
});

describe("web component routes", function() {
    var wc;

    beforeEach(function() {
        wc = new WebComponent(dummyComponentManager);
        wc.defaultPort = 8080; // probably not running as root, so don't use port 80
    });

    afterEach(function() {
        wc.shutdown();
    });

    it("can serve static data", function(done) {
        wc.init();
        wc.addStatic({
            path: "/",
            dir: "test/helpers/static"
        });

        request(wc.app)
            .get("/index.html")
            .expect(200, "<html>hi</html>", function(err) {
                if (err) throw err;
                done();
            });
    });

    it("can add static routes before init", function(done) {
        wc.addStatic({
            path: "/",
            dir: "test/helpers/static"
        });
        wc.init();

        request(wc.app)
            .get("/index.html")
            .expect(200, "<html>hi</html>", function(err) {
                if (err) throw err;
                done();
            });
    });

    it("can serve dynamic data", function(done) {
        wc.init();
        wc.addDynamic({
            path: "/",
            method: "get",
            fn: function(req, res) {
                res.send("hi");
            }
        });

        request(wc.app)
            .get("/")
            .expect(200, "hi", function(err) {
                if (err) throw err;
                done();
            });
    });

    it("can add dynamic routes before init", function(done) {
        wc.addDynamic({
            path: "/",
            method: "get",
            fn: function(req, res) {
                res.send("hi");
            }
        });
        wc.init();

        request(wc.app)
            .get("/")
            .expect(200, "hi", function(err) {
                if (err) throw err;
                done();
            });
    });

    it("can serve multiple static and dynamic routes");

    it("can redirect to https", function(done) {
        wc.setRedirect({
            destProtocol: "https"
        });
        wc.init();

        request("http://localhost:8080")
            .get("/")
            .expect(301)
            .expect("Location", "https://localhost/")
            .end(function(err, res) {
                if (err) throw err;
                done();
            });
    });

    it("can redirect after init", function(done) {
        wc.init();
        wc.setRedirect({
            destProtocol: "https"
        });

        request("http://localhost:8080")
            .get("/")
            .expect(301)
            .expect("Location", "https://localhost/")
            .end(function(err, res) {
                if (err) throw err;
                done();
            });
    });

    it("can redirect to https:port", function(done) {
        wc.setRedirect({
            destProtocol: "https",
            destPort: 8443
        });
        wc.init();

        request("http://localhost:8080")
            .get("/")
            .expect(301)
            .expect("Location", "https://localhost:8443/")
            .end(function(err, res) {
                if (err) throw err;
                done();
            });
    });

    it("can redirect to new host", function(done) {
        wc.setRedirect({
            destHost: "google.com",
            destProtocol: "https",
            destUrl: "/"
        });
        wc.init();

        request("http://localhost:8080")
            .get("/google")
            .expect(301)
            .expect("Location", "https://google.com/")
            .end(function(err) {
                if (err) throw err;
                done();
            });
    });

    it("can serve static and redirect everything else", function(done) {
        wc.addStatic({
            path: "/static",
            dir: "test/helpers/static"
        });
        wc.setRedirect({
            destProtocol: "https"
        });
        wc.init();

        request("http://localhost:8080")
            .get("/static/index.html")
            .expect(200, "<html>hi</html>")
            .end((err) => {
                if (err) throw err;
                request("http://localhost:8080")
                    .get("/foo.html")
                    .expect(301)
                    .expect("Location", "https://localhost/foo.html")
                    .end((err) => {
                        if (err) throw err;
                        done();
                    });
            });
    });

    it("redirects based on source host", function(done) {
        wc.setRedirect({
            destProtocol: "https",
            matchHost: /localhost/
        });
        wc.init();

        request("http://localhost:8080")
            .get("/")
            .expect(301)
            .expect("Location", "https://localhost/")
            .end(function(err, res) {
                if (err) throw err;
                done();
            });
    });

    it("doesn't redirect if source host doesn't match", function(done) {
        wc.setRedirect({
            destProtocol: "https",
            matchHost: /google\.com/
        });
        wc.addStatic({
            path: "/",
            dir: "test/helpers/static"
        });
        wc.init();

        request("http://localhost:8080")
            .get("/")
            .expect(200, "<html>hi</html>")
            .end(function(err, res) {
                if (err) throw err;
                done();
            });
    });


    it("redirects based on source url");
    it("redirects based on source function");

    it("can serve a route and redirect everything else");

    it("can set port", function(done) {
        wc.addStatic({
            path: "/",
            dir: "test/helpers/static"
        });
        wc.setPort(7777);
        wc.init();

        request("http://localhost:7777")
            .get("/index.html")
            .expect(200, "<html>hi</html>", function(err) {
                if (err) throw err;
                done();
            });
    });

    it("can get port", function() {
        var ret = wc.getPort();
        assert.isUndefined(ret);
        wc.setPort(7777);
        ret = wc.getPort();
        assert.isNumber(ret);
        assert.strictEqual(ret, 7777);
    });

    it("throws if setting port after server started", function() {
        wc.init();
        assert.throws(function() {
            wc.setPort(7777);
        }, Error, "can't set port after server has started");
    });

    it("throws on bad port number");

    it("can set domain", function() {
        wc.setDomain("example.com");
    });

    it("can get domain", function() {
        var ret = wc.getDomain();
        assert.isUndefined(ret);
        wc.setDomain("example.com");
        ret = wc.getDomain();
        assert.strictEqual(ret, "example.com");
    });

    it("throws if setting domain after server started", function() {
        wc.init();
        assert.throws(function() {
            wc.setDomain("example.com");
        }, Error, "can't set domain after server has started");
    });


    it("can set https", function(done) {
        this.slow(150);
        wc.addStatic({
            path: "/",
            dir: "test/helpers/static"
        });
        wc.setHttps(true);
        wc.setPort(8443);
        // for the self signed cert...
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        wc.init();

        request("https://localhost:8443")
            .get("/index.html")
            .expect(200, "<html>hi</html>")
            .end(function(err) {
                if (err) throw err;
                done();
            });
    });

    it("can get protocol", function() {
        wc.addStatic({
            path: "/",
            dir: "test/helpers/static"
        });
        var ret = wc.getProtocol();
        assert.strictEqual(ret, "http");

        wc.setHttps(true);
        ret = wc.getProtocol();
        assert.strictEqual(ret, "https");
    });

    it("https throws if called after init");
    it("can run two instances at the same time");

    it("can set body parser to JSON");
    it("can set body parser to raw");
    it("can set body parser to text");
    it("can set body parser to url encoded");
    it("throws if POST and no body parser (?)");
    it("can set session");
});