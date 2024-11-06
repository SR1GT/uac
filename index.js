// #region
const express = require("express");
const app = express();
const port = 3000;

// 允许跨域请求
const cors = require("cors");
app.use(cors());

// .env
require("dotenv").config();

// 解析器
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// token
const jwt = require("jsonwebtoken");
app.use((req, res, next) => {
  // 连接测试、登录页、密码重置页跳过
  if (req.path === "/" || req.path === "/sign-in" || req.path === "/forget")
    next();
  else {
    const token =
      req.header("Authorization") && req.header("Authorization").split(" ")[1];

    if (token === null) {
      logger.error("令牌认证失败：未提供令牌");
      return res.status(401).json({
        status: 0,
        message: "令牌认证失败：未提供令牌",
      });
    }

    jwt.verify(token, process.env.TOKEN_SECRET_KEY, (err, user) => {
      if (err) {
        logger.error(`令牌认证失败：${err.message}`);
        return res.status(403).json({
          status: 0,
          message: `令牌认证失败：${err.message}`,
        });
      }

      req.user = user;
      next();
    });
  }
});

// 日志
const UAC_Logger = require("./logger/index");
const logger = new UAC_Logger(__filename);
logger.debug("UAC 日志工具启动");

const createConnection = require("./utils/database");
const { reInjectHandler } = require("./utils/handler");
// const reader = require("./logger/reader");

// SQL 注入检测
app.use((req, res, next) => {
  try {
    const data = [req.query, req.body];
    for (let item of data) {
      if (Object.keys(item).length < 1) continue;
      for (let key in item) {
        item[key] = reInjectHandler(item[key]);
      }
    }
    next();
  } catch (err) {
    res.json({
      status: 0,
      message: `输入错误：${err.message}`,
    });
  }
});

// 记录请求
app.set("trust proxy", true);
app.use((req, res, next) => {
  const ip = req.ip.replace("::ffff:", "");
  logger.info(`接收请求：\nIP-${ip} Method-${req.method} URL-${req.url}`);
  next();
});

const IDENTITY = {
  USER: 0,
  VIP_USER: 1,
  GROUP_USER: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
};

// #endregion

// 连接测试
app.get("/", async (req, res) => {
  // const connection = await createConnection();
  // await connection.execute("SHOW DATABASES").then((res) => {
  //   console.log(res);
  // });
  // await connection.end();

  logger.info("已连接至用户统一身份验证中心");
  res.status(200).json({
    status: 1,
    message: "已连接至用户统一身份验证中心",
  });
});

// 盐值获取（客户端）
// 根据用户名查询盐值
app.get("/sign-in", async (req, res) => {
  const username = req.query.username;
  try {
    if (!username || username === "") throw new Error("用户名为空");
  } catch (err) {
    logger.error(`取盐失败：数据错误\n${err.message}`);
    res.status(403).json({
      status: 0,
      message: `取盐失败：${err.message}`,
    });
    return;
  }

  const connection = await createConnection();
  await connection
    .execute(
      `SELECT salt,status,bantime FROM user WHERE username='${username}'`
    )
    .then((result) => {
      if (result[0].length === 0) throw new Error("用户不存在");
      const data = result[0][0];

      if (data.status === 0) {
        logger.info(`查询盐值成功\n用户名：${username}`);
        res.status(200).json({
          status: 1,
          message: "查询盐值成功",
          data: result[0][0].salt,
        });
      } else {
        const bantime = new Date(data.bantime);
        if (new Date() > bantime) {
          connection
            .execute(
              `UPDATE user SET status = 0, bantime = null WHERE uid = ${uid}`
            )
            .then((result) => {
              logger.info(`查询盐值成功\n用户名：${username}`);
              res.status(200).json({
                status: 1,
                message: "查询盐值成功",
                data: result[0][0].salt,
              });
            });
        } else {
          logger.warn(
            `查询盐值失败：用户被封禁\n用户名：${username} 封禁终止时间：${bantime.toLocaleDateString()}`
          );
          res.status(403).json({
            status: 0,
            message: `无法登录，总封禁${
              data.status
            }个月，将于 ${bantime.toLocaleDateString()} 解封`,
          });
        }
      }
    })
    .catch((err) => {
      logger.error(`查询盐值失败：数据库查询错误\n${err}`);
      res.status(500).json({
        status: 0,
        message: `查询盐值失败：${err.message}`,
      });
    })
    .finally(() => connection.end());
});

