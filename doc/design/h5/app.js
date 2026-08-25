(function () {
  var screens = document.querySelectorAll(".screen");
  var tabs = document.querySelectorAll(".tab");
  var clockEl = document.getElementById("clock");
  var stateEl = document.getElementById("timerState");
  var btnStart = document.getElementById("btnStart");
  var btnPause = document.getElementById("btnPause");
  var btnStop = document.getElementById("btnStop");

  var elapsed = 0;
  var running = false;
  var tick = null;
  var subject = "数学";

  function show(id) {
    screens.forEach(function (s) {
      s.classList.toggle("on", s.id === id);
    });
    var screen = document.getElementById(id);
    var tab = screen && screen.getAttribute("data-tab");
    if (tab) {
      tabs.forEach(function (t) {
        t.classList.toggle("on", t.getAttribute("data-tab") === tab);
      });
    }
    document.querySelector(".screens").scrollTop = 0;
  }

  function fmt(sec) {
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    return [h, m, s].map(function (n) {
      return String(n).padStart(2, "0");
    }).join(":");
  }

  function renderClock() {
    if (clockEl) clockEl.textContent = fmt(elapsed);
  }

  document.body.addEventListener("click", function (e) {
    var go = e.target.closest("[data-go]");
    if (go) {
      show(go.getAttribute("data-go"));
      return;
    }
    var tab = e.target.closest(".tab");
    if (tab) {
      show(tab.getAttribute("data-tab"));
      return;
    }
    var chip = e.target.closest("#subjChips .chip");
    if (chip) {
      document.querySelectorAll("#subjChips .chip").forEach(function (c) {
        c.classList.toggle("on", c === chip);
      });
      subject = chip.getAttribute("data-s");
      return;
    }
    var opt = e.target.closest(".opt");
    if (opt) {
      opt.parentElement.querySelectorAll(".opt").forEach(function (o) {
        o.classList.remove("on");
      });
      opt.classList.add("on");
      return;
    }
    var filter = e.target.closest(".filter");
    if (filter) {
      filter.parentElement.querySelectorAll(".filter").forEach(function (f) {
        f.classList.toggle("on", f === filter);
      });
    }
  });

  if (btnStart) {
    btnStart.addEventListener("click", function () {
      if (running) return;
      running = true;
      stateEl.textContent = "计时中 · " + subject;
      stateEl.className = "tag";
      tick = setInterval(function () {
        elapsed += 1;
        renderClock();
      }, 1000);
    });
  }
  if (btnPause) {
    btnPause.addEventListener("click", function () {
      if (!running && elapsed === 0) return;
      running = false;
      clearInterval(tick);
      stateEl.textContent = "已暂停";
      stateEl.className = "tag warn";
    });
  }
  if (btnStop) {
    btnStop.addEventListener("click", function () {
      running = false;
      clearInterval(tick);
      stateEl.textContent = "本段已结束 " + fmt(elapsed);
      stateEl.className = "tag";
      elapsed = 0;
      renderClock();
    });
  }

  renderClock();
})();
