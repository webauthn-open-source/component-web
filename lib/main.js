var express = require('express');
var Component = require("component-class");
var path = require("path");
var https = require("https");
var http = require('http');
var bodyParser = require("body-parser");
var fs = require("fs");
var log;


module.exports = class Fido2ComponentWeb extends Component {
    constructor(cm) {
        super(cm);

        // this.webdir = path.join(__dirname, "../webauthn-yubiclone");

        this.configTable["add-static"] = this.addStatic;
        this.configTable["add-dynamic"] = this.addDynamic;
        this.configTable["set-port"] = this.setPort;
        this.configTable["set-https"] = this.setHttps;
        this.configTable["set-redirect"] = this.setRedirect;

        // an Express instance
        this.app = express();

        // no server yet
        this.server = null;

        // default port
        this.defaultPort = 80;
        this.https = false;

        this.addDependency("logger");
        this.addDependency("cert-manager");
    }

    init() {
        var logger = this.cm.get("logger");
        if (logger === undefined) {
            throw new Error("logger component not found");
        }
        log = logger.create("Fido2ComponentWeb");

        // start express
        log.debug("Starting web server...");
        // log.debug("webdir:", this.webdir);
        this.app.use(bodyParser.json());
        // this.app.use(express.static(this.webdir));

        // // configure certificates
        // var certManager = this.cm.get("cert-manager");
        // if (certManager === undefined) {
        //     throw new Error("cert manager component not found");
        // }
        // var certs = certManager.config("get-certs");
        // log.debug(certs);
        // var cert = fs.readFileSync(certs.cert, "utf8");
        // var key = fs.readFileSync(certs.key, "utf8");

        var port = this.port || this.defaultPort;
        if (!this.https) {
            // HTTP server
            log.debug("Starting HTTP server on port", port, "...");
            this.server = http.createServer(this.app).listen(port);
        } else {
            // HTTPS server
            log.debug("Starting HTTPS server on port", port, "...");

            var certManager = this.cm.get("cert-manager");
            if (certManager === undefined) {
                throw new Error("cert manager component not found");
            }
            var certs = certManager.config("get-certs");

            https.createServer(certs, this.app).listen(port);
        }
    }

    shutdown() {
        log.debug("Shutting down server ...");
        if (this.server) {
            this.server.close();
        }

        this.server = null;
    }

    setPort(port) {
        if (typeof port !== "number") {
            throw new TypeError("expected 'port' to be number; got " + typeof port);
        }

        if(this.server) {
            throw new Error("can't set port after server has started");
        }

        this.port = port;
    }

    setHttps(truthy) {
        this.https = !!truthy;
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

        if (typeof opts.matchFn !== "undefined" &&
            typeof opts.matchFn !== "function") {
            throw new TypeError("expected `matchFn` to be a function or undefined");
        }

        if (typeof opts.destProtocol !== "undefined" &&
            typeof opts.destProtocol !== "string") {
            throw new TypeError("expected `protocol` to be a string or undefined");
        }

        if (typeof opts.destHost !== "undefined" &&
            typeof opts.destHost !== "string") {
            throw new TypeError("expected `destHost` to be a string or undefined");
        }

        if (typeof opts.destPort !== "undefined" &&
            typeof opts.destPort !== "number") {
            throw new TypeError("expected `destPort` to be a number or undefined");
        }

        if (typeof opts.destUrl !== "undefined" &&
            typeof opts.destUrl !== "string") {
            throw new TypeError("expected `destUrl` to be a string or undefined");
        }

        if (typeof opts.destTemporary !== "undefined" &&
            typeof opts.destTemporary !== "boolean") {
            throw new TypeError("expected `destTemporary` to be a boolean or undefined");
        }

        if (!opts.destProtocol && !opts.destHost && !opts.destPort && !opts.destUrl) {
            throw new TypeError ("exepected at least one of the following to be defined: destProtocol, destHost, destPort, destUrl");
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
            var destPort = opts.destPort || ((opts.destHost||opts.destProtocol)?"":srcPort);
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
            var status = opts.destTemporary?307:301;
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
        if (typeof opts.fn !== "function") {
            throw new TypeError("expected 'opts.fn' to be function, got: " + typeof opts.fn);
        }
        if (typeof this.app[opts.method] !== "function") {
            throw new TypeError("http method not recognized: " + opts.method);
        }
        if (log) log.debug("Adding fn route:", opts.path, "->", opts.fn.name);
        this.app[opts.method](opts.path, opts.fn);
    }
};