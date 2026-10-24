/* ---------------------------------------------------------------------------
   Boot
   --------------------------------------------------------------------------- */
async function boot(){
  setShell({ hide: true });
  view.className = "view onboarding";
  view.innerHTML =
    '<div class="onboard">' +
      '<div class="onboard-top">' +
        '<span class="wordmark"><span class="wordmark-name">Sparkling</span><span class="wordmark-dots" aria-hidden="true"><span class="wordmark-dot"></span><span class="wordmark-dot"></span><span class="wordmark-dot"></span></span></span>' +
      "</div>" +
      '<p class="onboard-status" role="status">Opening your notebook.</p>' +
    "</div>";
  try {
    const me = await api("/api/me");
    if (!me || !me.user) {
      const err = new Error("no session");
      err.status = 401;
      throw err;
    }
    state.user = me.user;
    state.inboxCount = Number(me.inbox_count) || 0;
    state.bootError = null;
    state.bootNotice = null;
    syncPrefsFromServer();
    if (me.did_you_go && me.did_you_go.plan_id && me.did_you_go.place) {
      writeDidYouGo({
        plan_id: String(me.did_you_go.plan_id),
        place: String(me.did_you_go.place),
        label: String(me.did_you_go.label || "your plan"),
      });
    } else {
      clearDidYouGo();
    }
  } catch (e) {
    if (e && e.status === 401) {
      state.user = null;
      state.bootError = null;
    } else {
      state.bootError = "Your notebook could not be reached just now. Try again in a moment.";
    }
  } finally {
    state.booted = true;
    route();
  }
}

