/*global describe, it */

var expect = require("chai").expect,
	db = require("../index");

describe("iw-mysql-wrapper", function () {

	describe("db.paramify()", function () {

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

});
