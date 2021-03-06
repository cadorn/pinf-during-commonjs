

function dump(obj) { print(require('test/jsdump').jsDump.parse(obj)) };

var URI = require("uri");
var FILE = require("file");
var WORKSPACE = require("./workspace");
var VENDOR = require("./vendor");



var Workspaces = exports.Workspaces = function(path) {
    if (!(this instanceof exports.Workspaces))
        return new exports.Workspaces(path);

    this.path = path;
}

Workspaces.prototype.getPath = function() {
    if(!this.path.exists()) {
        this.path.mkdirs();
    }
    return this.path;
}

/**
 * Supported selectors:
 *   * http://github.com/cadorn/pinf/ (+ URI.URI variant) - Vendor URIs
 *   * http://github.com/cadorn/pinf (+ URI.URI variant) - Vendor URIs
 *   * github.com/cadorn/pinf/ (+ URI.URI variant) - Vendor URIs
 *   * github.com/cadorn/pinf (+ URI.URI variant) - Vendor URIs
 *   * github.com/cadorn/pinf:sub/path - Vendor URIs with sub-path
 *   * .../pinf/workspaces/github.com/cadorn/pinf (+ File.Path variant)
 *   * .../pinf/workspaces/github.com/cadorn/pinf/... (+ File.Path variant)
 *       will go up the tree until it finds the last package.json file
 *   * http://registry.pinf.org/cadorn.org/github/fireconsole/ - UIDs (matches against workspace and all containing packages)
 *   * <name> (if name is unique among workspaces)
 */
Workspaces.prototype.getForSelector = function(selector, useExactPath) {
    var subPath;
    if(selector instanceof URI.URI) {
        selector = selector.url;
    } else
    if(selector instanceof FILE.Path) {
        selector = selector.canonical();
    }
    var path;
    if(useExactPath) {
        path = FILE.Path(""+selector);
        if(!FILE.isAbsolute(path)) {
            throw new WorkspacesError("Selector is not an absolute path!");
        }
//        if(path.valueOf().substr(0, this.path.join("").valueOf().length)!=this.path.join("").valueOf()) {
//            throw new WorkspacesError("Workspace selector path '"+path+"' does not fall within workspaces directory: " + this.path.join(""));
//        }
        selector = "http://" + this.getPath().join("").relative(path);
    } else
    if(selector instanceof FILE.Path || FILE.Path(selector).exists()) {
        path = FILE.Path(""+selector);
//        if(path.valueOf().substr(0, this.path.join("").valueOf().length)!=this.path.join("").valueOf()) {
//            throw new WorkspacesError("Workspace selector path '"+path+"' does not fall within workspaces directory: " + this.path.join(""));
//        }
        var lastMatch;
        while(path.split().length>this.getPath().split().length) {
            if(path.join("package.json").exists()) {
                lastMatch = path;
            }
            // stop at the deepest affirmative workspace
            if(path.join(".pinf-workspace.json").exists()) {
                break;
            }
            path = path.dirname();
        }
        if(!lastMatch) {
            throw new WorkspacesError("No workspace found for selector: " + selector);
        }
        selector = "http://" + this.getPath().join("").relative(lastMatch);
    } else
    if(!/^https?:\/\//.test(selector)) {
        var parts = selector.split("::");
        if(parts.length==2) {
            selector = "http://" + parts[0];
            subPath = parts[1];
        } else {
            selector = "http://" + selector;
        }
    }
    var workspace;
    try {
        var vendor = VENDOR.getVendorForUrl(selector);
        var info = vendor.parseUrl(selector);
        if(!info.repository || (!info.user && !info.domain)) {
            throw new WorkspacesError("Not a valid repository URL");
        }
        path = this.getPath().join(vendor.getWorkspacePath(info));
        if(subPath) {
            path = path.join(subPath);
        }
        workspace = WORKSPACE.Workspace(path);
        workspace.setVendorInfo(info);
    } catch(e) {
        if(!path) {
            // check if selector is a UID or Name
            var namedWorkspace = false;
            this.forEach(function(ws) {
                if(workspace) return;
                // match possible 'UID' selector against all workspace packages
                ws.forEachPackage(function(pkg) {
                    if(workspace) return;
                    try {
                        if(pkg.hasUid() && pkg.getUid()==selector) {
                            workspace = ws;
                        }
                    } catch(e) {}
                });
                // match possible 'name' selector against workspace
                if(("http://" + ws.getName()) == selector) {
                    if(namedWorkspace) {
                        throw new WorkspacesError("Multiple workspaces found for name. Use a more precise selector!");
                    }
                    namedWorkspace = ws;
                }
            });
            if(namedWorkspace) {
                workspace = namedWorkspace;
            }
            if(!workspace) {
                throw new WorkspacesError("No workspace found for UID/name selector: " + selector);
            }
        } else {
            workspace = WORKSPACE.Workspace(path);
        }
    }
    return workspace;
}

Workspaces.prototype.forEach = function(callback, subPath) {
    var path = this.getPath(),
        self = this;
    if(subPath) {
        path = path.join(subPath);
    }
    var found = false,
        dirs = [];
    path.listPaths().forEach(function(item) {
        if(found) return;
        if(item.basename()=="package.json") {
            found = true;
            callback(self.getForSelector(item.dirname(), true));
        } else
        if(item.isDirectory() && item.basename()!=".git" && item.basename()!=".svn") {
            dirs.push(item.basename());
        }
    });
    if(!found) {
        dirs.forEach(function(dir) {
            self.forEach(callback, (subPath)?subPath.join(dir):dir);
        });
    }
}


var WorkspacesError = exports.WorkspacesError = function(message) {
    this.name = "WorkspacesError";
    this.message = message;

    // this lets us get a stack trace in Rhino
    if (typeof Packages !== "undefined")
        this.rhinoException = Packages.org.mozilla.javascript.JavaScriptException(this, null, 0);
}
WorkspacesError.prototype = new Error();

