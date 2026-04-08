/*
 * @Author: xsd
 * @Github:
 * @FilePath: /InstanceServer/src/util/LoggerCsvDateRollingAppender.js
 * @Date: 2024-11-08 14:53:32
 * @LastEditors: lyh
 * @LastEditTime: 2024-11-11 17:25:11
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const os = require("os");
const streams = require("streamroller");

const eol = os.EOL;

class CsvDateRollingFileStream extends streams.DateRollingFileStream {
  constructor(filename, pattern, options) {
    super(filename, pattern, options);
    this.writerHeader();
  }

  async _roll() {
    await super._roll();
    this.writerHeader();
  }

  _renewWriteStream() {
    const filePath = this.fileFormatter({
      date: this.state.currentDate,
      index: 0,
    });

    this.fileExsited = false;
    if (fs.existsSync(filePath)) {
      this.fileExsited = true;
    }

    super._renewWriteStream();
  }

  writerHeader() {
    if (this.fileExsited) {
      return;
    }
    if (!super._write(this.options.header.join(",") + eol, "utf8", () => {})) {
      process.emit("log4js:pause", true);
    }
  }
}

function openTheStream(filename, pattern, options) {
  // const stream = new streams.DateRollingFileStream(filename, pattern, options);
  const stream = new CsvDateRollingFileStream(filename, pattern, options);
  stream.on("error", (err) => {
    console.error(
      "log4js.dateFileAppender - Writing to file %s, error happened ",
      filename,
      err
    );
  });
  stream.on("drain", () => {
    process.emit("log4js:pause", false);
  });
  return stream;
}

/**
 * File appender that rolls files according to a date pattern.
 * @param filename base filename.
 * @param pattern the format that will be added to the end of filename when rolling,
 *          also used to check when to roll files - defaults to '.yyyy-MM-dd'
 * @param layout layout function for log messages - defaults to basicLayout
 * @param options - options to be passed to the underlying stream
 * @param timezoneOffset - optional timezone offset in minutes (default system local)
 */
function appender(filename, pattern, layout, options, timezoneOffset) {
  // the options for file appender use maxLogSize, but the docs say any file appender
  // options should work for dateFile as well.
  options.maxSize = options.maxLogSize;

  const writer = openTheStream(filename, pattern, options);

  const app = function (logEvent) {
    if (!writer.writable) {
      return;
    }

    if (!writer.write(layout(logEvent, timezoneOffset) + eol, "utf8")) {
      process.emit("log4js:pause", true);
    }
  };

  app.shutdown = function (complete) {
    writer.end("", "utf-8", complete);
  };

  return app;
}

function configure(config, layouts) {
  let layout = layouts.basicLayout;
  if (config.layout) {
    layout = layouts.layout(config.layout.type, config.layout);
  }

  if (!config.alwaysIncludePattern) {
    config.alwaysIncludePattern = false;
  }

  // security default (instead of relying on streamroller default)
  config.mode = config.mode || 0o600;

  return appender(
    config.filename,
    config.pattern,
    layout,
    config,
    config.timezoneOffset
  );
}

module.exports.configure = configure;
