(function(module) {
  "use strict";


  var user = module.parent.require('./user.js'),
      db = module.parent.require('../src/database.js'),
      meta = module.parent.require('./meta'),
      passport = module.parent.require('passport'),
      passportSteam = require('passport-steam').Strategy,
      http = module.parent.require('http'),
      winston = module.parent.require('winston');

  var constants = Object.freeze({
    'name': 'Steam',
    'admin': {
      'route': '/steam',
      'icon': 'fa-steam'
    }
  });

  var Steam = {};

  Steam.getStrategy = function(strategies, callback) {

    meta.settings.get('sso-steam', function(err, config) {
      var clientApiKey = config.apiKey;
      if (!clientApiKey) {
        winston.warn('[plugins/sso-steam] Please complete Steam SSO setup at: /admin/plugins/sso-steam');
        callback(null, strategies);
        return;
      }

      passport.use(new passportSteam({
        returnURL: module.parent.require('nconf').get('url') + '/auth/steam/callback',
        realm: module.parent.require('nconf').get('url'),
        apiKey: clientApiKey
      }, function(identifier, profile, done) {
        process.nextTick(function () {
          // As Steam Passport does't not provide the username, steamid and avatar information, we have to get from Steam API using http get request.
          var
              Steam64Id = identifier.replace('http://steamcommunity.com/openid/id/', ''),
              apiUrl = 'http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=' + clientApiKey + '&steamids=' + Steam64Id,
              player = {};

          http.get(apiUrl, function(res) {
            res.on('data', function(chunck){
              var responseObj = JSON.parse(chunck.toString());
              player.id = responseObj.response.players[0].steamid;
              player.username = responseObj.response.players[0].personaname;
              player.avatar = responseObj.response.players[0].avatarfull;
              player.profileurl = responseObj.response.players[0].profileurl;

              Steam.login(player.id, player.username, player.avatar, player.profileurl, function(err, user) {
                if (err) {
                  return done(err);
                }
                done(null, user);
              });

            });
          }).on('error', function(e) {
            console.log('problem with request: ' + e.message);
          });
        });
      }));

      strategies.push({
        name: 'steam',
        url: '/auth/steam',
        callbackURL: '/auth/steam/callback',
        icon: 'fa-steam',
        scope: 'user:username'
      });

      callback(null, strategies);
    });
  };

  Steam.login = function(steamID, username, avatar, profileUrl, callback) {
    Steam.getUidBySteamID(steamID, function(err, uid) {
      if(err) {
        return callback(err);
      }

      if (uid !== null) {
        // Existing User
        callback(null, {
          uid: uid
        });
      } else {
        // New User
        user.create({username: username}, function(err, uid) {
          if (err !== null) {
            callback(err);
          } else {
            // Save steam-specific information to the user
            user.setUserField(uid, 'steamid', steamID);
            user.setUserField(uid, 'profileurl', profileUrl);
            db.setObjectField('steamid:uid', steamID, uid);


            // Save their avatar
            user.setUserField(uid, 'uploadedpicture', avatar);
            user.setUserField(uid, 'picture', avatar);

            callback(null, {
              uid: uid
            });
          }
        });
      }
    });
  };

  Steam.getUidBySteamID = function(steamID, callback) {
    db.getObjectField('steamid:uid', steamID, function(err, uid) {
      if (err !== null) {
        return callback(err);
      }
      callback(null, uid);
    });
  };

  Steam.addMenuItem = function(custom_header, callback) {
    custom_header.authentication.push({
      "route": constants.admin.route,
      "icon": constants.admin.icon,
      "name": constants.name
    });

    callback(null, custom_header);
  };

  function renderAdmin(req, res, callback) {
    res.render('sso/steam/admin', {});
  }

  Steam.init = function(data, callback) {
    data.router.get('/admin/steam', data.middleware.admin.buildHeader, renderAdmin);
    data.router.get('/api/admin/steam', renderAdmin);

    callback();
  };

  module.exports = Steam;
}(module));
