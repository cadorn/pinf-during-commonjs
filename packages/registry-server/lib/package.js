

function dump(obj) { print(require('test/jsdump').jsDump.parse(obj)) };

var UTIL = require("util");
var DB = require("google/appengine/ext/db");
var NAMESPACE = require("./namespace");
var SEMVER = require("semver", "util");
var JSON = require("json");
var MODELS = require("./models");
var CACHE = require("./cache");
var PACKAGE_DESCRIPTOR = require("package/descriptor", "common");
var VENDOR = require("vendor", "common");


var model = MODELS.getModel("Package");
exports.getModel = function() {
    return model;
}

var Package = exports.Package = function(pkg, data) {
    if (!(this instanceof exports.Package))
        return new exports.Package(pkg, data);

    var parts = pkg.split(":");
    if(parts.length==1) {
        parts = parts[0].split("/");
        parts = [parts.slice(0, parts.length-1).join("/"), parts.pop()];
    }
    if(parts.length!=2) {
        throw new Error("Invalid Package ID");
    }
    this.id = parts.join(":");
    this.frozen = false;
    this.fetch(data);
}

Package.prototype.fetch = function(data) {
    if(data) {
        this.data = data;
    } else {
        this.data = model.getByKeyName(this.id);
    }
    if(!this.exists()) {
        this.data = new model({
            "keyName": this.id
        });
    } else {
        if(this.data.source) {
            this.data = model.getByKeyName(this.data.source);
            this.frozen = true;
        }
    }
    if(this.data.versions) {
        this.versions = JSON.decode(this.data.versions);
    }
    if(this.data.revisions) {
        this.revisions = JSON.decode(this.data.revisions);
    }
    if(this.data.descriptors) {
        this.descriptors = JSON.decode(this.data.descriptors);
    }
}

Package.prototype.store = function() {
    var self = this;
    if(this.frozen) {
        throw new Error("Cannot store package as it is frozen");
    }
    if(this.revisions) {
        this.data.revisions = JSON.encode(this.revisions);
    }
    if(this.versions) {
        this.data.versions = JSON.encode(this.versions);
    }
    if(this.descriptors) {
        var versions = (this.versions)?this.versions:[];
        var revisions = (this.revisions)?UTIL.values(this.revisions):[];
        
        if(this.descriptors.versions) {
            for( var i in this.descriptors.versions ) {
                if(!UTIL.has(versions,i)) {
                    delete this.descriptors.versions[i];
                }
            }
        }
        if(this.descriptors.revisions) {
            for( var i in this.descriptors.revisions ) {
                if(!UTIL.has(revisions,i)) {
                    delete this.descriptors.revisions[i];
                }
            }
        }
        this.data.descriptors = JSON.encode(this.descriptors);
    }
    if(this.data.descriptor) {
        this.data.repositories = [];
        var spec = JSON.decode(this.data.descriptor);
        if(spec.repositories) {
            spec.repositories.forEach(function(repository) {
                self.data.repositories.push(VENDOR.normalizeRepositoryUrl(repository.url, true));
            });
        }
    }
    this.data.put();
    CACHE.remove("package:" + this.id);
    CACHE.remove("namespace:" + this.getNamespace());
    var result = model.all().filter("source =", this.id).fetch();
    if(result) {
        result.forEach(function(data) {
            CACHE.remove("package:" + data.datastoreKey().getName());
            CACHE.remove("namespace:" + data.namespace.datastoreKey().getName());
        });
    }
}

Package.prototype.exists = function() {
    if(!this.data || !this.data.namespace) return false;
    return true;
}

Package.prototype.getName = function() {
    return this.id.split(":").pop();
}

Package.prototype.getNamespace = function() {
    if(!this.exists()) return null;
    return this.data.namespace.datastoreKey().getName();
}

Package.prototype.getLatestVersion = function(version) {
    if(!this.versions) return false;
    return SEMVER.latestForMajor(this.versions, version);
}

Package.prototype.announceVersion = function(version, descriptor) {
    if(!this.versions) {
        this.versions = [version];
    } else {
        this.versions.push(version);
        this.versions = SEMVER.latestForEachMajor(this.versions, true);
    }
    if(!this.descriptors) {
        this.descriptors = {};
    }
    if(!this.descriptors.versions) {
        this.descriptors.versions = {};
    }
    descriptor = completeDescriptor(this.data.descriptor, descriptor);
    descriptor.version = version;
    this.descriptors.versions[version] = descriptor;
    this.data.descriptor = JSON.encode(descriptor);
    var self = this;
    DB.runInTransaction(function() {
        self.store();

        var announcementModel = MODELS.getModel("Announcement");
        var announcement = new announcementModel({
            "parent": self.data,
            "package": self.data,
            "version": version
        });
        announcement.put();
    });
}

Package.prototype.getLastRevision = function(branch) {
    if(!this.revisions || !this.revisions[branch]) return false;
    return this.revisions[branch];
}

