

function dump(obj) { print(require('test/jsdump').jsDump.parse(obj)) };


var UTIL = require("util");
var FILE = require("file");
var FS_STORE = require("http/fs-store");
var PROGRAM = require("../program");
var PINF = require("../pinf");


var ProgramStore = exports.ProgramStore = function(path) {
    if (!(this instanceof exports.ProgramStore))
        return new exports.ProgramStore(path);

    this.path = path;
}

ProgramStore.prototype.exists = function() {
    return this.path.exists();
}

ProgramStore.prototype.setPackageStore = function(store) {
    this.packageStore = store;
}

ProgramStore.prototype.get = function(locator) {

    var pkg = this.packageStore.get(locator);
    var programPath = this.path.join("programs", locator.getTopLevelId());

    programPath.dirname().mkdirs();

    if(pkg.getVersion() && !programPath.exists()) {
        FILE.copyTree(pkg.getPath(), programPath);

        // if there are *.local.* files in the workspace for this program we link them
        var workspace = PINF.getWorkspaceForSelector(pkg.getUid());
        if(workspace) {
            var repoInfo = pkg.getDescriptor().getRepositoryInfo(),
                basePath = workspace.getPath();
            if(repoInfo.path) {
                basePath = basePath.join(repoInfo.path);
            }
            [
                "package.local.json"
            ].forEach(function(basename) {
                if(basePath.join(basename).exists() && !programPath.join(basename).exists()) {
                    basePath.join(basename).symlink(programPath.join(basename));
                }
            });
        }
    } else
    if(!programPath.exists()) {
        pkg.getPath().symlink(programPath);
    }

    var program = PROGRAM.Program(programPath, locator);
    program.setPackageStore(this.packageStore);
    return program;
}

