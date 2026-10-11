// Edit developer contacts here. This file is independent of interface text and layout.
var ST_APP_DEVELOPERS = [
  {
    "name": "Developer 1",
    "email": "developer1@example.com"
  },
  {
    "name": "Developer 2",
    "email": "developer2@example.com"
  },
  {
    "name": "Developer 3",
    "email": "developer3@example.com"
  }
];

function getAppDevelopers_() {
  return ST_APP_DEVELOPERS.map(function(developer) {
    return {name:String(developer.name || ''),email:String(developer.email || '').trim()};
  });
}
