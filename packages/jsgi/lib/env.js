
function dump(obj) { print(require('test/jsdump').jsDump.parse(obj)) };


var UTIL = require("util");
var URI = require("uri");
var QUERYSTRING = require("jack/querystring");
var PINF = require("pinf", "pinf-common");

var pinfStackHelper,
    pinfRequestHelper;

exports.Env = function(app, options) {

    if(!options.uid) {
        throw new Error("options.uid not set for PINF Env app");
    }

    // TODO: options.baseUrl may not end in a slash

    pinfStackHelper.options = options || {};

    pinfStackHelper.registerHandler(module, "subhandler", function(env) {

        var id = env.pinf.route.args['package'] + ":" + env.pinf.route.args['module'] + ":" + env.pinf.route.args['path'];

        if(!pinfStackHelper.handlers[id]) {
            system.log.warn("subhandler["+id+"] used in route not registered");
            return {
                "status": "404",
                "headers": {
                    "content-type": "text/html"
                },
                "body": [
                    "Not Found"
                ]
            };
        }
        
        return pinfStackHelper.handlers[id](env);

    });

    pinfStackHelper.registerRoutes(module, {
        "^/pinf/@package/(.*?)/@module/(.*?)/@handler/(.*)$": function() {
            return {
                "handler": "subhandler",
                "arguments": {
                    "package": "$1",
                    "module": "$2",
                    "path": "$3"
                }
            };
        }
    });

    if(options.apps) {
        // chain up apps
        var lastApp = app;
        options.apps.reverse().forEach(function(a) {
            var opt = a.options || {};
            if( typeof opt.pinf == "undefined" ) {
                opt.pinf = pinfStackHelper;
            }
            
            lastApp = a.instance(lastApp, opt);
        });
        app = lastApp;
    }

    return function(env) {

        if(env.pinf) {
            throw new Error("'pinf' property already found in jsgi env");
        }

        env.pinf = new pinfRequestHelper(env);

        return app(env);
    }
}

exports.getStackHelper = function() {
    return pinfStackHelper;
}

pinfStackHelper = {

    "options": {},
    "helpers": {},
    "handlers": {},
    "routes": [],

    "registerHelper": function(module, name, helper) {
        var id = packageForModule(module) + ":" + nameForModule(module);
        if(!this.helpers[id]) {
            this.helpers[id] = {};
        }
        this.helpers[id][name] = helper;
    },

    "registerHandler": function(module, path, handler) {
        if(path.substring(0,1)=="/") {
            throw new Error("Handler path may not start with /");
        }
        var modulePackage = packageForModule(module),
            moduleName = nameForModule(module);
        if(this.handlers[modulePackage + ":" + moduleName + ":" + path]) {
            throw new Error("Handler with same name already registered for module");
        }
        this.handlers[modulePackage + ":" + moduleName + ":" + path] = handler;
        return '/pinf/@package/' + modulePackage + '/@module/' + moduleName + '/@handler/' + path;
    },

    "getHandlerForId": function(id) {
        if(!this.handlers[id]) {
            throw new Error("Handler for id nto found: " + id);
        }
        return this.handlers[id];
    },

    "registerRoutes": function(module, routes) {
        var self = this;
        var modulePackage = packageForModule(module),
            moduleName = nameForModule(module);
        UTIL.forEach(routes, function(route) {
            if(typeof route[1] == "string") {
                route[1] = function() {
                    return {
                        "handler": route[1]
                    };
                };
            }
            self.routes.push({
                "expr": new RegExp(route[0].replace(/\//g, "\\/")),
                "inst": route[1],
                "package": modulePackage,
                "module": moduleName
            });
        });
    },
    
    "getBaseUrl": function() {
        return this.getOption("baseUrl");
    },
    
    "getOption": function(name) {
        if(!this.options[name]) {
            throw new Error(name + " option not set!");
        }
        return this.options[name];
    },
    
    "require": function(module, pkg) {
        if(!this.options.packageInfo) {
            throw new Error("options.packageInfo not set as required by require() in PINF Env app");
        }
        return require(module, this.options.packageInfo["packages"][pkg]);        
    }

/*    
    "getCachePath": function() {
        var path = PINF.getDatabase().getCache().path.join(this.options.uid);
        if(!path.exists()) {
            path.mkdirs();
        }
        return path;
    }
*/
};


var pinfRequestHelper = function(env) {
    this.getEnv = function() { return env; }
    this.data = {};
};

pinfRequestHelper.prototype.getDatabase = function() {
    return PINF.getDatabase();
}

pinfRequestHelper.prototype.getBaseUrl = function() {
    return pinfStackHelper.getBaseUrl();
};

pinfRequestHelper.prototype.require = function(module, pkg) {
    return pinfStackHelper.require(module, pkg);
};

/*
pinfRequestHelper.prototype.getCachePath = function() {
    return pinfStackHelper.getCachePath();
};
*/
pinfRequestHelper.prototype.getOption = function(name) {
    return pinfStackHelper.getOption(name);
};

pinfRequestHelper.prototype.getHelper = function(id, name) {
    if(!pinfStackHelper.helpers[id]) {
        throw new Error("helper for id '" + id + "' not found!");
    }
    if(!pinfStackHelper.helpers[id][name]) {
        throw new Error("helper with name '" + name + "' for id '" + id + "' not found!");
    }
    return pinfStackHelper.helpers[id][name];
};

pinfRequestHelper.prototype.getRawPostData = function() {
    var rawData = [];
    this.getEnv().input.forEach(function(chunk) {
        rawData.push(chunk);
    });
    return rawData.join("");
},

pinfRequestHelper.prototype.getPostData = function() {
    var data = {};
    this.getRawPostData().split("&").forEach(function(pair) {
        pair = pair.split("=");
        data[URI.unescapeComponent(pair[0])] = URI.unescapeComponent(pair[1]);
    });
    return data;
}

pinfRequestHelper.prototype.getQueryArguments = function() {
    return QUERYSTRING.parseQuery(this.getEnv().queryString);
}

pinfRequestHelper.prototype.setData = function(module, data) {
    var modulePackage = packageForModule(module),
        moduleName = nameForModule(module),
        id = modulePackage + ":" + moduleName;
    this.data[id] = data;
}




function packageForModule(module) {
    return URI.parse(module.uid).directories.join("/");
}

function nameForModule(module) {
    var parts = module.id.split(module["package"]);
    // TODO: Remove /lib/ in more reliable way by looking at package descriptor
    return parts[1].substring(5);
}
