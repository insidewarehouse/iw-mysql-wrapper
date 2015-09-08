module.exports = function getConnectionOptions() {
	return process.env.IW_ENVIRONMENT === "local" ?
		"mysql://root@db.local.insidewarehouse.com/insidewarehouse_integration_test" :
		"mysql://travis@localhost/insidewarehouse_integration_test";
};
