/*global describe, it */

var Q = require("q"),
	expect = require("chai").expect,
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

		describe("transaction()", function () {

			beforeEach(function () {
				return db.query("DROP TABLE IF EXISTS `iw_mysql_wrapper_test`;")
					.then(function () {
						return db.query("CREATE TABLE `iw_mysql_wrapper_test` ( id INT );");
					});
			});

			afterEach(function () {
				return db.query("DROP TABLE IF EXISTS `iw_mysql_wrapper_test`;");
			});

			it("should execute multiple queries", function () {

				return db.transaction(function (transactionScope) {
					return Q.all([
						transactionScope.query("INSERT INTO `iw_mysql_wrapper_test` VALUES (1);"),
						transactionScope.query("INSERT INTO `iw_mysql_wrapper_test` VALUES (2);")
					]).then(function verifyBeforeCommit() {
						return Q.all([
							db.query("SELECT * FROM `iw_mysql_wrapper_test`").then(function (rows) {
								expect(rows).to.eql([], "DB scope: should have no values in the table (transaction pending)");
							}),
							transactionScope.query("SELECT * FROM `iw_mysql_wrapper_test`").then(function (rows) {
								expect(rows).to.eql([{id: 1}, {id: 2}], "Transaction scope: should have values in the table");
							})
						]);
					});
				}).then(function verifyAfterCommit() {
					return db.query("SELECT * FROM `iw_mysql_wrapper_test`").then(function (rows) {
						expect(rows).to.eql([{id: 1}, {id: 2}], "DB scope: should have values in the table (transaction is complete)");
					});
				});

			});

			it("should rollback upon errors", function () {
				var savedScope;
				return db.transaction(function (transactionScope) {
					savedScope = transactionScope;
					return Q.all([
						transactionScope.query("INSERT INTO `iw_mysql_wrapper_test` VALUES (1);"),
						transactionScope.query("BAD SQL;")
					]);
				}).then(function () {

					var err = new Error("Transaction should have failed!");
					err.code = "E_DID_NOT_FAIL";
					throw err;

				}).catch(function verifyAfterRollback(err) {

					expect(err.code).to.eql("ER_PARSE_ERROR");
					return Q.all([
						savedScope.query("SELECT * FROM `iw_mysql_wrapper_test`").then(function (rows) {
							expect(rows).to.eql([], "Transaction scope: should be rolled back");
						}),
						db.query("SELECT * FROM `iw_mysql_wrapper_test`").then(function (rows) {
							expect(rows).to.eql([], "DB scope: should have no values in the table (transaction is rolled back)");
						})
					]);

				});
			});

		});

	});

});
