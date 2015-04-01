/*global describe, it */

var expect = require("chai").expect,
	db = require("../index");

describe("iw-mysql-wrapper", function () {

	it("should be defined", function () {
		expect(db).to.be.a("function");
	});

});
