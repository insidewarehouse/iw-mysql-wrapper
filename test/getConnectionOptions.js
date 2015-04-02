module.exports = function getConnectionOptions() {
	return process.env.IW_ENVIRONMENT === "local" ? {
		hostname: "main.local.insidewarehouse.com",
		username: "root",
		password: "",
		database: "insidewarehouse_utest"
	} : {
		hostname: "localhost",
		username: "travis",
		password: "",
		database: "insidewarehouse_utest"
	};
};