// 登录验证
// 用户名与密码
app.post("/sign-in", async (req, res) => {
  const { username, password } = req.body;

  try {
    if (!username || username === "" || !password || password === "")
      throw new Error("用户名或密码为空");
  } catch (err) {
    logger.error(`登录失败：数据错误\n${err.message}`);
    res.status(403).json({
      status: 0,
      message: `登录失败：${err.message}`,
    });
    return;
  }

  const connection = await createConnection();
  await connection
    .execute(
      `SELECT uid,username,identity,status,email,phone,createtime,updatetime FROM user WHERE username='${username}' AND password='${password}'`
    )
    .then((result) => {
      if (result[0].length === 1) {
        const token = jwt.sign(result[0][0], process.env.TOKEN_SECRET_KEY, {
          expiresIn: "1h",
        });
        logger.info(`登录验证成功\n用户名：${username}`);
        res.status(200).json({
          status: 1,
          message: "登录验证成功",
          data: {
            token: token,
            username: result[0][0].username,
            identity: result[0][0].identity,
          },
        });
      } else {
        logger.warn(`登录失败：密码错误\n用户名：${username}`);
        res.status(200).json({
          status: 0,
          message: "登录失败：密码错误",
        });
      }
    })
    .catch((err) => {
      logger.error(`登录失败：数据库查询错误\n${err}`);
      res.status(500).json({
        status: 0,
        message: `登录失败：${err.message}`,
      });
    })
    .finally(() => connection.end());
});

