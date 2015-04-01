module.exports = function getConnectionOptions() {
	return process.env.IW_ENVIRONMENT === "local" ? {
		hostname: "main.local.insidewarehouse.com",
		username: "root",
		password: "",
		database: "insidewarehouse_test"
	} : {
		hostname: "localhost",
		username: "travis",
		password: "",
		database: "insidewarehouse_test"
	};
};
