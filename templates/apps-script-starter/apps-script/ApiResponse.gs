function appError_(code, message) {
  var error = new Error(message);
  error.appError = {code: code, message: message};
  return error;
}
function api_(action) {
  try { return {ok: true, data: action(requireAccount_())}; }
  catch (error) {
    if (error.appError) return {ok: false, error: error.appError};
    console.error(error);
    return {ok: false, error: {code: 'REQUEST_FAILED', message: 'The request could not be completed. Check access and try again.'}};
  }
}
function withUserLock_(action) {
  var lock = LockService.getUserLock();
  if (!lock.tryLock(10000)) throw appError_('BUSY', 'Another save is in progress. Please try again.');
  try { return action(); } finally { lock.releaseLock(); }
}
