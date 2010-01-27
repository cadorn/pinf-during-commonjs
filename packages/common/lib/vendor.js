

function dump(obj) { print(require('test/jsdump').jsDump.parse(obj)) };


var UTIL = require("util");
var HTTP = require("http");
var JSON = require("json");
var FILE = require("file");
var URI = require("uri");

exports.getVendorForUrl = function(uri) {
    if(!(uri instanceof URI.URI)) {
        uri = URI.parse(uri);
    }
    if(uri.domain=="github.com") {
        return require("./vendor/github").Vendor();
    }
    throw new Error("No vendor found for URL: " + uri.url);
}



exports.validateRepositoryUrl = function(url, options) {
    var repositories = options.revisionControl.getRepositories();
    if(!repositories) {
        return false;
    }
    var urlInfo = exports.normalizeRepositoryUrl(url),
        valid = false;
    repositories.forEach(function(repository) {
        if(valid) return;
        var repositoryInfo = exports.normalizeRepositoryUrl(repository);
        if(exports.compareRepositoryUrlInfo(urlInfo, repositoryInfo, ["private"])) {
            valid = true;
        }
    });
    return valid;
}

exports.normalizeRepositoryUrl = function(url, returnCommonString) {

    if(!url) return false;

    var info = {},
        m;

    if(m = url.match(/^([^:]*):([^:]*):([^:]*)$/)) {
        info.type = m[1];
        info.host = m[2];
        info.path = m[3];
    } else
    if(m = url.match(/^http:\/\/(github.com)\/(.*?)$/)) {
        info.type = "git";
        info["private"] = false;
        info.host = m[1];
        info.path = m[2];
    } else    
    if(m = url.match(/^https:\/\/(github.com)\/(.*?)$/)) {
        info.type = "git";
        info["private"] = true;
        info.host = m[1];
        info.path = m[2];
    } else    
    if(m = url.match(/^git:\/\/([^\/]*)\/(.*?).git$/)) {
        info.type = "git";
        info["private"] = false;
        info.host = m[1];
        info.path = m[2];
    } else
    if(m = url.match(/^git@([^:]*):(.*?).git$/)) {
        info.type = "git";
        info["private"] = true;
        info.host = m[1];
        info.path = m[2];
    }
    if(returnCommonString) {
        return info.type + ":" + info.host + ":" + info.path;
    }
    return info;
}

exports.compareRepositoryUrlInfo = function(subject, compare, ignore) {
    subject = UTIL.copy(subject);
    compare = UTIL.copy(compare);
    ignore = ignore || [];
    ignore.forEach(function(name) {
        if(UTIL.has(subject, ignore)) delete subject[ignore];
        if(UTIL.has(compare, ignore)) delete compare[ignore];
    });
    return UTIL.eq(subject, compare);
}

exports.rawUrlForRepository = function(repository) {
    
    var repositoryInfo = exports.normalizeRepositoryUrl(repository.url);
    
    if(repositoryInfo.host=="github.com") {
        return "http://github.com/" + repositoryInfo.path + "/raw/{rev}/" + ((repository.path)?repository.path+"/":"") + "{path}";
    }
    
    return false;
}


exports.downloadInfoForRepository = function(repository) {
    
    var repositoryInfo = exports.normalizeRepositoryUrl(repository.url);
    
    if(repositoryInfo.host=="github.com") {
        return {
            "type": "zip",
            "url": "http://github.com/" + repositoryInfo.path + "/zipball/{rev}/"
        }
    }
    
    return false;
}


exports.normalizeCommitInfo = function(vendor, data) {

    if(vendor=="github.com") {

        var payload = JSON.decode(data.payload.replace(/\\"/g, '"'));
        if(!payload) {
            throw new Error("no 'payload'");
        }

        var paths = {};
        payload.commits.forEach(function(commit) {
            if(commit.added) {
                commit.added.forEach(function(path) {
                    paths[FILE.Path(path).dirname().valueOf()] = true;
                });
            }
            if(commit.removed) {
                commit.removed.forEach(function(path) {
                    paths[FILE.Path(path).dirname().valueOf()] = true;
                });
            }
            if(commit.modified) {
                commit.modified.forEach(function(path) {
                    paths[FILE.Path(path).dirname().valueOf()] = true;
                });
            }
        });
        paths = UTIL.keys(paths);

        return {
            "repository": exports.normalizeRepositoryUrl(payload.repository.url, true),
            "rev": payload.after,
            "branch": payload.ref.split("/").pop(),
            "paths": JSON.encode(paths)
        };

    } else {
        throw new Error("Vendor not supported: " + vendor);
    }
    
}


exports.getTagsForRepository = function(repository) {

    var repositoryInfo = exports.normalizeRepositoryUrl(repository.url || repository);

    if(repositoryInfo.host=="github.com") {
        var result = HTTP.read("http://github.com/api/v2/json/repos/show/cadorn/pinf/tags").decodeToString();
        if(!result) return false;
        result = JSON.decode(result);
        if(!result || !result.tags) return false;
        return result.tags;
    }

    return false;
}
