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

		var db;
		beforeEach(function () {
			db = new Database(getConnectionOptions());
		});

		afterEach(function (done) {
			db.end(done);
		});

		describe("paramify()", function () {

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

		describe("queryFormat()", function () {

			it("should replace tokens with escaped values", function () {
				var query = "SELECT * FROM test WHERE col1 = :value1 and col2 = :value2 and col3 = :value1;";
				var values = {
					value1: "ohai",
					value2: "ohai'; bobby tables"
				};
				expect(db.queryFormat(query, values)).to.eql("SELECT * FROM test WHERE col1 = 'ohai' and col2 = 'ohai\\'; bobby tables' and col3 = 'ohai';");
			});

			it("should leave alone values which aren't present", function () {
				var query = "SELECT * FROM test WHERE col1 = :value1;";
				var values = {};
				expect(db.queryFormat(query, values)).to.eql("SELECT * FROM test WHERE col1 = :value1;");
			});

			it("should leave query alone when no values present", function () {
				var query = "SELECT * FROM test WHERE col1 = :value1;";
				expect(db.queryFormat(query)).to.eql("SELECT * FROM test WHERE col1 = :value1;");
			});

		});

		describe("query()", function () {

			it("should run the query in DB", function () {
				return db.query("SHOW DATABASES;")
					.then(function (rows) {
						expect(rows.length).to.be.greaterThan(1);
						expect(rows).to.contain({"Database": "insidewarehouse_utest"});
					});
			});

			it("should run the query in DB with params", function () {
				var paramified = db.paramify(["insidewarehouse_utest"], "db");
				return db.query("SHOW DATABASES WHERE `Database` IN (" + paramified.tokens.join(",") + ");", paramified.values)
					.then(function (rows) {
						expect(rows).to.eql([{"Database": "insidewarehouse_utest"}]);
					});
			});

			it("should not allow multiple statements by default", function () {
				return db.query("SHOW DATABASES; SHOW DATABASES;")
					.then(function () {
						throw new Error("Should not get here!");
					})
					.catch(function (e) {
						expect(e.code).to.eql("ER_PARSE_ERROR");
					});
			});

			describe("when multiple statements allowed", function () {

				var multiDb;
				beforeEach(function () {
					var connectionOptions = getConnectionOptions();
					connectionOptions.multipleStatements = true;
					multiDb = new Database(connectionOptions);
				});

				afterEach(function (done) {
					multiDb.end(done);
				});

				it("should allow multiple statements", function () {
					return multiDb.query("SHOW DATABASES; SHOW DATABASES;")
						.then(function (results) {
							expect(results.length).to.eql(2);
							expect(results[0]).to.contain({"Database": "insidewarehouse_utest"});
							expect(results[1]).to.contain({"Database": "insidewarehouse_utest"});
						});
				});

			});

		});

	});

});
