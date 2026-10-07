function requireCurrentUser_() {
  var email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  var effectiveEmail = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) {
    throw createSimulatorError_(
      'IDENTITY_UNAVAILABLE',
      'Sign in with your Google account. The web app must be deployed to execute as User accessing the web app, and each user must authorize it.'
    );
  }

  // Reject owner-executed deployments before reading settings, keys or Drive.
  if (!effectiveEmail || effectiveEmail !== email) {
    throw createSimulatorError_('DEPLOYMENT_IDENTITY_MISMATCH', 'This deployment is running under another Google account. The developer must redeploy with Execute as: User accessing the web app. No account settings or Drive data were loaded.');
  }

  var allowedEmails = getAllowedUserEmails_();
  if (allowedEmails.length > 0 && allowedEmails.indexOf(email.toLowerCase()) === -1) {
    throw createSimulatorError_('ACCESS_DENIED', 'This Google user is not allowed to use the console.');
  }

  return { email: email.toLowerCase() };
}

function getAllowedUserEmails_() {
  var raw = PropertiesService.getScriptProperties().getProperty('ALLOWED_USER_EMAILS_JSON');
  if (!raw) return [];

  try {
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(function(email) { return typeof email === 'string'; }).map(function(email) { return email.toLowerCase(); })
      : [];
  } catch (error) {
    throw createSimulatorError_('INVALID_GLOBAL_CONFIGURATION', 'ALLOWED_USER_EMAILS_JSON must contain a JSON array of email addresses.');
  }
}
