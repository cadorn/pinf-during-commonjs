

function dump(obj) { print(require('test/jsdump').jsDump.parse(obj)) };


var UTIL = require("util");
var JSON = require("json");
var QUERYSTRING = require("jack/querystring");
var USER = require("./user");

exports.app = function(env) {
    
    var body;
    
    if(env.QUERY_STRING) {
    
        var path = env.PATH_INFO.substr(1, env.PATH_INFO.length-1).split("/"),
            response;

        if(!path[path.length-1]) path.pop();
        
        if(path.length==1) {
            response = {
                "status": "INVALID_REQUEST",
                "message": "Invalid request"
            };        
        } else {

            var qs = QUERYSTRING.parseQuery(env.QUERY_STRING);
        
            var request = {
                "action": qs["action"] || null,
                "user": qs["user"] || null,
                "authkey": qs["authkey"] || null,
                "namespace": path.join("/"),
                "owner": path.shift(),
                "path": path,
                "args": qs
            }
dump(request);
            if(!request.action || !request.user || !request.authkey) {
                response = {
                    "status": "INVALID_REQUEST",
                    "message": "Invalid request"
                };        
            }

            response = USER.authorize(request);
    
            if(response.status=="AUTHORIZED") {
                response = require("./actions/" + qs["action"]).handle(request);
            }
        }
print("response");
dump(response);
    
        body = JSON.encode(response, null, '  ');
    
    } else {
        
        body = "Service request: " + env.PATH_INFO;
        
    }
    
print("body: "+body);
    
    return {
        status: 200,
        headers: {
            "Content-Type": "application/json",
            "Content-Length": String(body.length)
        },
        body: [
            body
        ]
    };
};
