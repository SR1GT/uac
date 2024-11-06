const UAC_Logger = require("../logger/index");
const logger = new UAC_Logger(__filename);

/**
 * 检测 SQL 注入
 * @param {string} string
 * @returns {string}
 */
const reInjectHandler = (string) => {
  const sqlInjectionPattern = /[\x00-\x1f\x7f\'"\\%_()=+*\/]+/;
  if (!sqlInjectionPattern.test(string)) return string;
  else {
    logger.warn(`存在 SQL 注入攻击风险：${string}`);
    throw new Error("存在 SQL 注入攻击风险");
  }
};

module.exports = {
  reInjectHandler,
};
