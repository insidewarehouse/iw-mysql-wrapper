/*global describe, it */

var expect = require("chai").expect,
	getConnectionOptions = require("./getConnectionOptions"),
	getDsn = require("./getDsn"),
	Database = require("../index");

function neverCallMe(msg) {
	return function () {
		var err = new Error(msg || "Function called, but should not have been called.");
		err.code = "E_SHOULD_NOT_HAPPEN";
		throw err;
	};
}

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
						expect(rows).to.contain({"Database": "insidewarehouse_integration_test"});
					});
			});

			it("should run the query in DB with params", function () {
				var paramified = db.paramify(["insidewarehouse_integration_test"], "db");
				return db.query("SHOW DATABASES WHERE `Database` IN (" + paramified.tokens.join(",") + ");", paramified.values)
					.then(function (rows) {
						expect(rows).to.eql([{"Database": "insidewarehouse_integration_test"}]);
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
							expect(results[0]).to.contain({"Database": "insidewarehouse_integration_test"});
							expect(results[1]).to.contain({"Database": "insidewarehouse_integration_test"});
						});
				});

			});

		});

		describe("transaction() when handler returns a promise", function () {

			beforeEach(function () {
				return db.query("DROP TABLE IF EXISTS `iw_mysql_wrapper_test`;")
					.then(function () {
						return db.query("CREATE TABLE `iw_mysql_wrapper_test` ( id INT );");
					});
			});

			afterEach(function () {
				return db.query("DROP TABLE IF EXISTS `iw_mysql_wrapper_test`;");
			});

			it("should execute queries and commit", function () {

				var savedScope, verifiedBeforeCommit = false;
				return db.transaction(function (transactionScope) {
					savedScope = transactionScope;
					return Promise.all([
						transactionScope.query("INSERT INTO `iw_mysql_wrapper_test` VALUES (1);"),
						transactionScope.query("INSERT INTO `iw_mysql_wrapper_test` VALUES (2);")
					]).then(function verifyBeforeCommit() {
						verifiedBeforeCommit = true;
						return Promise.all([
							db.query("SELECT * FROM `iw_mysql_wrapper_test`").then(function (rows) {
								expect(rows).to.eql([], "DB scope: should have no values in the table (transaction pending)");
							}),
							transactionScope.query("SELECT * FROM `iw_mysql_wrapper_test`").then(function (rows) {
								expect(rows).to.eql([{id: 1}, {id: 2}], "Transaction scope: should have values in the table");
							})
						]);
					});
				}).then(function verifyAfterCommit() {
					expect(verifiedBeforeCommit).to.be.eql(true);
					return Promise.all([
						savedScope.query("SELECT 1;").then(neverCallMe("Transaction should be closed.")).catch(function (err) {
							expect(err.code).to.eql("E_TRANSACTION_CLOSED");
						}),
						db.query("SELECT * FROM `iw_mysql_wrapper_test`").then(function (rows) {
							expect(rows).to.eql([{id: 1}, {id: 2}], "DB scope: should have values in the table (transaction is complete)");
						})
					]);
				});

			});

			it("should rollback when the returned promise fails", function () {

				var savedScope;
				return db.transaction(function (transactionScope) {
					savedScope = transactionScope;
					return Promise.all([
						transactionScope.query("INSERT INTO `iw_mysql_wrapper_test` VALUES (1);"),
						transactionScope.query("BAD SQL;")
					]);
				}).then(neverCallMe("Query should throw a parse error.")).catch(function verifyAfterRollback(err) {

					expect(err.code).to.eql("ER_PARSE_ERROR");
					return Promise.all([
						savedScope.query("SELECT 1;").then(neverCallMe("Transaction should be closed.")).catch(function (err) {
							expect(err.code).to.eql("E_TRANSACTION_CLOSED");
						}),
						db.query("SELECT * FROM `iw_mysql_wrapper_test`").then(function (rows) {
							expect(rows).to.eql([], "DB scope: should have no values in the table (transaction is rolled back)");
						})
					]);

				});
			});

			it("should allow handling of a query error", function () {

				return db.transaction(function (transactionScope) {
					return Promise.all([
						transactionScope.query("INSERT INTO `iw_mysql_wrapper_test` VALUES (1);"),
						transactionScope.query("BAD SQL;").catch(function (e) {
							// handle error
							expect(e.code).to.eql("ER_PARSE_ERROR");
						})
					]);
				}).then(function () {
					return db.query("SELECT * FROM `iw_mysql_wrapper_test`").then(function (rows) {
						expect(rows).to.eql([{id: 1}], "DB scope: should have values in the table (transaction is complete, errors were handled)");
					});
				});

			});

			it("should allow chained queries", function () {

				return db.transaction(function (transactionScope) {
					return transactionScope.query("INSERT INTO `iw_mysql_wrapper_test` VALUES (1);")
						.then(function () {
							return transactionScope.query("INSERT INTO `iw_mysql_wrapper_test` VALUES (2);");
						});
				}).then(function () {
					return db.query("SELECT * FROM `iw_mysql_wrapper_test`").then(function (rows) {
						expect(rows).to.eql([{id: 1}, {id: 2}], "DB scope: should have values in the table (transaction is complete)");
					});
				});

			});

		});

		describe("transaction() when handler does not return a promise", function () {

			beforeEach(function () {
				return db.query("DROP TABLE IF EXISTS `iw_mysql_wrapper_test`;")
					.then(function () {
						return db.query("CREATE TABLE `iw_mysql_wrapper_test` ( id INT );");
					});
			});

			afterEach(function () {
				return db.query("DROP TABLE IF EXISTS `iw_mysql_wrapper_test`;");
			});

			it("should execute queries and commit", function () {

				// note: this test simply passes, because query() calls are queued internally by mysql,
				// therefore guaranteeing that "commit" will be called AFTER all the other queries complete
				return db.transaction(function (transactionScope) {
					transactionScope.query("INSERT INTO `iw_mysql_wrapper_test` VALUES (1);");
					transactionScope.query("INSERT INTO `iw_mysql_wrapper_test` VALUES (2);");
				}).then(function () {
					return db.query("SELECT * FROM `iw_mysql_wrapper_test`").then(function (rows) {
						expect(rows).to.eql([{id: 1}, {id: 2}], "DB scope: should have values in the table (transaction is complete)");
					});
				});

			});

			it("should rollback when a query fails", function () {

				var savedScope;
				return db.transaction(function (transactionScope) {
					savedScope = transactionScope;

					transactionScope.query("INSERT INTO `iw_mysql_wrapper_test` VALUES (1);");
					transactionScope.query("BAD SQL;");

				}).then(neverCallMe("Query should throw a parse error.")).catch(function verifyAfterRollback(err) {

					expect(err.code).to.eql("ER_PARSE_ERROR");
					return Promise.all([
						savedScope.query("SELECT 1;").then(neverCallMe("Transaction should be closed.")).catch(function (err) {
							expect(err.code).to.eql("E_TRANSACTION_CLOSED");
						}),
						db.query("SELECT * FROM `iw_mysql_wrapper_test`").then(function (rows) {
							expect(rows).to.eql([], "DB scope: should have no values in the table (transaction is rolled back)");
						})
					]);

				});
			});

			it("should not allow chained queries", function (done) {

				db.transaction(function (transactionScope) {
					transactionScope.query("INSERT INTO `iw_mysql_wrapper_test` VALUES (1);").then(function () {
						// query() should fail here, because we didn't return a promise and as soon as the first query executed - transaction was committed
						transactionScope.query("INSERT INTO `iw_mysql_wrapper_test` VALUES (2);")
							.then(neverCallMe("Transaction should be closed"))
							.catch(function (err) {
								expect(err.code).to.eql("E_TRANSACTION_CLOSED");
								done();
							});
					});
				});

			});

		});

	});

	describe("Database() with DSN", function () {

		var db;

		afterEach(function (done) {
			db.end(done);
		});

		it("should accept DSN string via options", function () {
			db = new Database({dsn: getDsn()});
			return db.query("SHOW DATABASES;")
				.then(function (rows) {
					expect(rows.length).to.be.greaterThan(1);
					expect(rows).to.contain({"Database": "insidewarehouse_integration_test"});
				});
		});

		it("should run the query in DB with params", function () {
			db = new Database({dsn: getDsn()});
			var paramified = db.paramify(["insidewarehouse_integration_test"], "db");
			return db.query("SHOW DATABASES WHERE `Database` IN (" + paramified.tokens.join(",") + ");", paramified.values)
				.then(function (rows) {
					expect(rows).to.eql([{"Database": "insidewarehouse_integration_test"}]);
				});
		});

		it("shjould allow multiple statements", function () {
			db = new Database({dsn: getDsn(), multipleStatements: true});
			return db.query("SHOW DATABASES; SHOW DATABASES;")
				.then(function (results) {
					expect(results.length).to.eql(2);
					expect(results[0]).to.contain({"Database": "insidewarehouse_integration_test"});
					expect(results[1]).to.contain({"Database": "insidewarehouse_integration_test"});
				});
		});

	});

});
