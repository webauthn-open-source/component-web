"use strict";

var express = require("express");
var Component = require("component-class");
var https = require("https");
var http = require("http");
var log;

var bodyParser = require("body-parser");
var session = require("express-session");

module.exports = class ComponentWeb extends Component {
    constructor(cm) {
        super(cm);

        // this.webdir = path.join(__dirname, "../webauthn-yubiclone");

        this.addFeature("add-static", this.addStatic);
        this.addFeature("add-dynamic", this.addDynamic);
        this.addFeature("set-port", this.setPort);
        this.addFeature("get-port", this.getPort);
        this.addFeature("set-domain", this.setDomain);
        this.addFeature("get-domain", this.getDomain);
        this.addFeature("set-https", this.setHttps);
        this.addFeature("get-protocol", this.getProtocol);
        this.addFeature("set-redirect", this.setRedirect);
        this.addFeature("set-body-parser", this.setBodyParser);
        this.addFeature("set-enable-session", this.setEnableSession);

        // an Express instance
        this.app = express();

        // no server yet
        this.server = null;

        // default port
        this.defaultPort = 80;
        this.https = false;

        // security
        this.enableSecurity = true;

        this.addDependency("logger");
    }

    init() {
        var logger = this.cm.get("logger");
        if (logger === undefined) {
            throw new Error("logger component not found");
        }
        log = logger.create("ComponentWeb");

        // start express
        log.debug("Starting web server...");

        // set security middleware
        if (this.enableSecurity) {
            let helmet = require("helmet"); // eslint-disable-line global-require
            this.app.use(helmet());
        }

        // set body parser
        switch (this.bodyParserType) {
            case undefined:
                break;
            case "json":
                this.app.use(bodyParser.json());
                break;
            case "raw":
                this.app.use(bodyParser.raw());
                break;
            case "text":
                this.app.use(bodyParser.text());
                break;
            case "url-encoded":
                this.app.use(bodyParser.urlencoded());
                break;
            default:
                throw new Error("unknown body parser type: " + this.bodyParserType);
        }

        if (this.sessionEnabled) {
            this.app.use(session({
                name: "session",
                // TODO: get a secret from the config.json
                secret: Math.random().toString(36).substr(2),
                saveUninitialized: true,
                resave: true,
                // duration, activeDuration, maxAge could probably use some thinking...
                // ...and maybe config options
                duration: 30 * 60 * 1000,
                activeDuration: 5 * 60 * 1000,
                cookie: {
                    path: "/",
                    httpOnly: true,
                    secure: this.https,
                    maxAge: 30 * 60 * 1000
                }
            }));
        }

        // TODO: enable / disable logging; set logging format
        // log all inbound requests
        this.app.use((req, res, next) => {
            if (log) log.info("request", {
                domain: this.domain,
                port: this.port,
                https: this.https,
                body: req.body,
                session: req.session,
                userAgent: req.headers["user-agent"],
                url: req.url,
                method: req.method,
                referer: req.headers.referer,
                ip: req.headers["x-forwarded-for"] || req.connection.remoteAddress,
            });
            next();
        });

        if (this.https) {
            this.defaultPort = 443;
            let port = this.port || this.defaultPort;
            // HTTPS server
            log.debug("Starting HTTPS server on port", port, "...");

            var certManager = this.cm.get("cert-manager");
            if (certManager === undefined) {
                throw new Error("cert manager component not found");
            }
            var certs = certManager.config("get-certs");

            https.createServer(certs, this.app).listen(port);
        } else {
            let port = this.port || this.defaultPort;

            // HTTP server
            log.debug("Starting HTTP server on port", port, "...");
            this.server = http.createServer(this.app).listen(port);
        }
    }

    shutdown() {
        if (log) log.debug("Shutting down web component ...");
        if (this.server) {
            this.server.close();
        }

        this.server = null;
    }

    setPort(port) {
        if (typeof port !== "number") {
            throw new TypeError("expected 'port' to be number; got " + typeof port);
        }

        if (this.server) {
            throw new Error("can't set port after server has started");
        }

        this.port = port;
    }

    getPort() {
        return this.port;
    }

    setDomain(domain) {
        if (typeof domain !== "string") {
            throw new TypeError("expected 'domain to be string; got " + typeof domain);
        }

        if (this.server) {
            throw new Error("can't set domain after server has started");
        }

        this.domain = domain;
    }

    getDomain() {
        return this.domain;
    }

    setHttps(truthy) {
        this.https = !!truthy;
        if (this.https) this.addDependency("cert-manager");
    }

    getProtocol() {
        if (this.https) return "https";
        return "http";
    }

    setBodyParser(type) {
        if (typeof type !== "string") {
            throw new TypeError("expected 'type' to be String, got: " + typeof type);
        }

        if (this.server) {
            throw new Error("can't set body parser after server has started");
        }

        this.bodyParserType = type;
    }

    setEnableSession(enabled) {
        if (typeof enabled !== "boolean") {
            throw new TypeError("expected 'enabled' to be Boolean, got: " + typeof enabled);
        }

        if (this.server) {
            throw new Error("can't set body parser after server has started");
        }

        this.sessionEnabled = enabled;
    }

    setRedirect(opts) {
        if (typeof opts !== "object") {
            throw new TypeError("expected 'opts' to be object, got: " + typeof opts);
        }


        if (typeof opts.matchHost !== "undefined" &&
            typeof opts.matchHost !== "string" &&
            !(opts.matchHost instanceof RegExp)) {
            throw new TypeError("expected `matchHost` to be a string, RegExp, or undefined");
        }

        if (typeof opts.matchUrl !== "undefined" &&
            typeof opts.matchUrl !== "string" &&
            !(opts.matchUrl instanceof RegExp)) {
            throw new TypeError("expected `matchUrl` to be a string, RegExp, or undefined");
        }

        function checkOptParam(obj, param, type) {
            if (typeof obj[param] !== "undefined" &&
            typeof obj[param] !== type) {
                throw new TypeError("expected `matchHost` to be a string, RegExp, or undefined");
            }
        }

        checkOptParam(opts, "matchFn", "function");
        checkOptParam(opts, "destProtocol", "string");
        checkOptParam(opts, "destHost", "string");
        checkOptParam(opts, "destPort", "number");
        checkOptParam(opts, "destUrl", "string");
        checkOptParam(opts, "destTemporary", "boolean");

        if (!opts.destProtocol && !opts.destHost && !opts.destPort && !opts.destUrl) {
            throw new TypeError("exepected at least one of the following to be defined: destProtocol, destHost, destPort, destUrl");
        }

        let matchHost = ".*";
        let matchUrl = ".*";
        let matchFn = function() {
            return true;
        };

        if (opts.matchHost) matchHost = opts.matchHost;
        if (opts.matchUrl) matchUrl = opts.matchUrl;
        if (opts.matchFn) matchFn = opts.matchFn;

        if (typeof matchHost === "string") matchHost = new RegExp(matchHost);
        if (typeof matchUrl === "string") matchUrl = new RegExp(matchUrl);

        function doRedirect(req, res, next) {
            var srcHost = req.headers.host;
            var srcPort;

            if (srcHost.indexOf(":") >= 0) {
                let hostParts = srcHost.split(":");
                srcHost = hostParts[0];
                srcPort = hostParts[1];
            }

            // use the port specified
            // if no port specified and the host or protocol is changing, don't set the port
            // if no port specified and host and protocol are the same, keep the same port
            var destPort = opts.destPort || ((opts.destHost || opts.destProtocol) ? "" : srcPort);
            if (destPort) destPort = ":" + destPort;

            var requestMatches = srcHost.match(matchHost) && req.url.match(matchUrl) && matchFn(req, res);
            if (!requestMatches) return next();

            var fullDestLocation =
                (opts.destProtocol || req.protocol) +
                "://" +
                (opts.destHost || srcHost) +
                destPort +
                (opts.destUrl || req.url);
            log.debug("redirecting:", req.protocol + "://" + req.headers.host + req.url, "->", fullDestLocation);
            var status = opts.destTemporary ? 307 : 301;
            res.writeHead(status, {
                "Location": fullDestLocation
            });
            res.end();
        }

        this.app.use(doRedirect);
    }

    addStatic(opts) {
        if (typeof opts !== "object") {
            throw new TypeError("expected 'opts' to be object, got: " + typeof opts);
        }
        if (typeof opts.path !== "string") {
            throw new TypeError("expected 'opts.path' to be string, got: " + typeof opts.path);
        }
        if (typeof opts.dir !== "string") {
            throw new TypeError("expected 'opts.dir' to be string, got: " + typeof opts.dir);
        }
        if (log) log.debug("Adding static route:", opts.path, "->", opts.dir);
        this.app.use(opts.path, express.static(opts.dir));
    }

    addDynamic(opts) {
        if (typeof opts !== "object") {
            throw new TypeError("expected 'opts' to be object, got: " + typeof opts);
        }
        if (typeof opts.path !== "string") {
            throw new TypeError("expected 'opts.path' to be string, got: " + typeof opts.path);
        }
        if (typeof opts.method !== "string") {
            throw new TypeError("expected 'opts.method' to be string, got: " + typeof opts.method);
        }
        var method = opts.method.toLowerCase();
        if (typeof opts.fn !== "function") {
            throw new TypeError("expected 'opts.fn' to be function, got: " + typeof opts.fn);
        }
        if (typeof this.app[method] !== "function") {
            throw new TypeError("http method not recognized: " + method);
        }
        if (log) log.debug("Adding fn route:", opts.path, "->", opts.fn.name);
        this.app[method](opts.path, opts.fn);
    }
};
