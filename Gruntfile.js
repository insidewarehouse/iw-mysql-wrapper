"use strict";

module.exports = function (grunt) {

	require("time-grunt")(grunt);
	require("load-grunt-tasks")(grunt);

	grunt.initConfig({
		jshint: {
			dist: {
				src: ["*.js", "test/**/*.js"],
				options: {jshintrc: true}
			},
			watch: {
				src: ["*.js", "test/**/*.js"],
				options: {jshintrc: true, force: true}
			}
		},
		"mochaTest": {
			"test": {
				src: ["test/**/*.test.js"]
			}
		},
		"mocha_istanbul": {
			"coverage": {
				src: ["test/**/*.test.js"]
			}
		},
		"watch": {
			"test": {
				"files": ["*.js", "**/*.js", "!node_modules/**", "!build/**"],
				"tasks": ["jshint:watch", "mochaTest"]
			}
		},
		"bump": {
			"options": {
				commitMessage: 'release %VERSION%',
				commitFiles: [ "-a" ],
				tagName: '%VERSION%',
				tagMessage: 'version %VERSION%',
				pushTo: 'origin'
			}
		}
	});

	grunt.registerTask("default", ["jshint:dist", "test"]);
	grunt.registerTask("test", ["mocha_istanbul"]);

	grunt.registerTask("release", function () {
		var bump = grunt.option("bump");
		if (bump != "patch" && bump != "minor" && bump != "major") grunt.fail.fatal("Please pass --bump");
		grunt.task.run(["checkbranch:master", "checkpending", "default", "bump:" + bump]);
	});

};
