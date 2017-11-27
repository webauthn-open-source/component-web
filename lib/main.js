var express = require('express');
var ComponentManager = require("simple-component-manager").ComponentManager;
var Component = require("simple-component-manager").Component;
var path = require("path");
var https = require("https");
var http = require('http');
var fs = require("fs");
var cm = new ComponentManager();
var log;


module.exports = class Fido2ComponentWeb extends Component {
    constructor() {
        super();
        this.webdir = path.join(__dirname, "../webauthn-yubiclone");

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
        var logger = cm.get("logger");
        if (logger === undefined) {
            throw new Error("logger component not found");
        }
        log = logger.create("Fido2ComponentWeb");

        // start express
        log.debug("Starting web server...");
        this.app = express();
        log.debug("webdir:", this.webdir);
        // this.app.all('*', ensureSecure);
        this.app.use(express.static(this.webdir));


        // configure certificates
        var certManager = cm.get("cert-manager");
        if (certManager === undefined) {
            throw new Error("cert manager component not found");
        }
        var certs = certManager.config("get-certs");
        log.debug(certs);
        var cert = fs.readFileSync(certs.cert, "utf8");
        var key = fs.readFileSync(certs.key, "utf8");

        // setup HTTPS
        console.log("Starting HTTPS server...");
        https.createServer({
            key: key,
            cert: cert
        }, this.app).listen(8443);

        // setup HTTP
        console.log ("Starting HTTP server...");
        http.createServer((req, res) => {
            let host = req.headers.host;
            console.log ("indexof", req.headers.host.indexOf(":"));
            console.log ("this port is:", this.port);
            console.log ("this", this);
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
        // function ensureSecure(req, res, next) {
        //     console.log ("req.originalUrl:", req.originalUrl);
        //     if (req.secure) {
        //         return next();
        //     };
        //     // handle port numbers if you need non defaults
        //     // res.redirect('https://' + req.host + req.url); // express 3.x
        //     res.redirect('https://' + req.hostname + req.url); // express 4.x
        // }
        // http.createServer(this.app).listen(8000);
    }

    setPort(port) {
        if (typeof port !== "number") {
            throw new TypeError ("expected 'port' to be number; got " + typeof port);
        }

        console.log ("setting port to:", port);
        this.port = port;
    }

    addStatic(path, dir) {
        log.debug("Adding static route:", path, "->", dir);
        this.app.use(path, express.static(path.join(dir)));
    }

    addDynamic(path, fn) {
        log.debug("Adding fn route:", path, "->", fn.name);
        log.warn("addDynamic not implemented");
    }
};