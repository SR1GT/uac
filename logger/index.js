const fs = require("fs");

/**
 * 日志工具
 */
class UAC_Logger {
  constructor(prefix) {
    this.prefix = prefix.replace(__dirname.replace("logger", ""), "./") || "/";
    this.isOpen = true;
  }

  /**
   * 日志记录
   * @param {string} message 日志信息
   * @param {string} type 日志类型
   */
  log(message, type = "info") {
    if (!this.isOpen) return;
    const currTime = new Date();
    const timeString = currTime.toLocaleString().replace(/\//g, "-");
    const log = `[${type.toUpperCase()}] ${timeString} ${
      this.prefix
    }: ${message}`;
    const filePath = `${__dirname}/${currTime.getFullYear()}/${
      currTime.getMonth() + 1
    }`;
    const fileName = `/${currTime.getDate()}.log`;

    fs.mkdir(filePath, { recursive: true }, (err) => {
      if (err) throw err;
      fs.appendFile(filePath + fileName, log + "\n", (err) => {
        if (err) throw err;
        console.log(log);
      });
    });
  }

  /**
   * 设置日志开关
   * @param {boolean} bool
   */
  setIsOpen(bool) {
    this.isOpen = bool;
    this.log("日志开关已更改为：" + bool);
  }

  /**
   * 错误日志
   * @param {string} message
   */
  error(message) {
    this.log(message, "error");
  }

  /**
   * 警告日志
   * @param {string} message
   */
  warn(message) {
    this.log(message, "warn");
  }

  /**
   * 信息日志
   * @param {string} message
   */
  info(message) {
    this.log(message, "info");
  }

  /**
   * 调试日志
   * @param {string} message
   */
  debug(message) {
    this.log(message, "debug");
  }

  /**
   * 获取实例
   * @param {string} prefix
   * @returns {UAC_Logger}
   */
  static getInstance(prefix) {
    return new UAC_Logger(prefix);
  }
}

module.exports = UAC_Logger;
