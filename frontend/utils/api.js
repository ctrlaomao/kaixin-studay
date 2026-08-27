const ENV = "cloudbase-d7ggaqrps717e5be9";

function call(name, data = {}, timeout) {
  const opts = { name, data };
  if (timeout) opts.timeout = timeout;
  return wx
    .cloud.callFunction(opts)
    .then((res) => res.result || { ok: false, error: "empty" })
    .catch((err) => ({
      ok: false,
      error: "call_failed",
      message: (err && (err.errMsg || err.message)) || String(err),
    }));
}

module.exports = {
  ENV,
  ping: () => call("ping"),
  child: {
    ensureSolo: () => call("childProfile", { action: "ensureSolo" }),
    create: (data) => call("childProfile", { action: "create", ...data }),
    list: (data) => call("childProfile", { action: "list", ...data }),
    update: (data) => call("childProfile", { action: "update", ...data }),
    setTextbook: (data) => call("childProfile", { action: "setTextbook", ...data }),
    setProgress: (data) => call("childProfile", { action: "setProgress", ...data }),
    getTextbooks: (data) => call("childProfile", { action: "getTextbooks", ...data }),
  },
  family: {
    create: (data) => call("familyBind", { action: "createFamily", ...data }),
    invite: (data) => call("familyBind", { action: "createInvite", ...data }),
    join: (data) => call("familyBind", { action: "joinFamily", ...data }),
    me: () => call("familyBind", { action: "me" }),
  },
  timer: {
    start: (data) => call("timer", { action: "start", ...data }),
    pause: (data) => call("timer", { action: "pause", ...data }),
    resume: (data) => call("timer", { action: "resume", ...data }),
    end: (data) => call("timer", { action: "end", ...data }),
  },
  homework: {
    createBatch: (data) => call("homeworkBatch", { action: "create", ...data }),
    listBatches: (data) => call("homeworkBatch", { action: "list", ...data }),
    getBatch: (data) => call("homeworkBatch", { action: "get", ...data }),
    recognizeStart: (data) => call("recognizeHomework", { action: "start", ...data }),
    kickRecognize: (jobId) => {
      wx.cloud.callFunction({
        name: "recognizeHomework",
        data: { action: "run", jobId },
        timeout: 60000,
        config: { env: ENV, timeout: 60000 },
      });
    },
  },
  catalog: {
    editions: (data) => call("catalogRead", { action: "listEditions", ...data }),
    lessons: (data) => call("catalogRead", { action: "listLessons", ...data }),
  },
  wrong: {
    create: (data) => call("wrongItem", { action: "create", ...data }),
    list: (data) => call("wrongItem", { action: "list", ...data }),
    updateLesson: (data) => call("wrongItem", { action: "updateLesson", ...data }),
  },
  practice: {
    compose: (data) => call("practiceCompose", data),
    submit: (data) => call("practiceSubmit", data),
    gap: (data) => call("gapDetect", data),
  },
  mastery: {
    overview: (data) => call("masteryOverview", { action: "overview", ...data }),
    fullStarCount: (data) => call("masteryOverview", { action: "fullStarCount", ...data }),
  },
  exam: {
    compose: (data) => call("examCompose", data),
    submit: (data) => call("examSubmit", data),
  },
};
