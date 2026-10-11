function requireAccount_() {
  var email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  var effective = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) throw appError_('ACCOUNT_REQUIRED', 'Authorize this app with your account to continue.');
  if (email !== effective) throw appError_('DEPLOYMENT_IDENTITY', 'This app must run as the user accessing it. Ask the app owner to update the deployment.');
  return {email: email};
}
