

function dump(obj) { print(require('test/jsdump').jsDump.parse(obj)) };

var BUILDER = require("builder", "http://registry.pinf.org/cadorn.org/github/pinf/packages/common/");

var Builder = exports.Builder = function(pkg, options) {
    if (!(this instanceof exports.Builder))
        return new exports.Builder(pkg, options);
    this.construct(pkg, options);
}

Builder.prototype = BUILDER.Builder();



Builder.prototype.build = function(program) {


    
    print("build tusk package");


}