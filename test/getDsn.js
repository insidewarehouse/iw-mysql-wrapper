module.exports = function getConnectionOptions() {
	return process.env.IW_ENVIRONMENT === "local" ?
		"mysql://root@main.local.insidewarehouse.com/insidewarehouse_utest" :
		"mysql://travis@localhost/insidewarehouse_utest";
};
