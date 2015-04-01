/*global describe, it */

var expect = require("chai").expect,
	getConnectionOptions = require("./getConnectionOptions"),
	Database = require("../index");

describe("iw-mysql-wrapper", function () {

	describe("Database.paramify()", function () {

		it("should return empty values/tokens when list is empty", function () {
			var result = Database.paramify([], "pfx");
			expect(result).to.eql({
				values: {},
				tokens: []
			});
		});

		it("should create a values/tokens map for the list", function () {
			var result = Database.paramify(["one", "two"], "pfx");
			expect(result).to.eql({
				values: {
					"pfx0": "one",
					"pfx1": "two"
				},
				tokens: [":pfx0", ":pfx1"]
			});
		});

	});

	describe("Database()", function () {

		it("should create an object", function (done) {
			var db = new Database(getConnectionOptions());
			expect(db.queryFormat).to.be.a("function");
			expect(db.paramify).to.be.a("function");
			expect(db.query).to.be.a("function");
			db.end(done);
		});

		describe("paramify()", function () {

			var db;
			beforeEach(function () {
				db = new Database(getConnectionOptions());
			});

			afterEach(function (done) {
				db.end(done);
			});

			it("should return empty values/tokens when list is empty", function () {
				var result = db.paramify([], "pfx");
				expect(result).to.eql({
					values: {},
					tokens: []
				});
			});

			it("should create a values/tokens map for the list", function () {
				var result = db.paramify(["one", "two"], "pfx");
				expect(result).to.eql({
					values: {
						"pfx0": "one",
						"pfx1": "two"
					},
					tokens: [":pfx0", ":pfx1"]
				});
			});

		});

		//describe("queryFormat()", function () {
		//	throw new Error("Not implemented");
		//});

		//describe("query()", function () {
		//	throw new Error("Not implemented");
		//});

	});

});
