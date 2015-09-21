"use strict";

var mysql = require("mysql"),
	crypto = require("crypto");

function md5(str) {
	return crypto.createHash("md5").update(str).digest("hex");
}

function paramify(list, prefix) {
	var result = {
		values: {},
		tokens: []
	};

	list.forEach(function (item, itemIndex) {
		var tokenKey = prefix + itemIndex;
		result.tokens.push(":" + tokenKey);
		result.values[tokenKey] = item;
	});

	return result;
}

function isThenable(obj) {
	return obj && typeof(obj.then) === "function";
}

function slice(arrayLike, n) {
	return Array.prototype.slice.call(arrayLike, n);
}

function promisedCall(obj, fnName) {
	var args = slice(arguments, 2);
	return new Promise(function (resolve, reject) {
		args.push(function (err, val) {
			// note: ES6 standard promises only return one value, but we were already losing the `fields` results from mysql.query()
			return err ? reject(err) : resolve(val);
		});
		obj[fnName].apply(obj, args);
	});
}

var Database = function (options) {
	var DB_DEBUG = !!options.showDebugInfo;

	// copy/pasted from the mysql lib docs
	var queryFormat = function queryFormat(query, values) {
		if (!values) return query;

		var formatted = query.replace(/\:(\w+)/g, function (txt, key) {
			if (values.hasOwnProperty(key)) {
				return this.escape(values[key]);
			}
			return txt;
		}.bind(this));

		if (DB_DEBUG) {
			console.log("Formatted query", {sql: formatted, queryId: md5(query)});
		}

		return formatted;
	};

	var getQueryFn = function (context) {
		return function queryFn(query, args) {
			var start = process.hrtime();
			return promisedCall(context, "query", query, args).then(function (rows) {
				var diff = process.hrtime(start);
				if (DB_DEBUG) {
					console.log("Query", {t: diff[0] + diff[1] / 1e9, queryId: md5(query)});
				}

				return rows;
			});
		};
	};

	var executeTransaction = function (connection, inTransactionFn) {
		var queryFn = getQueryFn(connection),
			transactionComplete = false,
			allQueries = [];

		var transactionScope = {
			query: function (query, args) {
				if (transactionComplete) {
					var error = new Error("Transaction is already closed");
					error.code = "E_TRANSACTION_CLOSED";
					return Promise.reject(error);
				}
				var queryPromise = queryFn(query, args);
				allQueries.push(queryPromise);
				return queryPromise;
			}
		};

		return promisedCall(connection, "beginTransaction")
			.then(function () {
				var allQueriesPromise = inTransactionFn(transactionScope);
				if (!isThenable(allQueriesPromise)) {
					allQueriesPromise = Promise.all(allQueries);
					transactionComplete = true;
				}
				return allQueriesPromise;
			})
			.then(function () {
				// note: disable further queries BEFORE running commit, because finally() runs in
				// asynchronously AFTER commit and there might be queries in between - impossible to test
				transactionComplete = true;
				return promisedCall(connection, "commit").then(function () {
					connection.release(); // note: no clue how to assert this actually happened
				});
			})
			.catch(function (e) {
				// note: disable further queries BEFORE running rollback, because finally() runs in
				// asynchronously AFTER rollback and there might be queries in between - impossible to test
				transactionComplete = true;
				return promisedCall(connection, "rollback").then(function () {
					connection.release(); // note: no clue how to assert this actually happened
					throw e; // rethrow!
				});
			});
	};

	var parsedDsn = {};
	if (options.dsn) {
		parsedDsn = require("mysql/lib/ConnectionConfig").parseUrl(options.dsn);
	}

	var poolConfig = {
		host: options.hostname || parsedDsn.host,
		user: options.username || parsedDsn.user,
		password: options.password || parsedDsn.password,
		database: options.database || parsedDsn.database,
		connectionLimit: 100,
		queryFormat: queryFormat,
		multipleStatements: !!options.multipleStatements
	};
	var pool = mysql.createPool(poolConfig);

	this.queryFormat = function (query, values) {
		return queryFormat.call(pool, query, values);
	};

	this.paramify = paramify;

	this.query = getQueryFn(pool);

	this.transaction = function (inTransactionFn) {
		return promisedCall(pool, "getConnection").then(function (connection) {
			return executeTransaction(connection, inTransactionFn);
		});
	};

	this.end = function (cb) {
		return pool.end(cb);
	};

};

module.exports = Database;
module.exports.paramify = paramify;
