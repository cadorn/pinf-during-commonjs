

function dump(obj) { print(require('test/jsdump').jsDump.parse(obj)) };


var UTIL = require("util");
var FILE = require("file");
var JSON = require("json");
var SEMVER = require("semver", "util");
var DESCRIPTOR = require("./descriptor");


var PackageCatalog = exports.PackageCatalog = function(path) {
    if (!(this instanceof exports.PackageCatalog))
        return new exports.PackageCatalog(path);
        
    this.path = path;
    try {
        this.spec = JSON.decode(this.path.read());
    } catch(e) {
        throw new CatalogError("Error parsing JSON from: " + this.path);
    }
}

PackageCatalog.prototype.getPath = function() {
    return this.path;
}

PackageCatalog.prototype.getDirtyPath = function() {
    return this.path.dirname().join(this.path.basename() + "~dirty");
}

PackageCatalog.prototype.getDescriptor = function(locator) {
    if(!this.spec.packages[locator.getName()]) {
        throw new CatalogError("Package with name '"+locator.getName()+"' not found in catalog: " + this.path);
    }
    var self = this,
        desiredRevision = locator.getPinnedVersion() || locator.getRevision(),
        revisions = this.spec.packages[locator.getName()],
        revision;

    if(!desiredRevision) {
        var majorVersion = -1;
        // look for largest major version
        UTIL.keys(revisions).forEach(function(rev) {
            if(/^\d*$/.test(rev)) {
                if(rev>majorVersion) {
                    // ensure version is valid numeric semver (without alpha suffix)
                    if(SEMVER.validate(revisions[rev].version, {"numericOnly": true})) {
                        majorVersion = rev;
                    }
                }
            }
        });
        if(majorVersion==-1) {
            throw new CatalogError("No numeric (without alpha suffix) versioned release found for package: " + locator.getName() + " in catalog: " + this.path);
        }
        revision = majorVersion;
    } else
    if(SEMVER.validate(desiredRevision, {"numericOnly": true})) {
        // we have a semver with only numeric parts. this declares a major version compatibility for >=revision
        // only semvers WITHOUT alphanumeric suffixes are considered
        revision = SEMVER.getMajor(desiredRevision);
    } else
    if(SEMVER.validate(desiredRevision)) {
        // we have a semver with an alphanumeric suffix. this declares a major version compatibility for >=revision
        // semvers with alphanumeric suffixes are considered
        revision = SEMVER.getMajor(desiredRevision, true);
        if(!revisions[revision]) {
            // default to full version
            revision = SEMVER.getMajor(desiredRevision);
        }
    } else
    if(/^0\.0\.0rev-(.*)$/.test(desiredRevision)) {
        revision = "*";
    } else {
        // we have a string representing a branch/code train
        revision = desiredRevision;
    }
    if(!revisions[revision]) {
        throw new CatalogError("No package release found matching '" + desiredRevision + "' looking for key '"+revision+"'");
    }

    var spec = revisions[revision];

    // if locator has a pinned version we set this in the descriptor
    if(locator.getPinnedVersion()) {
        spec.version = locator.getPinnedVersion();
    }

    // TODO: ensure final version is >= desired (revisions[revision].version >= desiredRevision) if applicable?
    return DESCRIPTOR.PackageDescriptor(spec);
}

PackageCatalog.prototype.getRevisionsForPackage = function(name) {
    if(!this.spec.packages[name]) {
        return false;
    }
    return UTIL.keys(this.spec.packages[name]);
}

PackageCatalog.prototype.flagAsDirty = function() {
    this.getDirtyPath().touch();
}


var CatalogError = exports.CatalogError = function(message) {
    this.name = "CatalogError";
    this.message = message;

    // this lets us get a stack trace in Rhino
    if (typeof Packages !== "undefined")
        this.rhinoException = Packages.org.mozilla.javascript.JavaScriptException(this, null, 0);
}
CatalogError.prototype = new Error();