// 注册验证（客户端）
// 新用户的用户名、密码、盐值、邮箱、电话、身份，当新用户的身份是管理员时需要提供口令验证
// 禁止直接注册超级管理员
app.post("/sign-up", async (req, res) => {
  const {
    username,
    password,
    salt,
    email,
    phone,
    identity,
    token: admin_token,
  } = req.body;

  try {
    if (!username || username === "" || !password || password === "")
      throw new Error("用户名或密码为空");
    if (username.length < 2 || username.length > 16)
      throw new Error("用户名长度为2-16位");
    if (!salt || salt === "") throw new Error("没有填写盐值");
    if ((!email && !phone) || (email === "" && phone === ""))
      throw new Error("没有填写联系方式");
    if (
      email !== "" &&
      !email.match(/^[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)
    )
      throw new Error("邮箱格式不正确");
    if (phone !== "" && !phone.match(/^1[3456789]\d{9}$/))
      throw new Error("手机号格式不正确");

    if (!identity) identity = 0;
    if (identity < IDENTITY.USER || identity > IDENTITY.ADMIN)
      throw new Error("身份超出范围");
    if (identity === IDENTITY.ADMIN && admin_token !== process.env.SUPER_TOKEN)
      throw new Error("管理员口令错误");
  } catch (err) {
    logger.error(`注册失败：数据错误\n${err.message}`);
    res.status(403).json({
      status: 0,
      message: `注册失败：${err.message}`,
    });
    return;
  }

  const connection = await createConnection();
  await connection
    .execute(
      `INSERT INTO user (username, password, salt, email, phone, identity) VALUES ('${username}', '${password}', '${salt}', '${email}', '${phone}', ${identity})`
    )
    .then((result) => {
      logger.info(`注册成功\n用户名：${username}`);
      res.status(200).json({
        status: 1,
        message: "注册成功",
      });
    })
    .catch((err) => {
      if (
        err.message ===
        `Duplicate entry '${username}' for key 'user_username_uindex'`
      ) {
        logger.warn(`注册失败：用户名已存在\n用户名：${username}`);
        res.status(500).json({
          status: 0,
          message: "注册失败：用户名已存在",
        });
      } else {
        logger.error(`注册失败：数据库错误\n${err}`);
        res.status(500).json({
          status: 0,
          message: `注册失败：${err.message}`,
        });
      }
    })
    .finally(() => connection.end());
});

// 密码重置（客户端）
// 原用户名、新密码、新盐值、验证本人的邮箱或电话
app.post("/forget", async (req, res) => {
  const { username, password, salt, email, phone } = req.body;

  try {
    if (!username || username === "" || !password || password === "")
      throw new Error("用户名或密码为空");
    if (username.length < 2 || username.length > 16)
      throw new Error("用户名长度为2-16位");
    if (!salt || salt === "") throw new Error("没有填写盐值");
    if ((!email && !phone) || (email === "" && phone === ""))
      throw new Error("没有填写联系方式");
    if (
      email !== "" &&
      !email.match(/^[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)
    )
      throw new Error("邮箱格式不正确");
    if (phone !== "" && !phone.match(/^1[3456789]\d{9}$/))
      throw new Error("手机号格式不正确");
  } catch (err) {
    logger.error(`密码重置失败：数据错误\n${err.message}`);
    res.status(403).json({
      status: 0,
      message: `密码重置失败：${err.message}`,
    });
    return;
  }

  let assist = "";
  if (email !== "") assist = `email = '${email}'`;
  else if (phone !== "") assist = `phone = '${phone}'`;

  const connection = await createConnection();
  await connection
    .execute(
      `UPDATE user SET password = '${password}', salt = '${salt}' WHERE username = '${username}'` +
        assist
    )
    .then((result) => {
      logger.info(`重置密码验证成功\n用户名：${username}`);
      res.status(200).json({
        status: 1,
        message: "重置密码验证成功",
      });
    })
    .catch((err) => {
      logger.error(`重置密码失败：数据库错误\n${err}`);
      res.status(500).json({
        status: 0,
        message: `重置密码失败：${err.message}`,
      });
    })
    .finally(() => connection.end());
});

// 联系修改（客户端）
// 原用户名、新邮箱或新电话
app.post("/update", async (req, res) => {
  // 默认使用请求数据中的用户名（管理端），如未提供则根据 token 解析结果的用户名
  let usename = req.body.username ?? req.user.username;

  const { email, phone } = req.body;

  try {
    if (username === "") throw new Error("用户名为空");
    if (username.length < 2 || username.length > 16)
      throw new Error("用户名长度为2-16位");
    if ((!email && !phone) || (email === "" && phone === ""))
      throw new Error("没有填写联系方式");
    if (
      email !== "" &&
      !email.match(/^[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)
    )
      throw new Error("邮箱格式不正确");
    if (phone !== "" && !phone.match(/^1[3456789]\d{9}$/))
      throw new Error("手机号格式不正确");
  } catch (err) {
    logger.error(`修改联系方式失败：数据错误\n${err.message}`);
    res.status(403).json({
      status: 0,
      message: `修改联系方式失败：${err.message}`,
    });
    return;
  }

  let assist = "";
  if (email && email !== "") assist += `email = '${email}'`;
  if (phone && phone !== "")
    assist += `${email && email !== "" ? ", " : ""}phone = '${phone}'`;

  const connection = await createConnection();
  await connection
    .execute(`UPDATE user SET ${assist} WHERE username = '${username}'`)
    .then((result) => {
      logger.info(`修改联系方式成功\n用户名：${username}`);
      res.status(200).json({
        status: 1,
        message: "修改联系方式成功",
      });
    })
    .catch((err) => {
      logger.error(`修改联系方式失败：数据库错误\n${err}`);
      res.status(500).json({
        status: 0,
        message: `修改联系方式失败：${err.message}`,
      });
    })
    .finally(() => connection.end());
});

// 用户转型（管理端）
// 目标用户的uid、新身份，以及执行该操作的管理员身份、口令
app.post("/upgrade", async (req, res) => {
  const admin_identity = req.user.identity;
  const { uid, identity, token: admin_token } = req.body;

  try {
    if (!uid || uid === "" || identity === undefined || !admin_identity)
      throw new Error("缺少必要参数");
    if (admin_identity < IDENTITY.ADMIN || identity >= admin_identity)
      throw new Error("权限不足");
    if (identity < IDENTITY.USER || identity > IDENTITY.SUPER_ADMIN)
      throw new Error("无效的权限等级");
    if (
      identity === IDENTITY.SUPER_ADMIN &&
      admin_token !== process.env.SUPER_TOKEN
    )
      throw new Error("管理员口令错误");
  } catch (err) {
    logger.error(`用户转型失败：数据错误\n${err.message}`);
    res.status(403).json({
      status: 0,
      message: `用户转型失败：${err.message}`,
    });
    return;
  }

  const connection = await createConnection();
  await connection
    .execute(`UPDATE user SET identity = ${identity} WHERE uid = ${uid}`)
    .then((result) => {
      logger.info(`用户转型成功\n用户ID：${uid}`);
      res.status(200).json({
        status: 1,
        message: "用户转型成功",
      });
    })
    .catch((err) => {
      logger.error(`用户转型失败：数据库错误\n${err}`);
      res.status(500).json({
        status: 0,
        message: `用户转型失败：${err.message}`,
      });
    })
    .finally(() => connection.end());
});

// 获取封禁
// 需要被查询的用户 uid
app.get("/ban", async (req, res) => {
  const { uid } = req.query;

  try {
    if (!uid || uid === "") throw new Error("用户ID为空");
  } catch (err) {
    logger.error(`获取封禁失败：数据错误\n${err.message}`);
    res.status(403).json({
      status: 0,
      message: `获取封禁失败：${err.message}`,
    });
    return;
  }

  const connection = await createConnection();
  await connection
    .execute(`SELECT status,bantime FROM user WHERE uid = ${uid}`)
    .then((result) => {
      const data = result[0][0];

      if (data.status === 0) {
        logger.info(`获取封禁成功\n用户ID：${uid}`);
        res.status(200).json({
          status: 1,
          message: "用户未封禁",
        });
      } else {
        const bantime = new Date(data.bantime);
        if (new Date() > bantime) {
          connection
            .execute(
              `UPDATE user SET status = 0, bantime = null WHERE uid = ${uid}`
            )
            .then((result) => {
              logger.info(`获取封禁成功(已解封)\n用户ID：${uid}`);
              res.status(200).json({
                status: 1,
                message: "用户已解封",
              });
            });
        } else {
          logger.info(
            `获取封禁成功(未解封)\n用户ID：${uid} 封禁终止时间：${bantime.toLocaleDateString()}`
          );
          res.status(200).json({
            status: 1,
            message: `总封禁${
              data.status
            }个月，将于 ${bantime.toLocaleDateString()} 解封`,
          });
        }
      }
    })
    .catch((err) => {
      logger.error(`获取封禁失败：数据库错误\n${err}`);
      res
        .status(500)
        .json({
          status: 0,
          message: `获取封禁失败：${err.message}`,
        })
        .finally(() => {
          connection.end();
        });
    });
});

// 用户封禁（管理端）
// 被封禁用户的 uid、身份、需要被封禁的月数，以及执行该操作的管理员身份、口令
app.post("/ban", async (req, res) => {
  const admin_identity = req.user.identity;
  const { uid, identity, status, token: admin_token } = req.body;
  let currentTimestamp = new Date();
  const banTimestamp = new Date(
    currentTimestamp.setMonth(currentTimestamp.getMonth() + status)
  ).toLocaleString();

  try {
    if (
      !uid ||
      uid === "" ||
      identity === undefined ||
      admin_identity === undefined ||
      status === undefined
    )
      throw new Error("缺少必要参数");
    if (admin_identity < IDENTITY.ADMIN || identity >= admin_identity)
      throw new Error("权限不足");
    if (identity < IDENTITY.USER || identity > IDENTITY.SUPER_ADMIN)
      throw new Error("无效的权限等级");
    if (
      identity === IDENTITY.SUPER_ADMIN &&
      admin_token !== process.env.SUPER_TOKEN
    )
      throw new Error("管理员口令错误");
    if (status < 0) throw new Error("无效的封禁时长");
  } catch (err) {
    logger.error(`用户封禁失败：数据错误\n${err.message}`);
    res.status(403).json({
      status: 0,
      message: `用户封禁失败：${err.message}`,
    });
    return;
  }

  const connection = await createConnection();
  await connection
    .execute(
      `UPDATE user SET status = ${status}${
        status !== 0 ? `, bantime = '${banTimestamp}'` : ""
      } WHERE uid = ${uid}`
    )
    .then((result) => {
      logger.info(`用户${status !== 0 ? "封" : "解"}禁成功\n用户ID：${uid}`);
      res.status(200).json({
        status: 1,
        message: `用户${status !== 0 ? "封" : "解"}禁成功`,
      });
    })
    .catch((err) => {
      logger.error(
        `用户${status !== 0 ? "封" : "解"}禁失败：数据库错误\n${err}`
      );
      res.status(500).json({
        status: 0,
        message: `用户${status !== 0 ? "封" : "解"}禁失败：${err.message}`,
      });
    })
    .finally(() => connection.end());
});

// 用户注销
// 被注销用户的 uid、登录密码
app.post("/delete", async (req, res) => {
  // 默认使用请求数据中的 uid（管理端），如未提供则根据 token 解析结果的 uid
  const uid = req.body.uid ?? req.user.uid;

  const { password } = req.body;

  try {
    if (!uid || uid === "" || !password || password === "")
      throw new Error("用户名 ID 或密码为空");
  } catch (err) {
    logger.error(`注销失败：数据错误\n${err.message}`);
    res.status(403).json({
      status: 0,
      message: `注销失败：${err.message}`,
    });
    return;
  }

  const connection = await createConnection();
  await connection
    .execute(`DELETE FROM user WHERE uid = ${uid} AND password = '${password}'`)
    .then((result) => {
      if (result[0].affectedRows === 0) throw new Error("目标数据不存在");
      logger.info(`注销成功\n用户ID：${uid}`);
      res.status(200).json({
        status: 1,
        message: "注销成功",
      });
    })
    .catch((err) => {
      logger.error(`注销失败：数据库错误\n${err}`);
      res.status(500).json({
        status: 0,
        message: `注销失败：${err.message}`,
      });
    })
    .finally(() => connection.end());
});

// 获取用户信息
// 根据 token 解析管理员用户名，以及查询条件 uid、用户名、邮箱、电话、身份、封禁状态
app.post("/search", async (req, res) => {
  const admin_username = req.user.username;
  const { uid, username, email, phone, identity, status } = req.body;

  try {
    if (!admin_username || admin_username === "")
      throw new Error("缺少必要参数");
    if (
      !Number.isInteger(uid) ||
      !Number.isInteger(identity) ||
      !Number.isInteger(status)
    )
      throw new Error("数据类型错误");
  } catch (err) {
    logger.error(`获取所有用户信息失败：数据错误\n${err.message}`);
    res.status(403).json({
      status: 0,
      message: `获取所有用户信息失败：${err.message}`,
    });
    return;
  }

  const connection = await createConnection();
  await connection
    .execute(
      `SELECT identity,status FROM user WHERE username = '${admin_username}'`
    )
    .then((result) => {
      if (result[0].length !== 1) throw new Error("用户不存在");
      if (result[0].identity < IDENTITY.ADMIN)
        throw new Error("非管理员用户权限不足");
      if (result[0].status > 0) throw new Error("用户已被封禁");

      let conditions = [];
      if (result[0].identity === IDENTITY.ADMIN)
        conditions.push(`identity < ${IDENTITY.SUPER_ADMIN}`);
      if (uid !== 0) conditions.push(`uid = ${uid}`);
      if (username !== "")
        conditions.push(`username LIKE '%${username.replace(/ /g, "%")}%'`);
      if (email !== "") conditions.push(`email LIKE '%${email}%'`);
      if (phone !== "") conditions.push(`phone LIKE '%${phone}%'`);
      if (identity !== -1) conditions.push(`identity = ${identity}`);
      if (status !== -1) {
        if (status === 0) conditions.push(`status = 0`);
        else conditions.push(`status > 0`);
      }
      const condition =
        conditions.length > 0 ? conditions.join(" AND ") : "1 = 1";
      connection
        .execute(
          `SELECT uid,username,identity,status,email,phone,createtime,updatetime,bantime FROM user WHERE ${condition}`
        )
        .then((result) => {
          logger.info(
            `获取用户信息成功\n用户：${admin_username} 获取到用户总数：${result[0].length}`
          );
          res.status(200).json({
            status: 1,
            message: "获取用户信息成功",
            data: result[0],
          });
        })
        .catch((err) => {
          logger.error(`获取用户信息失败：数据库错误\n${err}`);
          res.status(500).json({
            status: 0,
            message: `获取用户信息失败：${err.message}`,
          });
        });
    })
    .catch((err) => {
      logger.error(`验证用户信息失败：数据库错误\n${err}`);
      res.status(500).json({
        status: 0,
        message: `验证用户信息失败：${err.message}`,
      });
    })
    .finally(() => connection.end());
});

// 获取日志信息
/*app.get("/log", async (req, res) => {
  reader().then((result) => {
    res.status(200).json({
      status: 1,
      message: "文件读取完毕",
      data: result,
    });
  }).catch(err => {
    res.status(200).json({
      status: 0,
      message: err.message
    })
  })
});*/

// 非正确接口请求
app.get("/*", (req, res) => {
  res.status(404).json({
    status: 0,
    message: "目标接口不存在",
  });
});
app.post("/*", (req, res) => {
  res.status(404).json({
    status: 0,
    message: "目标接口不存在",
  });
});

app.listen(port, () => logger.log(`Express 服务器在端口 ${port} 成功启动！`));
