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
        super();

        this.cm = cm;

        console.log ("Fido2ComponentWeb constructor");
        this.webdir = path.join(__dirname, "../webauthn-yubiclone");

        console.log ("configTable:", this.configTable);

        this.configTable["add-static"] = this.addStatic;
        this.configTable["add-dynamic"] = this.addDynamic;
        this.configTable["set-port"] = this.setPort;
    }

    dependencies() {
        return [
            "logger",
            "cert-manager"
        ];
    }

    init() {
        console.log ("WEB INIT");
        var logger = this.cm.get("logger");
        if (logger === undefined) {
            throw new Error("logger component not found");
        }
        log = logger.create("Fido2ComponentWeb");

        // start express
        log.debug("Starting web server...");
        this.app = express();
        log.debug("webdir:", this.webdir);
        this.app.use(bodyParser.json());
        this.app.use(express.static(this.webdir));

        // configure certificates
        var certManager = this.cm.get("cert-manager");
        if (certManager === undefined) {
            throw new Error("cert manager component not found");
        }
        var certs = certManager.config("get-certs");
        log.debug(certs);
        var cert = fs.readFileSync(certs.cert, "utf8");
        var key = fs.readFileSync(certs.key, "utf8");

        // setup HTTPS
        console.log("Starting HTTPS server on port 8443...");
        https.createServer({
            key: key,
            cert: cert
        }, this.app).listen(8443);

        // setup HTTP to redirect to HTTPS
        console.log ("Starting HTTP server on port 8000...");
        http.createServer((req, res) => {
            let host = req.headers.host;
            if (req.headers.host.indexOf(":") >= 0 && this.port) {
                let hostParts = req.headers.host.split(":");
                host = hostParts[0] + ":" + this.port;
            }
            console.log ("redirecting:", req.headers.host, "->", host);
            res.writeHead(301, {
                "Location": "https://" + host + req.url
            });
            res.end();
        }).listen(8000);
    }

    setPort(port) {
        if (typeof port !== "number") {
            throw new TypeError ("expected 'port' to be number; got " + typeof port);
        }

        this.port = port;
    }

    addStatic(opts) {
        if(typeof opts !== "object") {
            throw new TypeError ("expected 'opts' to be object, got: " + typeof opts);
        }
        if(typeof opts.path !== "string") {
            throw new TypeError ("expected 'opts.path' to be string, got: " + typeof opts.path);
        }
        if(typeof opts.dir !== "string") {
            throw new TypeError ("expected 'opts.dir' to be string, got: " + typeof opts.dir);
        }
        log.debug("Adding static route:", opts.path, "->", opts.dir);
        this.app.use(path, express.static(path.join(opts.dir)));
    }

    addDynamic(opts) {
        if(typeof opts !== "object") {
            throw new TypeError ("expected 'opts' to be object, got: " + typeof opts);
        }
        if(typeof opts.path !== "string") {
            throw new TypeError ("expected 'opts.path' to be string, got: " + typeof opts.path);
        }
        if(typeof opts.method !== "string") {
            throw new TypeError ("expected 'opts.method' to be string, got: " + typeof opts.method);
        }
        if(typeof opts.fn !== "function") {
            throw new TypeError ("expected 'opts.fn' to be function, got: " + typeof opts.fn);
        }
        if(typeof this.app[opts.method] !== "function") {
            throw new TypeError ("http method not recognized: " + opts.method);
        }
        log.debug("Adding fn route:", opts.path, "->", opts.fn.name);
        this.app[opts.method](opts.path, opts.fn);
    }
};