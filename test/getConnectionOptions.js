"use strict";

module.exports = function getConnectionOptions() {
	return process.env.IW_ENVIRONMENT === "local" ? {
		hostname: "db.local.insidewarehouse.com",
		username: "root",
		password: "",
		database: "insidewarehouse_integration_test"
	} : {
		hostname: "localhost",
		username: "travis",
		password: "",
		database: "insidewarehouse_integration_test"
	};
};
