var mysql = require("mysql"),
	Q = require("q"),
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

var Database = function (options) {
	var DB_DEBUG = !!options.showDebugInfo;

	// copy/pasted from the mysql lib docs - @todo: probably needs more tests?
	var queryFormat = function queryFormat(query, values) {
		if (!values) return query;

		var formatted = query.replace(/\:(\w+)/g, function (txt, key) {
			if (values.hasOwnProperty(key)) {
				return this.escape(values[key]);
			}
			return txt;
		}.bind(this));

		if (DB_DEBUG) {
			console.log("Formatted query", { sql: formatted, queryId: md5(query) });
		}

		return formatted;
	};

	var pool = this.pool = mysql.createPool({
		host: options.hostname,
		user: options.username,
		password: options.password,
		database: options.database,
		connectionLimit: 100,
		queryFormat: queryFormat,
		multipleStatements: !!options.multipleStatements
	});

	this.queryFormat = function (query, values) {
		return queryFormat.call(this.pool, query, values);
	};

	this.paramify = paramify;

	this.query = function (query, args) {
		var start = process.hrtime();
		return Q.ninvoke(pool, "query", query, args)
			.spread(function (rows, fields) {
				var diff = process.hrtime(start);
				if (DB_DEBUG) {
					console.log("Query", { t: diff[0] + diff[1] / 1e9, queryId: md5(query) })
				}

				return rows;
			});
	};

};

module.exports = Database;
module.exports.paramify = paramify;
