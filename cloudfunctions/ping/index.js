const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

function payload() {
  return {
    ok: true,
    service: "kaixin-studay",
    function: "ping",
  };
}

/**
 * 普通云函数（微信开发者工具可直接上传）。
 * 入口：https://developers.weixin.qq.com/miniprogram/dev/wxcloud/guide/functions/getting-started.html
 * 验收：控制台「云端测试」，不必先有公网 URL。
 */
exports.main = async (event) => {
  const method = (event.httpMethod || event.requestContext?.http?.method || "").toUpperCase();
  if (method && method !== "GET" && method !== "HEAD" && method !== "") {
    return {
      statusCode: 405,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ ok: false, error: "method_not_allowed" }),
    };
  }
  if (event.httpMethod || event.requestContext?.http) {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload()),
    };
  }
  return payload();
};
