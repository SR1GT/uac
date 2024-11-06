const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const readline = require("readline");

async function findLogFiles(directoryPath) {
  let logFiles = [];
  const files = await fsp.readdir(directoryPath, { withFileTypes: true });
  for (const dirent of files) {
    const fullPath = path.join(directoryPath, dirent.name);
    if (dirent.isDirectory()) {
      const subLogFiles = await findLogFiles(fullPath);
      logFiles = logFiles.concat(subLogFiles);
    } else if (
      dirent.isFile() &&
      path.extname(dirent.name).toLowerCase() === ".log"
    ) {
      logFiles.push(fullPath);
    }
  }
  return logFiles;
}

async function readFiles() {
  const logFiles = await findLogFiles(__dirname);
  let records = [];
  for (let filePath of logFiles) {
    const readStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: readStream,
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      if (line[0] === "[") {
        const arr = line.split(" ");
        records.push({
          status: arr[0].slice(1, -1),
          date: arr[1],
          datetime: arr[2],
          file: arr[3].slice(0, -1),
          message: arr[4],
          remark: "",
        });
      } else {
        records[records.length - 1].remark = line;
      }
    });

    rl.on("close", () => {
      return
    });

    readStream.on("error", (err) => {
      records = [];
      throw new Error(`读取文件时发生错误：${err}`);
    });
  }
  return records;
}

export default async function reader() {
  const content = await readFiles()
  console.log(content)
  return content
}
