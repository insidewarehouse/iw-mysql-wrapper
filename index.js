var mysql = require("mysql"),
	Q = require("q"),
	crypto = require("crypto");

var md5 = function (str) {
	return crypto.createHash("md5").update(str).digest("hex");
};

var createQueryFormatter = function (DB_DEBUG) {
	// copy/pasted from the mysql lib docs - @todo: probably needs more tests?
	return function queryFormat(query, values) {
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

};

var Database = function (options) {
	var DB_DEBUG = !!options.showDebugInfo;

	var pool = this.pool = mysql.createPool({
		host: options.hostname,
		user: options.username,
		password: options.password,
		database: options.database,
		connectionLimit: 100,
		queryFormat: createQueryFormatter(DB_DEBUG),
		multipleStatements: !!options.multipleStatements
	});

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