Package.prototype.announceRevision = function(branch, revision, descriptor) {
    if(!this.revisions) {
        this.revisions = {};
    }
    if(!this.descriptors) {
        this.descriptors = {};
    }
    if(!this.descriptors.revisions) {
        this.descriptors.revisions = {};
    }
    this.revisions[branch] = revision;
    descriptor = completeDescriptor(this.data.descriptor, descriptor);
    descriptor.version = "0.0.0rev-" + revision;
    this.descriptors.revisions[revision] = descriptor;
    this.data.descriptor = JSON.encode(descriptor);
    var self = this;
    DB.runInTransaction(function() {
        self.store();

        var announcementModel = MODELS.getModel("Announcement");
        var announcement = new announcementModel({
            "parent": self.data,
            "package": self.data,
            "revision": revision
        });
        announcement.put();
    });
}

function completeDescriptor(arbitraryDescriptor, descriptor) {
    if(!arbitraryDescriptor) {
        return descriptor;
    }
    if(typeof arbitraryDescriptor == "string") {
        arbitraryDescriptor = JSON.decode(arbitraryDescriptor);
    }
    // the uid and repositories properties may be missing if they are only defined
    // in package.local.json and an annoucement is made via a post-commit hook
    // where the repository does not include the package.local.json file.
    // we preserve these properties by copying them from the existing arbitrary descriptor.
    // this works as the first release must always be manually announced where the
    // package.local.json file is available from the developer's working environment.
    if(arbitraryDescriptor.uid && !descriptor.uid) {
        descriptor.uid = arbitraryDescriptor.uid;
    }
    if(arbitraryDescriptor.repositories && !descriptor.repositories) {
        descriptor.repositories = arbitraryDescriptor.repositories;
    }
    return descriptor;
}

Package.prototype.getDescriptorForRevision = function(revision) {
    if(!this.descriptors || !this.descriptors.revisions) return false;
    if(!this.descriptors.revisions[revision]) return false;
    var descriptor = PACKAGE_DESCRIPTOR.PackageDescriptor(this.descriptors.revisions[revision]);
    return descriptor.getCompletedSpec();
}

Package.prototype.getDescriptorForVersion = function(version) {
    if(!this.descriptors || !this.descriptors.versions) return false;
    if(!this.descriptors.versions[version]) return false;
    var descriptor = PACKAGE_DESCRIPTOR.PackageDescriptor(this.descriptors.versions[version]);
    return descriptor.getCompletedSpec();
}

Package.prototype.getArbitraryDescriptor = function() {
    if(!this.data.descriptor) return false;
    var descriptor = PACKAGE_DESCRIPTOR.PackageDescriptor(JSON.decode(this.data.descriptor));
    var spec = descriptor.getCompletedSpec();
    if(!spec.repositories) {
        return false;
    }
    return {
        "name": spec.name,
        "repositories": spec.repositories
    }
}

Package.prototype.getRepositoryInfo = function() {
    if(!this.data.descriptor) return false;
    var descriptor = PACKAGE_DESCRIPTOR.PackageDescriptor(JSON.decode(this.data.descriptor));
    var spec = descriptor.getCompletedSpec();
    if(!spec.repositories) {
        return false;
    }
    return spec.repositories[0];
}

Package.prototype.getUid = function(env) {
    var url = [
        "http://"
    ];
    url.push(env.SERVER_NAME);
    if(env.SERVER_PORT && env.SERVER_PORT!="80") {
        url.push(":" + env.SERVER_PORT);
    }
    url.push("/" + this.getNamespace() + "/");
    url.push(this.getName() + "/");
    
    return url.join("");
}

Package.prototype.register = function(namespace, sourcePackage) {
    this.data.namespace = namespace.data
    if(sourcePackage) {
        this.data.source = sourcePackage.id;
    }
    this.store();
}

Package.prototype.getInfo = function() {
    
    var info = {
        "name": this.getName()
    };

    var self = this;

    if(this.versions) {
        info["versions"] = {};
        this.versions.forEach(function(version) {
            info.versions[SEMVER.getMajor(version, true)] = self.getDescriptorForVersion(version);
        });
    }
    if(this.revisions) {
        info["branches"] = {};
        UTIL.every(this.revisions, function(revision) {
            info.branches[revision[0]] = self.getDescriptorForRevision(revision[1]);
        });
    }
    
    return info;
}


exports.getForNamespace = function(namespace) {
    var result = model.all().filter("namespace =", namespace.data).fetch();
    if(!result) {
        return false;
    }
    var packages = {};
    result.forEach(function(data) {
        packages[data.datastoreKey().getName()] = Package(data.datastoreKey().getName(), data);
    });
    return packages;
}

exports.serviceInfoForId = function(id) {
    var key = "package:"+id,
        data = CACHE.get(key);
    if(!data) {
        var pkg = Package(id);
        if(!pkg.exists()) {
            return {
                "status": "404",
                "message": "Package not found"
            };
        }
        data = pkg.getInfo();
        CACHE.set(key, JSON.encode(data, null, "  "));
    }
    return data;    
}

